"""Controller application object."""

from __future__ import annotations
from typing import Any
from friendlynode.client_accounts import ClientAccountStore
from friendlynode.config.app_config import AppConfig
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

ANNOUNCE_TYPE_BY_ASPECT = {
    "lxmf.delivery": "identity",
    "lxmf.propagation": "lxmf.propagation",
    "nomadnetwork.node": "nomadnet",
    "call.audio": "call.audio",
    "rnstransport.discovery.interface": "interface",
    "rnstransport.probe": "rnstransport.probe",
    "rncp.receive": "rncp.receive",
    "rnx.execute": "rnx.execute",
}

ANNOUNCE_DEFAULT_NAME_PREFIX = {
    "identity": "Identity",
    "lxmf.propagation": "Propagation",
    "nomadnet": "NomadNet node",
    "interface": "Interface",
    "call.audio": "call.audio",
    "rnstransport.probe": "Probe",
    "rncp.receive": "File transfer",
    "rnx.execute": "Remote exec",
    "transport": "Transport",
    "peer": "Peer",
}

class ControllerApp:
    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or AppConfig.load()
        self.state = StateCache()
        self.runtime_manager = RuntimeManager()
        self.client_store = ClientAccountStore(self.config.clients_dir)
        self.engine_supervisor = EngineSupervisor(self.config, self._handle_engine_event)

    def start(self) -> None:
        self.config.ensure_dirs()
        self.state.append_log("info", "controller", "controller start requested")

        runtime = self._apply_active_runtime()
        self.state.append_log(
            "info",
            "runtime",
            f"active runtime resolved: name={runtime.name}, kind={runtime.kind}",
        )

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

        self.engine_supervisor.restart()
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
            f"runtime selected: name={runtime.name}, kind={runtime.kind}",
        )

        self.engine_supervisor.restart()
        self.state.append_log("info", "controller", "Reticulum restart completed")

        return runtime

    def install_reticulum_release(self, version: str) -> RuntimeInfo:
        self.state.append_log("info", "runtime", f"Reticulum install requested: {version}")

        runtime = self.runtime_manager.install_reticulum_release(version)
        self.config.set_engine_name(runtime.name)
        runtime = self._apply_active_runtime()

        self.state.append_log(
            "info",
            "runtime",
            f"Reticulum runtime installed: name={runtime.name}, version={runtime.release_version}",
        )

        self.engine_supervisor.restart()
        self.state.append_log("info", "controller", "Reticulum restart completed")

        return runtime

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

        return {
            "active": active_runtime_name,
            "available": [runtime.to_dict() for runtime in runtimes],
            "releases": self.runtime_manager.list_reticulum_releases(),
            "interface_capabilities": self._build_runtime_interface_capabilities(active_runtime),
        }

    def get_rns_config(self) -> dict[str, object]:
        parsed_config = load_rns_config(self.config.rns_config_dir)
        return parsed_config.to_dict()

    def save_rns_config(self, payload: dict[str, object]) -> dict[str, object]:
        parsed_config = save_rns_config(self.config.rns_config_dir, payload)
        self.state.append_log("info", "rns-config", "Reticulum config saved")
        return parsed_config.to_dict()

    def save_app_config(self, payload: dict[str, object]) -> dict[str, object]:
        changed_controller_bind = False

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

        if "ssh_tunnel_host" in payload or "ssh_tunnel_user" in payload:
            self.config.set_ssh_tunnel_endpoint(
                str(payload.get("ssh_tunnel_host", self.config.ssh_tunnel_host)),
                str(payload.get("ssh_tunnel_user", self.config.ssh_tunnel_user)),
            )
            self.state.append_log("info", "config", "SSH tunnel endpoint changed")

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

    def list_clients(self) -> dict[str, object]:
        return self.client_store.to_dict()

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

    def fetch_nomadnet_page(self, destination_hash: str, path: str) -> dict[str, object]:
        destination = destination_hash.strip()
        page_path = path.strip() or "/page/index.mu"

        if not page_path.startswith("/"):
            page_path = f"/{page_path}"

        source = (
            "`cFriendlyNode NomadNet browser\n\n"
            ">Stub page\n\n"
            f"`!Destination`!: {destination or '-'}\n\n"
            f"`!Path`!: {page_path}\n\n"
            "Symbols: ✔ ⚠ ♻ ⚖ ☄\n\n"
            "Real NomadNet page retrieval is not wired yet.\n"
        )
        self.state.append_log("info", "nomadnet", f"Page requested: {destination or '-'}{page_path}")
        return {
            "destination_hash": destination,
            "path": page_path,
            "source": source,
            "runtime": "stub",
        }

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

    def build_client_draft(self) -> dict[str, object]:
        return self.client_store.build_draft().to_dict()

    def save_client(self, payload: dict[str, object]) -> dict[str, object]:
        client = self.client_store.save_client(payload)
        self.state.append_log("info", "client", f"Client saved: {client.id}")
        return client.to_dict()

    def remove_client(self, client_id: str) -> dict[str, object]:
        self.client_store.remove_client(client_id)
        self.state.append_log("info", "client", f"Client removed: {client_id}")
        return self.client_store.to_dict()

    def list_client_conversations(self, client_id: str) -> dict[str, object]:
        return {
            "client_id": client_id,
            "conversations": self.client_store.list_conversations(client_id),
        }

    def list_client_messages(self, client_id: str, contact_id: str) -> dict[str, object]:
        return {
            "client_id": client_id,
            "contact_id": contact_id,
            "messages": self.client_store.list_messages(client_id, contact_id),
        }

    def clear_client_messages(self, client_id: str, contact_id: str) -> dict[str, object]:
        result = self.client_store.clear_messages(client_id, contact_id)
        self.state.append_log("info", "client", f"Messages cleared: {client_id}/{contact_id}")
        return result

    def save_client_contact(self, client_id: str, payload: dict[str, object]) -> dict[str, object]:
        contact = self.client_store.save_contact(client_id, payload)
        self.state.append_log("info", "client", f"Contact saved: {client_id}/{contact['id']}")
        return {
            "client_id": client_id,
            "contact": contact,
            "conversations": self.client_store.list_conversations(client_id),
        }

    def send_client_message(
        self,
        client_id: str,
        contact_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        content = str(payload.get("content") or "")
        message = self.client_store.add_outbound_message(client_id, contact_id, content)
        self.state.append_log("info", "client", f"Message queued: {client_id}/{contact_id}")
        return {
            "client_id": client_id,
            "contact_id": contact_id,
            "message": message,
            "messages": self.client_store.list_messages(client_id, contact_id),
        }

    def export_client_contact(self, client_id: str, contact_id: str) -> dict[str, object]:
        return {
            "client_id": client_id,
            "contact": self.client_store.export_contact(client_id, contact_id),
        }

    def _apply_active_runtime(self) -> RuntimeInfo:
        runtime = self.runtime_manager.get_runtime(self.config.engine_name)

        if not runtime.enabled:
            raise RuntimeError(f"Runtime is disabled: {runtime.name}")

        self.config.runtime_python = runtime.python_path
        self.config.runtime_source_path = runtime.source_path

        return runtime

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

    def _build_announce_record(self, payload: dict[str, Any]) -> dict[str, object]:
        aspect = str(payload.get("aspect") or "")
        destination_hash = str(payload.get("destination_hash") or "")
        identity_hash = str(payload.get("identity_hash") or "")
        app_data_preview = str(payload.get("app_data_preview") or "")
        announce_type = self._announce_type_from_aspect(aspect)
        display_name = app_data_preview.strip() or self._default_announce_name(
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

    def _announce_type_from_aspect(self, aspect: str) -> str:
        clean_aspect = aspect.strip()

        if clean_aspect == "":
            return "peer"

        mapped_type = ANNOUNCE_TYPE_BY_ASPECT.get(clean_aspect)
        if mapped_type is not None:
            return mapped_type

        return clean_aspect

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
