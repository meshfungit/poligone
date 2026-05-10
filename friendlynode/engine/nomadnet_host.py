"""Static NomadNet host stub."""

from pathlib import Path

from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


class NomadNetHost:
    def __init__(self, pages_dir: Path, bus: IpcBus) -> None:
        self.pages_dir = pages_dir
        self.bus = bus
        self.enabled = False

    def enable(self) -> None:
        self.pages_dir.mkdir(parents=True, exist_ok=True)
        index_path = self.pages_dir / "index.mu"
        if not index_path.exists():
            index_path.write_text("`cFriendlyNode local page\n", encoding="utf-8")
        self.enabled = True
        self.bus.publish(EngineEvent("nomadnet.host.enabled", {"pages_dir": str(self.pages_dir)}))

    def disable(self) -> None:
        self.enabled = False
        self.bus.publish(EngineEvent("nomadnet.host.disabled"))
