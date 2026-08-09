"""Optional LXMF client runtime skeleton."""

from __future__ import annotations

from pathlib import Path
from typing import Any


class LXMFClientRuntime:
    def __init__(self, rns_runtime: Any, clients_dir: Path) -> None:
        self.rns_runtime = rns_runtime
        self.clients_dir = clients_dir
        self.started = False
        self.ready = False
        self.client_id = ""
        self.identity_hash = ""
        self.destination_hash = ""
        self.last_error = ""

    def start(self) -> None:
        self.started = True
        self.ready = False
        self.last_error = ""

        if self.rns_runtime.reticulum is None:
            self.last_error = "Reticulum runtime is not running"
            return

        if self.rns_runtime.rns_using_stub:
            self.last_error = "Reticulum runtime is running in stub mode"
            return

        if self.rns_runtime.LXMF is None or self.rns_runtime.lxmf_using_stub:
            self.last_error = "LXMF runtime is not loaded"
            return

        self.last_error = "No active LXMF client identity is registered yet"

    def stop(self) -> None:
        self.started = False
        self.ready = False

    def status(self) -> dict[str, object]:
        lxmf_module = self.rns_runtime.LXMF

        return {
            "started": self.started,
            "ready": self.ready,
            "client_id": self.client_id,
            "identity_hash": self.identity_hash,
            "destination_hash": self.destination_hash,
            "clients_dir": str(self.clients_dir),
            "lxmf_version": getattr(lxmf_module, "__version__", None) if lxmf_module is not None else None,
            "last_error": self.last_error,
        }
