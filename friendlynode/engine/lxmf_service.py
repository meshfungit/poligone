"""LXMF service boundary."""

from pathlib import Path
from types import ModuleType
from typing import Any

from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


class LxmfService:
    def __init__(self, lxmf_module: ModuleType, rns_module: ModuleType, storage_path: Path, bus: IpcBus) -> None:
        self.LXMF = lxmf_module
        self.RNS = rns_module
        self.storage_path = storage_path
        self.bus = bus
        self.identity: Any | None = None
        self.router: Any | None = None

    def start(self, identity: Any | None = None) -> None:
        self.storage_path.mkdir(parents=True, exist_ok=True)
        self.identity = identity or self.RNS.Identity()
        self.router = self.LXMF.LXMRouter(identity=self.identity, storagepath=self.storage_path)
        if hasattr(self.router, "register_delivery_callback"):
            self.router.register_delivery_callback(self._on_message)
        self.bus.publish(EngineEvent("lxmf.started", {"storage_path": str(self.storage_path)}))

    def send_text(self, destination_hash: bytes, content: str) -> None:
        if self.router is None:
            raise RuntimeError("LXMF service is not started")
        message = self.LXMF.LXMessage(
            destination_hash=destination_hash,
            source_hash=b"local",
            content=content,
        )
        self.router.handle_outbound(message)
        self.bus.publish(EngineEvent("lxmf.outbound_queued", {"destination_hash": destination_hash.hex()}))

    def _on_message(self, message: Any) -> None:
        self.bus.publish(EngineEvent("lxmf.inbound", {"message": repr(message)}))
