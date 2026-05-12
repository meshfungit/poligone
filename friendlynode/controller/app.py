"""Controller application object."""

from __future__ import annotations
from typing import Any
from friendlynode.client_accounts import ClientAccountStore
from friendlynode.config.app_config import AppConfig
from friendlynode.controller.engine_supervisor import EngineSupervisor
from friendlynode.controller.runtime_manager import RuntimeInfo, RuntimeManager
from friendlynode.controller.state_cache import StateCache
from friendlynode.config.rns_config_editor import load_rns_config, save_rns_config


class ControllerApp:
    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or AppConfig.load()
        self.state = StateCache()
        self.runtime_manager = RuntimeManager()
        self.client_store = ClientAccountStore(self.config.clients_dir)
        self.engine_supervisor = EngineSupervisor(self.config)

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

    def get_rns_config(self) -> dict[str, object]:
        parsed_config = load_rns_config(self.config.rns_config_dir)
        return parsed_config.to_dict()

    def save_rns_config(self, payload: dict[str, object]) -> dict[str, object]:
        parsed_config = save_rns_config(self.config.rns_config_dir, payload)
        self.state.append_log("info", "rns-config", "Reticulum config saved")
        return parsed_config.to_dict()

    def list_clients(self) -> dict[str, object]:
        return self.client_store.to_dict()

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
