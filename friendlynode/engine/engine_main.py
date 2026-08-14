"""Engine process entry point."""

from __future__ import annotations

import sys
from typing import Any

from friendlynode.config.app_config import AppConfig
from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus
from friendlynode.engine.rns_runtime import RnsRuntime
from friendlynode.local_identities import LocalIdentityStore


NOMADNET_RUNTIME_MODULE_NAME = (
    "friendlynode.engine.nomadnet_runtime"
)
LXMF_PROCESS_MANAGER_MODULE_NAME = (
    "friendlynode.engine.lxmf_process_manager"
)


class EngineMain:
    def __init__(
        self,
        config: AppConfig | None = None,
    ) -> None:
        self.config = config or AppConfig()
        self.bus = IpcBus()

        self.rns_runtime = RnsRuntime(
            config_dir=self.config.rns_config_dir,
            runtime_source_path=self.config.runtime_source_path,
            bus=self.bus,
            lxmf_enabled=self.config.lxmf_enabled,
            lxmf_source_path=self.config.lxmf_source_path,
        )
        self.nomadnet_runtime: Any | None = None
        self.lxmf_process_manager: Any | None = None

        if self.config.nomadnet_enabled:
            from friendlynode.engine.nomadnet_runtime import (
                NomadNetRuntime,
            )

            self.nomadnet_runtime = NomadNetRuntime(
                self.rns_runtime
            )

        if self.config.client_enabled and self.config.lxmf_enabled:
            from friendlynode.engine.lxmf_process_manager import (
                LxmfProcessManager,
            )

            self.lxmf_process_manager = LxmfProcessManager(
                self.config
            )

    def start(self, start_lxmf_workers: bool = True) -> None:
        self.config.ensure_dirs()
        self.rns_runtime.start()

        if start_lxmf_workers:
            self._start_enabled_lxmf_workers()

    def stop(self) -> None:
        if self.lxmf_process_manager is not None:
            self.lxmf_process_manager.stop_all()

        self.nomadnet_runtime = None
        self.rns_runtime.stop()

    def running_lxmf_identity_ids(self) -> list[str]:
        if self.lxmf_process_manager is None:
            return []

        return self.lxmf_process_manager.running_identity_ids()

    def start_lxmf_worker(self, identity_id: str) -> dict[str, object]:
        if self.lxmf_process_manager is None:
            raise RuntimeError("LXMF process manager is disabled")

        return self.lxmf_process_manager.start(identity_id)

    def stop_lxmf_worker(self, identity_id: str) -> None:
        if self.lxmf_process_manager is None:
            return

        self.lxmf_process_manager.stop(identity_id)

    def restart_lxmf_worker(self, identity_id: str) -> dict[str, object]:
        if self.lxmf_process_manager is None:
            raise RuntimeError("LXMF process manager is disabled")

        return self.lxmf_process_manager.restart(identity_id)

    def make_announce(
        self,
        *,
        target: str = "transport",
        interface_name: str | None = None,
    ) -> dict[str, object]:
        return self.rns_runtime.make_announce(
            target=target,
            interface_name=interface_name,
        )

    def fetch_nomadnet_page(
        self,
        destination_hash: str,
        path: str,
        discovery_hints: dict[str, object] | None = None,
        request_data: dict[str, object] | None = None,
    ) -> dict[str, object]:
        if self.nomadnet_runtime is None:
            return {
                "status": "error",
                "error": "nomadnet_disabled",
                "message": "NomadNet runtime is disabled",
                "destination_hash": destination_hash.strip().lower(),
                "path": path,
                "source": "",
                "runtime": "disabled",
            }

        return self.nomadnet_runtime.fetch_page(
            destination_hash,
            path,
            discovery_hints=discovery_hints or {},
            request_data=request_data or {},
        )

    def nomadnet_status(self) -> dict[str, object]:
        return {
            "enabled": self.config.nomadnet_enabled,
            "loaded": self.nomadnet_runtime is not None,
            "module_imported": (
                NOMADNET_RUNTIME_MODULE_NAME in sys.modules
            ),
        }

    def lxmf_client_status(self) -> dict[str, object]:
        if self.lxmf_process_manager is None:
            last_error = ""

            if self.config.client_enabled and not self.config.lxmf_enabled:
                last_error = "Client requires LXMF runtime"

            return {
                "enabled": self.config.client_enabled,
                "loaded": False,
                "module_imported": LXMF_PROCESS_MANAGER_MODULE_NAME in sys.modules,
                "process_isolated": True,
                "started": False,
                "ready": False,
                "client_id": "",
                "identity_hash": "",
                "destination_hash": "",
                "clients_dir": str(self.config.local_identities_dir),
                "identities_dir": str(self.config.local_identities_dir),
                "worker_count": 0,
                "workers": [],
                "lxmf_version": None,
                "last_error": last_error,
            }

        workers = self.lxmf_process_manager.status()
        running_workers = [worker for worker in workers if bool(worker.get("running"))]
        primary = running_workers[0] if len(running_workers) > 0 else None

        return {
            "enabled": self.config.client_enabled,
            "loaded": True,
            "module_imported": LXMF_PROCESS_MANAGER_MODULE_NAME in sys.modules,
            "process_isolated": True,
            "started": len(running_workers) > 0,
            "ready": any(bool(worker.get("ready")) for worker in running_workers),
            "client_id": str(primary.get("identity_id") or "") if primary is not None else "",
            "identity_hash": str(primary.get("identity_hash") or "") if primary is not None else "",
            "destination_hash": str(primary.get("destination_hash") or "") if primary is not None else "",
            "clients_dir": str(self.config.local_identities_dir),
            "identities_dir": str(self.config.local_identities_dir),
            "worker_count": len(running_workers),
            "workers": workers,
            "lxmf_version": None,
            "last_error": str(primary.get("last_error") or "") if primary is not None else "",
        }

    def _start_enabled_lxmf_workers(self) -> None:
        if self.lxmf_process_manager is None:
            return

        identity_store = LocalIdentityStore(self.config.local_identities_dir)

        for identity in identity_store.list_enabled_identities():
            self._start_lxmf_worker_safely(identity.id)

    def _start_lxmf_worker_safely(self, identity_id: str) -> None:
        if self.lxmf_process_manager is None:
            return

        try:
            status = self.lxmf_process_manager.start(identity_id)
            self.bus.publish(
                EngineEvent(
                    "lxmf.worker_started",
                    {
                        "identity_id": identity_id,
                        "pid": status.get("pid"),
                    },
                )
            )
        except Exception as exc:
            self.bus.publish(
                EngineEvent(
                    "lxmf.worker_error",
                    {
                        "identity_id": identity_id,
                        "exception": type(exc).__name__,
                        "message": str(exc),
                    },
                )
            )


def main() -> None:
    engine = EngineMain()
    engine.start()
    print("FriendlyNode engine stub started")


if __name__ == "__main__":
    main()
