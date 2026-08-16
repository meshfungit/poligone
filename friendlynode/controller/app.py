"""Controller application object."""

from __future__ import annotations
import json
import subprocess
import sys
from typing import Any
from friendlynode.config.app_config import AppConfig
from friendlynode.config.defaults import (
    DEFAULT_LXMF_SETTINGS_PATH,
    DEFAULT_PROPAGATION_NODES_PATH,
    IMPORT_EXPORT_DIR,
    INTERFACES_EXPORT_PATH,
)
from friendlynode.propagation import PropagationNodeStore
from friendlynode.lxmf_settings import (
    MESSAGE_MODE_DIRECT,
    MESSAGE_MODE_PROPAGATION,
    LxmfSettingsStore,
)
from friendlynode.controller.access import (
    build_channel_security_status,
    build_network_interfaces_status,
    build_ssh_access_status,
)
from friendlynode.controller.engine_supervisor import EngineSupervisor
from friendlynode.controller.runtime_manager import RuntimeInfo, RuntimeManager
from friendlynode.controller.state_cache import StateCache
from friendlynode.config.rns_config_editor import load_rns_config, save_rns_config
from friendlynode.engine.events import EngineEvent


DEFAULT_ANNOUNCE_LIMIT = 500
MAX_ANNOUNCE_LIMIT = 2000
NOMADNET_DEFAULT_PATH = "/page/index.mu"
LXMF_IMPORT_NAME = "LXMF"
LXMF_PACKAGE_NAME = "lxmf"
RUNTIME_PACKAGE_INSTALL_TIMEOUT_SECONDS = 180
RUNTIME_INSTALL_OUTPUT_LIMIT = 1400
CLIENT_API_RUNTIME_MODE = "shared"
CLIENT_API_RUNTIME_MODES = (CLIENT_API_RUNTIME_MODE,)
LXMF_ORPHANED_ON_START_ERROR = "FriendlyNode restarted before LXMF delivery completed"
LXMF_WORKER_EXITED_ERROR = "LXMF worker ended before delivery completed"
ANNOUNCE_TYPE_BY_ASPECT = {
    "lxmf.delivery": "identity",
    "lxmf.propagation": "lxmf.propagation",
    "lxmf.propagation.control": "lxmf.propagation.control",
    "nomadnetwork.node": "nomadnet",
    "call.audio": "call.audio",
    "lxst.telephony": "phonex",
    "rnstransport.discovery.interface": "interface",
    "rnstransport.probe": "rnstransport.probe",
    "rncp.receive": "rncp.receive",
    "rnx.execute": "rnx.execute",
    "rserver.web": "rserver",
    "retibbs.bbs": "bbs",
    "styrene.tui.operator": "styrene",
}

ANNOUNCE_DEFAULT_NAME_PREFIX = {
    "identity": "Identity",
    "lxmf.propagation": "Propagation",
    "lxmf.propagation.control": "PropControl",
    "nomadnet": "NomadNet node",
    "interface": "Interface",
    "call.audio": "call.audio",
    "phonex": "PhoneX",
    "rnstransport.probe": "Probe",
    "rncp.receive": "FileTransfer",
    "rnx.execute": "RemoteExec",
    "rserver": "RServer",
    "bbs": "BBS",
    "styrene": "Styrene",
    "service-hub": "ServiceHub",
    "endpoint": "Endpoint",
    "mission": "Mission",
    "beacon": "Beacon",
    "telemetry": "Telemetry",
    "transport": "Transport",
    "peer": "Peer",
}

ANNOUNCE_JSON_NAME_KEYS = (
    "server_name",
    "name",
    "display_name",
    "nickname",
    "node_name",
    "missionName",
    "callsign",
    "ep",
)

ANNOUNCE_JSON_TYPE_RULES = (
    (("server_name",), "bbs"),
    (("services", "name"), "service-hub"),
    (("ep",), "endpoint"),
    (("missionName",), "mission"),
    (("callsign", "role"), "mission"),
)

ANNOUNCE_TEXT_TYPE_PREFIXES = (
    ("styrene:", "styrene"),
    ("anonmesh::beacon", "beacon"),
    ("RServer ", "rserver"),
)

ANNOUNCE_TEXT_TYPE_SUBSTRINGS = (
    ("Telemetry", "telemetry"),
    ("EMergencyMessages", "telemetry"),
)

class ControllerApp:
    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or AppConfig.load()
        self.state = StateCache()
        self.runtime_manager = RuntimeManager()
        self.propagation_store = PropagationNodeStore(DEFAULT_PROPAGATION_NODES_PATH)
        self.lxmf_settings_store = LxmfSettingsStore(DEFAULT_LXMF_SETTINGS_PATH)

        self.client_store: Any | None = None
        self.client_contact_store: Any | None = None
        self.nomadnet_browser_store: Any | None = None

        if self.config.client_enabled:
            from friendlynode.client_contacts import ClientContactStore
            from friendlynode.local_identities import LocalIdentityStore

            self.client_store = LocalIdentityStore(self.config.local_identities_dir)
            self.client_contact_store = ClientContactStore(self.config.local_identities_dir)

        if self.config.nomadnet_enabled:
            from friendlynode.nomadnet_browser_store import NOMADNET_BROWSER_STATE_FILENAME, NomadNetBrowserStore

            self.nomadnet_browser_store = NomadNetBrowserStore(
                self.config.database_path.parent / NOMADNET_BROWSER_STATE_FILENAME
            )

        self.engine_supervisor = EngineSupervisor(self.config, self._handle_engine_event)

    def start(self) -> None:
        self.config.ensure_dirs()
        self.state.append_log("info", "controller", "controller start requested")

        if self.client_contact_store is not None:
            failed_count = self.client_contact_store.fail_pending_outbound_messages(
                None,
                LXMF_ORPHANED_ON_START_ERROR,
            )

            if failed_count > 0:
                self.state.append_log(
                    "warning",
                    "client",
                    f"Marked {failed_count} orphaned outbound LXMF message(s) as failed",
                )
                self.state.notify_client_change()

        runtime = self._apply_active_runtime()
        self.state.append_log(
            "info",
            "runtime",
            f"active runtime resolved: name={runtime.name}, kind={runtime.kind}",
        )

        if not self._preflight_runtime_dependencies(runtime):
            self.engine_supervisor.stop()
            self.state.append_log(
                "error",
                "controller",
                "controller started without Reticulum engine: runtime dependency preflight failed",
            )
            return

        self.engine_supervisor.start()
        self.state.append_log("info", "controller", "controller started")
    def stop(self) -> None:
        self.state.append_log("info", "controller", "controller stop requested")
        self.engine_supervisor.stop()
        self.state.append_log("info", "controller", "controller stopped")

    def restart_reticulum(self) -> None:
        self.state.append_log("info", "controller", "Reticulum restart requested")

        runtime = self._apply_active_runtime()
        self.state.append_log(
            "info",
            "runtime",
            f"active runtime resolved: name={runtime.name}, kind={runtime.kind}",
        )

        if not self._preflight_runtime_dependencies(runtime):
            self.engine_supervisor.stop()
            self.state.append_log(
                "error",
                "controller",
                "Reticulum restart skipped: runtime dependency preflight failed",
            )
            return

        self.engine_supervisor.restart_reticulum()
        self.state.append_log("info", "controller", "Reticulum restart completed")

    def make_announce(self, payload: dict[str, object]) -> dict[str, object]:
        target = str(payload.get("target") or "transport")
        interface_name = str(payload.get("interface_name") or "").strip()
        self.state.append_log(
            "info",
            "announce",
            f"manual announce requested: target={target}, interface={interface_name or '*'}",
        )
        result = self.engine_supervisor.make_announce(
            target=target,
            interface_name=interface_name or None,
        )
        self.state.append_log(
            "info",
            "announce",
            f"manual announce result: status={result.get('status')}, sent={result.get('sent', 0)}",
        )
        return result

    def select_runtime(self, runtime_name: str) -> RuntimeInfo:
        self.state.append_log("info", "runtime", f"runtime selection requested: {runtime_name}")

        runtime = self.runtime_manager.get_runtime(runtime_name)

        if not runtime.enabled:
            raise RuntimeError(f"Runtime is disabled: {runtime.name}")

        self.config.set_engine_name(runtime.name)
        runtime = self._apply_active_runtime()

        self.state.append_log(
            "info",
            "runtime",
            f"runtime selected: name={runtime.name}, kind={runtime.kind}; process restart required",
        )

        return runtime

    def install_reticulum_release(self, version: str) -> RuntimeInfo:
        self.state.append_log("info", "runtime", f"Reticulum install requested: {version}")

        runtime = self.runtime_manager.install_reticulum_release(version)
        self.config.set_engine_name(runtime.name)
        runtime = self._apply_active_runtime()

        self.state.append_log(
            "info",
            "runtime",
            f"Reticulum runtime installed and selected: name={runtime.name}, version={runtime.release_version}; process restart required",
        )

        return runtime

    def install_lxmf_release(self, version: str) -> dict[str, object]:
        self.state.append_log("info", "runtime", f"LXMF install requested: {version}")

        runtime = self._apply_active_runtime()

        if runtime.release_version == "":
            raise ValueError("A managed Reticulum release must be active before installing LXMF")

        lxmf_runtime = self.runtime_manager.install_lxmf_release(
            version,
            rns_version=runtime.release_version,
        )

        self.config.lxmf_source_path = (
            lxmf_runtime.source_path
            if lxmf_runtime.installed
            else None
        )

        self.state.append_log(
            "info",
            "runtime",
            (
                "LXMF runtime installed: "
                f"name={lxmf_runtime.name}, version={lxmf_runtime.release_version}; "
                "process restart required"
            ),
        )

        return self.runtime_manager.get_lxmf_status(runtime.release_version)

    def set_runtime_feature(self, runtime_name: str, feature_name: str, enabled: bool) -> RuntimeInfo:
        self.state.append_log(
            "info",
            "runtime",
            f"runtime feature change requested: runtime={runtime_name}, feature={feature_name}, enabled={enabled}",
        )

        runtime = self.runtime_manager.set_runtime_feature(runtime_name, feature_name, enabled)

        if runtime.name == self.config.engine_name:
            self.engine_supervisor.restart()
            self.state.append_log("info", "controller", "Reticulum restart completed")

        return runtime

    def get_runtime_overview(self) -> dict[str, object]:
        runtimes = self.runtime_manager.list_runtimes()
        active_runtime_name = self.config.engine_name
        active_runtime = next(
            (runtime for runtime in runtimes if runtime.name == active_runtime_name),
            None,
        )
        active_rns_version = (
            active_runtime.release_version
            if active_runtime is not None
            else ""
        )

        return {
            "active": active_runtime_name,
            "available": [runtime.to_dict() for runtime in runtimes],
            "releases": self.runtime_manager.list_reticulum_releases(),
            "lxmf": self.runtime_manager.get_lxmf_status(active_rns_version),
            "interface_capabilities": self._build_runtime_interface_capabilities(active_runtime),
        }

    def get_lxmf_release_overview(self) -> dict[str, object]:
        runtime = self._apply_active_runtime()

        return {
            "active_rns_version": runtime.release_version,
            "lxmf": self.runtime_manager.get_lxmf_status(runtime.release_version),
            "releases": self.runtime_manager.list_lxmf_releases(),
        }

    def get_rns_config(self) -> dict[str, object]:
        parsed_config = load_rns_config(self.config.rns_config_dir)
        return parsed_config.to_dict()

    def save_rns_config(self, payload: dict[str, object]) -> dict[str, object]:
        parsed_config = save_rns_config(self.config.rns_config_dir, payload)
        self.state.append_log("info", "rns-config", "Reticulum config saved")

        return parsed_config.to_dict()

    def export_rns_interfaces(self) -> dict[str, object]:
        parsed_config = load_rns_config(self.config.rns_config_dir)

        export_payload = {
            "format": "friendlynode.reticulum.interfaces",
            "version": 1,
            "interfaces": parsed_config.interfaces,
        }

        IMPORT_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        INTERFACES_EXPORT_PATH.write_text(
            json.dumps(export_payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )

        self.state.append_log(
            "info",
            "rns-config",
            f"Reticulum interfaces exported to {INTERFACES_EXPORT_PATH}",
        )

        return {
            "status": "exported",
            "path": str(INTERFACES_EXPORT_PATH),
            "relative_path": "data/import-export/interfaces-export.json",
        }

    def import_rns_interfaces(self, payload: dict[str, object]) -> dict[str, object]:
        if payload.get("format") != "friendlynode.reticulum.interfaces":
            raise ValueError("Unsupported interfaces export format")

        if int(payload.get("version") or 0) != 1:
            raise ValueError("Unsupported interfaces export version")

        interfaces = payload.get("interfaces")

        if not isinstance(interfaces, list):
            raise ValueError("Interfaces export must contain an interfaces list")

        self.state.append_log(
            "info",
            "rns-config",
            f"Reticulum interfaces imported into editor: count={len(interfaces)}",
        )

        return {
            "status": "imported",
            "interfaces": interfaces,
            "message": "Interfaces imported into editor. Press Save interfaces to apply.",
        }

    def list_rns_interface_import_files(self) -> dict[str, object]:
        IMPORT_EXPORT_DIR.mkdir(parents=True, exist_ok=True)

        files = []

        for path in sorted(IMPORT_EXPORT_DIR.glob("*.json")):
            if not path.is_file():
                continue

            files.append(
                {
                    "filename": path.name,
                    "path": str(path),
                    "relative_path": f"data/import-export/{path.name}",
                    "size": path.stat().st_size,
                }
            )

        return {
            "files": files,
            "directory": str(IMPORT_EXPORT_DIR),
            "relative_directory": "data/import-export",
        }

    def import_rns_interfaces_from_file(self, filename: str) -> dict[str, object]:
        clean_name = str(filename or "").strip()

        if clean_name == "":
            raise ValueError("Import filename is empty")

        path = IMPORT_EXPORT_DIR / clean_name
        resolved_dir = IMPORT_EXPORT_DIR.resolve()
        resolved_path = path.resolve()

        if resolved_dir not in resolved_path.parents:
            raise ValueError("Import file must be inside data/import-export")

        if resolved_path.suffix.lower() != ".json":
            raise ValueError("Import file must be .json")

        if not resolved_path.is_file():
            raise FileNotFoundError(f"Import file was not found: {clean_name}")

        payload = json.loads(resolved_path.read_text(encoding="utf-8"))
        result = self.import_rns_interfaces(payload)
        result["source_file"] = str(resolved_path)
        result["source_relative_path"] = f"data/import-export/{resolved_path.name}"

        return result

    def save_app_config(self, payload: dict[str, object]) -> dict[str, object]:
        changed_controller_bind = False

        next_lxmf_enabled = bool(
            payload.get("lxmf_enabled", self.config.lxmf_enabled)
        )
        next_client_enabled = bool(
            payload.get("client_enabled", self.config.client_enabled)
        )

        if next_client_enabled and not next_lxmf_enabled:
            raise ValueError("client_enabled requires lxmf_enabled")

        if "controller_host" in payload:
            host = str(payload.get("controller_host") or "").strip()
            if host == "":
                raise ValueError("controller_host cannot be empty")
            self.config.controller_host = host
            changed_controller_bind = True

        if "controller_port" in payload:
            port = int(payload.get("controller_port") or 0)
            if port < 1 or port > 65535:
                raise ValueError("controller_port must be between 1 and 65535")
            self.config.controller_port = port
            changed_controller_bind = True

        if changed_controller_bind:
            self.config.save()
            self.state.append_log(
                "info",
                "config",
                f"Controller bind changed: {self.config.controller_host}:{self.config.controller_port}",
            )

        if "ssh_access_enabled" in payload:
            self.config.set_ssh_access_enabled(bool(payload.get("ssh_access_enabled")))
            self.state.append_log(
                "info",
                "config",
                f"SSH tunnel access setting changed: {self.config.ssh_access_enabled}",
            )

        if "tailscale_access_enabled" in payload:
            previous_host = self.config.controller_host

            self.config.set_tailscale_access_enabled(
                bool(payload.get("tailscale_access_enabled"))
            )

            if self.config.controller_host != previous_host:
                changed_controller_bind = True

            self.state.append_log(
                "info",
                "config",
                (
                    "Tailscale access setting changed: "
                    f"{self.config.tailscale_access_enabled}; "
                    f"controller_host={self.config.controller_host}"
                ),
            )

        if "ssh_tunnel_host" in payload or "ssh_tunnel_user" in payload:
            self.config.set_ssh_tunnel_endpoint(
                str(payload.get("ssh_tunnel_host", self.config.ssh_tunnel_host)),
                str(payload.get("ssh_tunnel_user", self.config.ssh_tunnel_user)),
            )
            self.state.append_log("info", "config", "SSH tunnel endpoint changed")

        feature_settings_changed = False

        if "lxmf_enabled" in payload:
            value = bool(payload.get("lxmf_enabled"))
            if self.config.lxmf_enabled != value:
                self.config.lxmf_enabled = value
                feature_settings_changed = True

        if "nomadnet_enabled" in payload:
            value = bool(payload.get("nomadnet_enabled"))
            if self.config.nomadnet_enabled != value:
                self.config.nomadnet_enabled = value
                feature_settings_changed = True

        if "client_enabled" in payload:
            value = bool(payload.get("client_enabled"))
            if self.config.client_enabled != value:
                self.config.client_enabled = value
                feature_settings_changed = True

        if feature_settings_changed:
            self.config.save()
            self.state.append_log(
                "info",
                "config",
                (
                    "Runtime features changed: "
                    f"LXMF={self.config.lxmf_enabled}, "
                    f"NomadNet={self.config.nomadnet_enabled}, "
                    f"Client={self.config.client_enabled}"
                ),
            )

        return self.config.to_dict()

    def get_access_status(
        self,
        *,
        request_is_https: bool = False,
        forwarded_proto: str = "",
    ) -> dict[str, object]:
        return {
            "network": build_network_interfaces_status(),
            "security": build_channel_security_status(
                self.config.controller_host,
                request_is_https=request_is_https,
                forwarded_proto=forwarded_proto,
            ),
            "ssh": build_ssh_access_status(),
        }

    def get_channel_security_status(
        self,
        *,
        request_is_https: bool = False,
        forwarded_proto: str = "",
    ) -> dict[str, object]:
        return build_channel_security_status(
            self.config.controller_host,
            request_is_https=request_is_https,
            forwarded_proto=forwarded_proto,
        )

    def get_component_status(self) -> dict[str, object]:
        return {
            "client_enabled": self.config.client_enabled,
            "client_store_loaded": self.client_store is not None,
            "client_contact_store_loaded": self.client_contact_store is not None,
            "nomadnet_enabled": self.config.nomadnet_enabled,
            "nomadnet_browser_store_loaded": self.nomadnet_browser_store is not None,
        }

    def get_lxmf_settings(self) -> dict[str, object]:
        return self.lxmf_settings_store.get().to_dict()

    def update_lxmf_settings(self, payload: dict[str, object]) -> dict[str, object]:
        settings = self.lxmf_settings_store.set_message_mode(
            str(payload.get("message_mode") or "")
        )
        self.state.append_log(
            "info",
            "lxmf",
            f"LXMF message mode changed: {settings.message_mode}",
        )
        return settings.to_dict()

    def list_propagation_nodes(self) -> dict[str, object]:
        nodes = self.propagation_store.list_nodes()
        return {
            "nodes": [node.to_dict() for node in nodes],
            "enabled_count": sum(1 for node in nodes if node.enabled),
        }

    def remember_propagation_node(self, payload: dict[str, object]) -> dict[str, object]:
        node, created = self.propagation_store.remember_node(payload)
        self.state.append_log(
            "info",
            "propagation",
            (
                f"Propagation node {'remembered' if created else 'updated'}: "
                f"{node.name} ({node.destination_hash})"
            ),
        )
        return {
            "node": node.to_dict(),
            "created": created,
            **self.list_propagation_nodes(),
        }

    def update_propagation_node(
        self,
        destination_hash: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        if "enabled" not in payload:
            raise ValueError("Propagation node update requires enabled")

        node = self.propagation_store.set_enabled(
            destination_hash,
            bool(payload.get("enabled")),
        )
        self.state.append_log(
            "info",
            "propagation",
            (
                f"Propagation node {'enabled' if node.enabled else 'disabled'}: "
                f"{node.name} ({node.destination_hash})"
            ),
        )
        return {
            "node": node.to_dict(),
            **self.list_propagation_nodes(),
        }

    def forget_propagation_node(self, destination_hash: str) -> dict[str, object]:
        node = self.propagation_store.forget_node(destination_hash)
        self.state.append_log(
            "info",
            "propagation",
            f"Propagation node forgotten: {node.name} ({node.destination_hash})",
        )
        return {
            "forgotten": node.to_dict(),
            **self.list_propagation_nodes(),
        }

    def list_clients(self) -> dict[str, object]:
        if self.client_store is None or self.client_contact_store is None:
            return {
                "clients_dir": str(self.config.local_identities_dir),
                "identities_dir": str(self.config.local_identities_dir),
                "clients": [],
                "schema": {
                    "runtime_modes": list(CLIENT_API_RUNTIME_MODES),
                    "subdirectories": [],
                },
            }

        identities = [
            self._client_api_identity_payload(identity, include_conversations=True)
            for identity in self.client_store.list_identities()
        ]
        return {
            "clients_dir": str(self.config.local_identities_dir),
            "identities_dir": str(self.config.local_identities_dir),
            "clients": identities,
            "schema": {
                "runtime_modes": list(CLIENT_API_RUNTIME_MODES),
                "subdirectories": list(self.client_store.to_dict()["schema"]["subdirectories"]),
            },
        }

    def _client_api_identity_payload(self, identity: object, *, include_conversations: bool) -> dict[str, object]:
        payload = identity.to_dict()
        payload["runtime_mode"] = CLIENT_API_RUNTIME_MODE
        if include_conversations and self.client_contact_store is not None:
            payload["conversations"] = self.client_contact_store.list_conversations(payload["id"])
        return payload

    def list_announces(
        self,
        *,
        limit: int = DEFAULT_ANNOUNCE_LIMIT,
        filters: dict[str, object] | None = None,
    ) -> dict[str, object]:
        normalised_limit = self._normalise_announce_limit(limit)
        return {
            "announces": self.state.snapshot_announces(
                limit=normalised_limit,
                filters=filters or {},
            ),
            "limit": normalised_limit,
        }

    def list_nomadnet_nodes(self) -> dict[str, object]:
        nodes = [
            announce
            for announce in self.state.snapshot_announces(limit=DEFAULT_ANNOUNCE_LIMIT)
            if announce.get("type") == "nomadnet"
            or announce.get("aspect") == "nomadnetwork.node"
        ]
        return {
            "nodes": nodes,
        }

    def fetch_nomadnet_page(
            self,
            destination_hash: str,
            path: str,
            discovery_hints: dict[str, object] | None = None,
            request_data: dict[str, object] | None = None,
    ) -> dict[str, object]:
        destination = destination_hash.strip().lower()
        page_path = path.strip() or NOMADNET_DEFAULT_PATH
        if not page_path.startswith("/"):
            page_path = f"/{page_path}"
        hints = discovery_hints or {}
        request_payload = self._normalise_nomadnet_request_data(request_data)
        self.state.append_log(
            "info",
            "nomadnet",
            (
                f"Page requested: {destination or '-'}{page_path}; "
                f"last_interface={hints.get('last_interface', '') or '-'}; "
                f"request_fields={len(request_payload)}"
            ),
        )
        result = self.engine_supervisor.fetch_nomadnet_page(
            destination,
            page_path,
            discovery_hints=hints,
            request_data=request_payload,
        )
        if result.get("status") == "error":
            self.state.append_log(
                "error",
                "nomadnet",
                f"Page request failed: {destination or '-'}{page_path}: {result.get('error')}: {result.get('message')}",
            )
        else:
            self.state.append_log(
                "info",
                "nomadnet",
                f"Page received: {destination or '-'}{page_path}; interface={result.get('interface', '') or '-'}",
            )
        return result

    def _normalise_nomadnet_request_data(
        self,
        request_data: dict[str, object] | None,
    ) -> dict[str, object]:
        if request_data is None:
            return {}

        if not isinstance(request_data, dict):
            raise ValueError("NomadNet request_data must be an object")

        normalised: dict[str, object] = {}

        for raw_key, raw_value in request_data.items():
            key = str(raw_key).strip()

            if key == "":
                continue

            if len(key) > 128:
                key = key[:128]

            if isinstance(raw_value, (list, tuple)):
                value = ",".join(str(item) for item in raw_value if item is not None)
            elif raw_value is None:
                value = ""
            else:
                value = str(raw_value)

            if len(value) > 4096:
                value = value[:4096]

            normalised[key] = value

        return normalised

    def list_nomadnet_pages(self) -> dict[str, object]:
        pages_dir = self.config.nomadnet_pages_dir
        pages_dir.mkdir(parents=True, exist_ok=True)
        pages = []

        for path in sorted(pages_dir.rglob("*.mu")):
            if not path.is_file():
                continue

            pages.append(
                {
                    "path": path.relative_to(pages_dir).as_posix(),
                    "size": path.stat().st_size,
                }
            )

        return {
            "pages_dir": str(pages_dir),
            "pages": pages,
        }

    def load_nomadnet_local_page(self, path: str) -> dict[str, object]:
        page_path = self._resolve_nomadnet_page_path(path)

        if not page_path.exists():
            raise FileNotFoundError(f"NomadNet page not found: {path}")

        return {
            "path": page_path.relative_to(self.config.nomadnet_pages_dir).as_posix(),
            "source": page_path.read_text(encoding="utf-8"),
        }

    def save_nomadnet_local_page(self, payload: dict[str, object]) -> dict[str, object]:
        page_path = self._resolve_nomadnet_page_path(str(payload.get("path") or "index.mu"))
        source = str(payload.get("source") or "")
        page_path.parent.mkdir(parents=True, exist_ok=True)
        page_path.write_text(source, encoding="utf-8")
        self.state.append_log(
            "info",
            "nomadnet",
            f"Local page saved: {page_path.relative_to(self.config.nomadnet_pages_dir).as_posix()}",
        )
        return {
            "path": page_path.relative_to(self.config.nomadnet_pages_dir).as_posix(),
            "source": source,
            "size": page_path.stat().st_size,
        }

    def _resolve_nomadnet_page_path(self, raw_path: str) -> Path:
        pages_dir = self.config.nomadnet_pages_dir.resolve()
        relative = raw_path.strip().replace("\\", "/").lstrip("/")

        if relative == "":
            relative = "index.mu"

        candidate = (pages_dir / relative).resolve()

        if pages_dir != candidate and pages_dir not in candidate.parents:
            raise ValueError("NomadNet page path escapes pages directory")

        if candidate.suffix != ".mu":
            raise ValueError("NomadNet page path must end with .mu")

        return candidate

    def get_nomadnet_browser_state(self) -> dict[str, object]:
        return self.nomadnet_browser_store.load()

    def save_nomadnet_browser_state(self, payload: dict[str, object]) -> dict[str, object]:
        result = self.nomadnet_browser_store.save(payload)
        self.state.append_log("info", "nomadnet", "Browser bookmarks/history saved")
        return result

    def build_client_draft(self) -> dict[str, object]:
        identity = self.client_store.build_draft()
        return self._client_api_identity_payload(identity, include_conversations=False)

    def save_client(self, payload: dict[str, object]) -> dict[str, object]:
        identity = self.client_store.save_identity(payload)
        self.state.append_log("info", "client", f"Local identity saved: {identity.id}")
        self.state.notify_client_change()
        return self._client_api_identity_payload(identity, include_conversations=True)

    def generate_client_identity(self, client_id: str) -> dict[str, object]:
        self.engine_supervisor.generate_lxmf_identity(client_id)
        identity = self._find_client_identity(client_id)
        self.state.append_log("info", "client", f"Local identity generated: {identity.id}")
        self.state.notify_client_change()
        return self._client_api_identity_payload(identity, include_conversations=True)

    def start_client_lxmf(self, client_id: str) -> dict[str, object]:
        status = self.engine_supervisor.start_lxmf_worker(client_id)
        self.state.append_log("info", "client", f"LXMF worker start requested: {client_id}")
        return status

    def stop_client_lxmf(self, client_id: str) -> dict[str, object]:
        self.engine_supervisor.stop_lxmf_worker(client_id)
        self.state.append_log("info", "client", f"LXMF worker stopped: {client_id}")
        return {
            "identity_id": client_id,
            "running": False,
            "ready": False,
            "state": "stopped",
        }

    def restart_client_lxmf(self, client_id: str) -> dict[str, object]:
        status = self.engine_supervisor.restart_lxmf_worker(client_id)
        self.state.append_log("info", "client", f"LXMF worker restart requested: {client_id}")
        return status

    def announce_client_lxmf(self, client_id: str) -> dict[str, object]:
        result = self.engine_supervisor.announce_lxmf_worker(client_id)
        self.state.append_log("info", "client", f"LXMF announce sent: {client_id}")
        return result

    def _find_client_identity(self, client_id: str) -> object:
        for identity in self.client_store.list_identities():
            if identity.id == client_id:
                return identity

        raise ValueError(f"Local identity does not exist: {client_id}")

    def remove_client(self, client_id: str) -> dict[str, object]:
        self.engine_supervisor.stop_lxmf_worker(client_id)
        self.client_store.remove_identity(client_id)
        self.state.append_log("info", "client", f"Local identity removed: {client_id}")
        self.state.notify_client_change()
        return self.list_clients()

    def list_client_conversations(self, client_id: str) -> dict[str, object]:
        return {
            "client_id": client_id,
            "conversations": self.client_contact_store.list_conversations(client_id),
        }

    def list_client_messages(self, client_id: str, contact_id: str) -> dict[str, object]:
        return {
            "client_id": client_id,
            "contact_id": contact_id,
            "messages": self.client_contact_store.list_messages(client_id, contact_id),
        }

    def clear_client_messages(self, client_id: str, contact_id: str) -> dict[str, object]:
        result = self.client_contact_store.clear_messages(client_id, contact_id)
        self.state.append_log("info", "client", f"Messages cleared: {client_id}/{contact_id}")
        self.state.notify_client_change()
        return result

    def delete_client_message(self, client_id: str, contact_id: str, message_id: str) -> dict[str, object]:
        result = self.client_contact_store.delete_message(client_id, contact_id, message_id)
        self.state.append_log("info", "client", f"Message deleted: {client_id}/{contact_id}/{message_id}")
        self.state.notify_client_change()
        return result
    def save_client_contact(self, client_id: str, payload: dict[str, object]) -> dict[str, object]:
        contact = self.client_contact_store.save_contact(client_id, payload)
        self.state.append_log("info", "client", f"Contact saved: {client_id}/{contact['id']}")
        self.state.notify_client_change()
        return {
            "client_id": client_id,
            "contact": contact,
            "conversations": self.client_contact_store.list_conversations(client_id),
        }

    def send_client_message(
        self,
        client_id: str,
        contact_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        content = str(payload.get("content") or "")
        _, destination_hash = self._client_outbound_target(client_id, contact_id)
        delivery_method, propagation_node = self._client_message_delivery_context()
        propagation_node_hash = "" if propagation_node is None else propagation_node.destination_hash
        propagation_node_name = "" if propagation_node is None else propagation_node.name
        message = self.client_contact_store.add_outbound_message(
            client_id,
            contact_id,
            content,
            delivery_method=delivery_method,
            propagation_node_hash=propagation_node_hash,
            propagation_node_name=propagation_node_name,
        )
        self.state.notify_client_change()
        return self._queue_client_outbound_message(
            client_id,
            contact_id,
            message,
            destination_hash,
        )

    def repeat_client_message(
        self,
        client_id: str,
        contact_id: str,
        message_id: str,
    ) -> dict[str, object]:
        _, destination_hash = self._client_outbound_target(client_id, contact_id)
        delivery_method, propagation_node = self._client_message_delivery_context()
        propagation_node_hash = "" if propagation_node is None else propagation_node.destination_hash
        propagation_node_name = "" if propagation_node is None else propagation_node.name
        message = self.client_contact_store.prepare_outbound_retry(
            client_id,
            contact_id,
            message_id,
            delivery_method=delivery_method,
            propagation_node_hash=propagation_node_hash,
            propagation_node_name=propagation_node_name,
        )
        self.state.notify_client_change()
        return self._queue_client_outbound_message(
            client_id,
            contact_id,
            message,
            destination_hash,
        )

    def _client_message_delivery_context(self) -> tuple[str, object | None]:
        message_mode = self.lxmf_settings_store.get().message_mode

        if message_mode == MESSAGE_MODE_DIRECT:
            return MESSAGE_MODE_DIRECT, None

        if message_mode == MESSAGE_MODE_PROPAGATION:
            enabled_nodes = self.propagation_store.enabled_nodes()
            return MESSAGE_MODE_PROPAGATION, enabled_nodes[0] if len(enabled_nodes) > 0 else None

        raise ValueError(f"Unsupported LXMF message mode: {message_mode}")

    def _queue_client_outbound_message(
        self,
        client_id: str,
        contact_id: str,
        message: dict[str, object],
        destination_hash: str,
    ) -> dict[str, object]:
        local_message_id = str(message.get("id") or "")
        content = str(message.get("content") or "")
        delivery_method = str(message.get("delivery_method") or MESSAGE_MODE_DIRECT)
        propagation_node_hash = str(message.get("propagation_node_hash") or "")
        propagation_node_name = str(message.get("propagation_node_name") or "")

        try:
            if delivery_method == MESSAGE_MODE_PROPAGATION and propagation_node_hash == "":
                raise RuntimeError("No enabled propagation nodes")

            result = self.engine_supervisor.send_lxmf_message(
                client_id,
                destination_hash,
                content,
                local_message_id=local_message_id,
                contact_id=contact_id,
                delivery_method=delivery_method,
                propagation_node_hash=propagation_node_hash,
            )
            message = self.client_contact_store.update_outbound_message(
                client_id,
                contact_id,
                local_message_id,
                {
                    "delivery_method": delivery_method,
                    "propagation_node_hash": propagation_node_hash,
                    "propagation_node_name": propagation_node_name,
                    "lxmf_message_id": str(result.get("message_id") or ""),
                    "destination_hash": destination_hash,
                    "error": "",
                },
                expected_state="sending",
            ) or message
            self.state.append_log(
                "info",
                "client",
                (
                    f"LXMF message queued: {client_id}/{contact_id}/"
                    f"{result.get('message_id')} mode={delivery_method}"
                ),
            )
        except Exception as exc:
            message = self.client_contact_store.update_outbound_message(
                client_id,
                contact_id,
                local_message_id,
                {
                    "state": "failed",
                    "delivery_method": delivery_method,
                    "propagation_node_hash": propagation_node_hash,
                    "propagation_node_name": propagation_node_name,
                    "destination_hash": destination_hash,
                    "error": f"{type(exc).__name__}: {exc}",
                },
                expected_state="sending",
            ) or message
            self.state.append_log(
                "error",
                "client",
                (
                    f"LXMF message queue failed: {client_id}/{contact_id}: "
                    f"{type(exc).__name__}: {exc}"
                ),
            )
            self.state.notify_client_change()
            raise

        self.state.notify_client_change()
        return {
            "client_id": client_id,
            "contact_id": contact_id,
            "message": message,
            "messages": self.client_contact_store.list_messages(client_id, contact_id),
        }
    def _client_outbound_target(
        self,
        client_id: str,
        contact_id: str,
    ) -> tuple[dict[str, object], str]:
        contact = self.client_contact_store.export_contact(client_id, contact_id)

        if len(contact) == 0:
            raise ValueError(f"Contact does not exist: {client_id}/{contact_id}")

        destination_hash = self._client_contact_destination_hash(contact)

        if destination_hash == "":
            raise ValueError(f"Contact has no LXMF destination: {client_id}/{contact_id}")

        return contact, destination_hash
    def _client_contact_destination_hash(self, contact: dict[str, object]) -> str:
        destination_hash = str(contact.get("destination_hash") or "").strip().lower()

        if destination_hash != "":
            return destination_hash

        lxmf_address = str(contact.get("lxmf_address") or "").strip().lower()

        if lxmf_address.startswith("lxmf://"):
            return lxmf_address[len("lxmf://"):]

        return lxmf_address

    def export_client_contact(self, client_id: str, contact_id: str) -> dict[str, object]:
        return {
            "client_id": client_id,
            "contact": self.client_contact_store.export_contact(client_id, contact_id),
        }

    def _preflight_runtime_dependencies(self, runtime: RuntimeInfo) -> bool:
        if not self.config.lxmf_enabled:
            self.state.append_log(
                "info",
                "runtime",
                "LXMF preflight skipped: lxmf_enabled is false",
            )
            return True

        lxmf_status = self.runtime_manager.get_lxmf_status(runtime.release_version)

        if not bool(lxmf_status.get("installed")):
            self.state.append_log(
                "warning",
                "runtime",
                "LXMF is enabled, but no managed LXMF release is installed; using LXMF stub",
            )
            return True

        compatibility = lxmf_status.get("compatibility")

        if isinstance(compatibility, dict) and compatibility.get("compatible") is False:
            self.state.append_log(
                "warning",
                "runtime",
                str(compatibility.get("message") or "Installed LXMF release is not compatible with active RNS"),
            )
            return True

        self.state.append_log(
            "info",
            "runtime",
            (
                "LXMF preflight ok: "
                f"version={lxmf_status.get('release_version')}, "
                f"source={lxmf_status.get('source_path')}"
            ),
        )
        return True

    def _runtime_python_path(self, runtime: RuntimeInfo) -> str:
        python_path = getattr(runtime, "python_path", None) or self.config.runtime_python

        if python_path is None:
            return sys.executable

        return str(python_path)

    def _python_import_available(self, python_path: str, import_name: str) -> bool:
        result = subprocess.run(
            [
                python_path,
                "-c",
                f"import {import_name}",
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=30,
        )

        return result.returncode == 0

    def _install_python_package(self, python_path: str, package_name: str) -> dict[str, object]:
        try:
            result = subprocess.run(
                [
                    python_path,
                    "-m",
                    "pip",
                    "install",
                    package_name,
                ],
                capture_output=True,
                text=True,
                check=False,
                timeout=RUNTIME_PACKAGE_INSTALL_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired:
            return {
                "ok": False,
                "message": f"pip install timed out after {RUNTIME_PACKAGE_INSTALL_TIMEOUT_SECONDS} seconds",
            }
        except OSError as exc:
            return {
                "ok": False,
                "message": f"{type(exc).__name__}: {exc}",
            }

        output = self._compact_command_output(result.stdout, result.stderr)

        if result.returncode == 0:
            return {
                "ok": True,
                "message": output,
            }

        return {
            "ok": False,
            "message": output or f"pip exited with code {result.returncode}",
        }

    def _compact_command_output(self, stdout: str, stderr: str) -> str:
        text = "\n".join(part.strip() for part in (stdout, stderr) if part.strip() != "")

        if len(text) <= RUNTIME_INSTALL_OUTPUT_LIMIT:
            return text

        return text[-RUNTIME_INSTALL_OUTPUT_LIMIT:]

    def _apply_active_runtime(self) -> RuntimeInfo:
        runtime = self.runtime_manager.get_runtime(self.config.engine_name)

        if not runtime.enabled:
            raise RuntimeError(f"Runtime is disabled: {runtime.name}")

        lxmf_runtime = self.runtime_manager.get_lxmf_runtime()

        self.config.runtime_python = runtime.python_path
        self.config.runtime_source_path = runtime.source_path
        self.config.lxmf_source_path = (
            lxmf_runtime.source_path
            if lxmf_runtime.installed
            else None
        )

        return runtime

    def client_change_id(self) -> int:
        return self.state.snapshot_client_change_id()

    def wait_for_client_change(self, *, after_id: int, timeout: float) -> int:
        return self.state.wait_for_client_change(after_id=after_id, timeout=timeout)

    def wait_for_announces(
        self,
        *,
        after_id: int,
        timeout: float,
        limit: int = DEFAULT_ANNOUNCE_LIMIT,
        filters: dict[str, object] | None = None,
    ) -> list[dict[str, object]]:
        return self.state.wait_for_announces(
            after_id=after_id,
            timeout=timeout,
            limit=self._normalise_announce_limit(limit),
            filters=filters or {},
        )

    def _handle_engine_event(self, event: EngineEvent) -> None:
        if event.topic == "announce.received":
            try:
                self.state.append_announce(self._build_announce_record(event.payload))
            except Exception as exc:
                self.state.append_log(
                    "error",
                    "announce",
                    f"Failed to record announce: {type(exc).__name__}: {exc}",
                )
            return

        if event.topic == "lxmf.message_received":
            self._handle_lxmf_message_received(event.payload)
            return

        if event.topic in (
            "lxmf.message_delivered",
            "lxmf.message_propagated",
            "lxmf.message_failed",
        ):
            self._handle_lxmf_outbound_state(event.topic, event.payload)
            return

        if event.topic == "lxmf.worker_exited":
            self._handle_lxmf_worker_exited(event.payload)
    def _handle_lxmf_worker_exited(self, payload: dict[str, Any]) -> None:
        if self.client_contact_store is None:
            return

        identity_id = str(payload.get("identity_id") or "").strip()

        if identity_id == "":
            return

        failed_count = self.client_contact_store.fail_pending_outbound_messages(
            identity_id,
            LXMF_WORKER_EXITED_ERROR,
        )

        if failed_count == 0:
            return

        self.state.append_log(
            "warning",
            "client",
            (
                f"LXMF worker exited for {identity_id}; "
                f"marked {failed_count} pending message(s) as failed"
            ),
        )
        self.state.notify_client_change()

    def _handle_lxmf_outbound_state(self, topic: str, payload: dict[str, Any]) -> None:
        if self.client_contact_store is None:
            return

        identity_id = str(payload.get("identity_id") or "").strip()
        contact_id = str(payload.get("contact_id") or "").strip()
        local_message_id = str(payload.get("local_message_id") or "").strip()

        if identity_id == "" or contact_id == "" or local_message_id == "":
            self.state.append_log("error", "client", "Incomplete outbound LXMF state metadata")
            return

        if topic == "lxmf.message_delivered":
            state = "delivered"
        elif topic == "lxmf.message_propagated":
            state = "propagated"
        else:
            state = "failed"

        message = self.client_contact_store.update_outbound_message(
            identity_id,
            contact_id,
            local_message_id,
            {
                "state": state,
                "delivery_method": str(payload.get("delivery_method") or ""),
                "propagation_node_hash": str(payload.get("propagation_node_hash") or ""),
                "lxmf_message_id": str(payload.get("message_id") or ""),
                "destination_hash": str(payload.get("destination_hash") or ""),
                "error": "" if state != "failed" else "LXMF delivery failed",
            },
        )

        if message is None:
            self.state.append_log(
                "error",
                "client",
                f"Outbound LXMF state references unknown message: {identity_id}/{contact_id}/{local_message_id}",
            )
            return

        self.state.append_log(
            "info" if state != "failed" else "error",
            "client",
            (
                f"LXMF message {state}: {identity_id}/{contact_id}/"
                f"{payload.get('message_id')}"
            ),
        )
        self.state.notify_client_change()
    def _handle_lxmf_message_received(self, payload: dict[str, Any]) -> None:
        if self.client_contact_store is None:
            return

        identity_id = str(payload.get("identity_id") or "").strip()
        source_hash = str(payload.get("source_hash") or "").strip().lower()

        if identity_id == "" or source_hash == "":
            self.state.append_log("error", "client", "Incomplete inbound LXMF message metadata")
            return

        try:
            contact = self.client_contact_store.ensure_inbound_contact(identity_id, source_hash)
            contact_id = str(contact.get("id") or "")
            message = self.client_contact_store.add_inbound_message(identity_id, contact_id, payload)
            self.state.append_log(
                "info",
                "client",
                f"LXMF message received: {identity_id}/{contact_id}/{message.get('id')}",
            )
            self.state.notify_client_change()
        except Exception as exc:
            self.state.append_log(
                "error",
                "client",
                f"Failed to store inbound LXMF message: {type(exc).__name__}: {exc}",
            )

    def _build_announce_record(self, payload: dict[str, Any]) -> dict[str, object]:
        aspect = str(payload.get("aspect") or "")
        destination_hash = str(payload.get("destination_hash") or "")
        identity_hash = str(payload.get("identity_hash") or "")
        app_data_preview = str(payload.get("app_data_preview") or "")
        announce_type = self._announce_type_from_announce(aspect, app_data_preview)
        display_name = self._announce_name_from_app_data(app_data_preview) or self._default_announce_name(
            announce_type,
            aspect,
            destination_hash,
        )

        return {
            "type": announce_type,
            "name": display_name,
            "identity_hash": identity_hash,
            "lxmf": destination_hash if aspect.startswith("lxmf.") else "",
            "aspect": aspect,
            "destination_hash": destination_hash,
            "hops": payload.get("hops"),
            "interface": str(payload.get("interface") or ""),
            "app_data_hex": str(payload.get("app_data_hex") or ""),
            "app_data_preview": app_data_preview,
            "announce_packet_hash": str(payload.get("announce_packet_hash") or ""),
            "is_path_response": bool(payload.get("is_path_response")),
            "source": "reticulum",
        }

    # def _announce_type_from_aspect(self, aspect: str) -> str:
    #     clean_aspect = aspect.strip()
    #
    #     if clean_aspect == "":
    #         return "peer"
    #
    #     mapped_type = ANNOUNCE_TYPE_BY_ASPECT.get(clean_aspect)
    #     if mapped_type is not None:
    #         return mapped_type
    #
    #     return clean_aspect

    def _announce_type_from_announce(self, aspect: str, app_data_preview: str) -> str:
        clean_aspect = aspect.strip()

        if clean_aspect != "":
            mapped_type = ANNOUNCE_TYPE_BY_ASPECT.get(clean_aspect)
            if mapped_type is not None:
                return mapped_type

            return clean_aspect

        return self._announce_type_from_app_data(app_data_preview)

    def _announce_type_from_app_data(self, app_data_preview: str) -> str:
        text = app_data_preview.strip()

        if text == "":
            return "peer"

        parsed = self._parse_json_app_data(text)

        if isinstance(parsed, dict):
            for required_keys, announce_type in ANNOUNCE_JSON_TYPE_RULES:
                if all(key in parsed for key in required_keys):
                    return announce_type

        for prefix, announce_type in ANNOUNCE_TEXT_TYPE_PREFIXES:
            if text.startswith(prefix):
                return announce_type

        for marker, announce_type in ANNOUNCE_TEXT_TYPE_SUBSTRINGS:
            if marker in text:
                return announce_type

        return "peer"

    def _announce_name_from_app_data(self, app_data_preview: str) -> str:
        text = app_data_preview.strip()

        if text == "":
            return ""

        parsed = self._parse_json_app_data(text)

        if isinstance(parsed, dict):
            for key in ANNOUNCE_JSON_NAME_KEYS:
                value = parsed.get(key)
                if value is None:
                    continue

                clean_value = str(value).strip()
                if clean_value != "":
                    return clean_value

        return text

    def _parse_json_app_data(self, app_data_preview: str) -> object:
        text = app_data_preview.strip()

        if not text.startswith("{"):
            return None

        try:
            return json.loads(text)
        except (TypeError, ValueError):
            return None

    def _default_announce_name(
            self,
            announce_type: str,
            aspect: str,
            destination_hash: str,
    ) -> str:
        prefix = ANNOUNCE_DEFAULT_NAME_PREFIX.get(announce_type)

        if prefix is None:
            prefix = aspect.strip() or announce_type.strip() or "Announce"

        suffix = destination_hash[:12] if destination_hash != "" else aspect
        return f"{prefix} {suffix}".strip()

    def _normalise_announce_limit(self, limit: int) -> int:
        try:
            value = int(limit)
        except (TypeError, ValueError):
            value = DEFAULT_ANNOUNCE_LIMIT

        if value <= 0:
            return DEFAULT_ANNOUNCE_LIMIT

        return min(value, MAX_ANNOUNCE_LIMIT)

    def _build_runtime_interface_capabilities(
        self,
        runtime: RuntimeInfo | None,
    ) -> list[dict[str, object]]:
        parsed_config = load_rns_config(self.config.rns_config_dir)
        configured_interfaces = parsed_config.interfaces
        installed_types = set(runtime.interface_types if runtime is not None else ())
        configured_types = {
            str(interface.get("type") or "")
            for interface in configured_interfaces
            if str(interface.get("type") or "") != ""
        }
        interface_types = sorted(installed_types | configured_types)

        capabilities = []

        for interface_type in interface_types:
            configured = [
                interface
                for interface in configured_interfaces
                if interface.get("type") == interface_type
            ]
            enabled_count = sum(1 for interface in configured if bool(interface.get("enabled")))

            capabilities.append(
                {
                    "type": interface_type,
                    "installed": interface_type in installed_types,
                    "configured": len(configured),
                    "enabled": enabled_count,
                    "runtime": runtime.name if runtime is not None else "",
                }
            )

        return capabilities
