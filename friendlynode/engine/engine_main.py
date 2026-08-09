"""Engine process entry point."""

from __future__ import annotations

import sys
from typing import Any

from friendlynode.config.app_config import AppConfig
from friendlynode.engine.ipc import IpcBus
from friendlynode.engine.rns_runtime import RnsRuntime


NOMADNET_RUNTIME_MODULE_NAME = (
    "friendlynode.engine.nomadnet_runtime"
)
LXMF_CLIENT_RUNTIME_MODULE_NAME = (
    "friendlynode.engine.lxmf_client_runtime"
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
        self.lxmf_client_runtime: Any | None = None

        if self.config.nomadnet_enabled:
            from friendlynode.engine.nomadnet_runtime import (
                NomadNetRuntime,
            )

            self.nomadnet_runtime = NomadNetRuntime(
                self.rns_runtime
            )

        if self.config.client_enabled and self.config.lxmf_enabled:
            from friendlynode.engine.lxmf_client_runtime import (
                LXMFClientRuntime,
            )

            self.lxmf_client_runtime = LXMFClientRuntime(
                self.rns_runtime,
                self.config.clients_dir,
            )

    def start(self) -> None:
        self.config.ensure_dirs()
        self.rns_runtime.start()

        if self.lxmf_client_runtime is not None:
            self.lxmf_client_runtime.start()

    def stop(self) -> None:
        if self.lxmf_client_runtime is not None:
            self.lxmf_client_runtime.stop()

        self.lxmf_client_runtime = None
        self.nomadnet_runtime = None
        self.rns_runtime.stop()

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
        if self.lxmf_client_runtime is None:
            last_error = ""

            if self.config.client_enabled and not self.config.lxmf_enabled:
                last_error = "Client requires LXMF runtime"

            return {
                "enabled": self.config.client_enabled,
                "loaded": False,
                "module_imported": LXMF_CLIENT_RUNTIME_MODULE_NAME in sys.modules,
                "started": False,
                "ready": False,
                "client_id": "",
                "identity_hash": "",
                "destination_hash": "",
                "clients_dir": str(self.config.clients_dir),
                "lxmf_version": None,
                "last_error": last_error,
            }

        status = self.lxmf_client_runtime.status()
        status.update(
            {
                "enabled": self.config.client_enabled,
                "loaded": True,
                "module_imported": LXMF_CLIENT_RUNTIME_MODULE_NAME in sys.modules,
            }
        )
        return status


def main() -> None:
    engine = EngineMain()
    engine.start()
    print("FriendlyNode engine stub started")


if __name__ == "__main__":
    main()
