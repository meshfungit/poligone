"""NomadNet browser client stub."""

from dataclasses import dataclass

from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


@dataclass(slots=True)
class NomadNode:
    destination_hash: str
    display_name: str
    hops: int | None = None
    last_seen: float | None = None


class NomadNetClient:
    def __init__(self, bus: IpcBus) -> None:
        self.bus = bus
        self.nodes: dict[str, NomadNode] = {}

    def remember_node(self, node: NomadNode) -> None:
        self.nodes[node.destination_hash] = node
        self.bus.publish(EngineEvent("nomadnet.node.updated", {"hash": node.destination_hash}))

    def fetch_page(self, destination_hash: str, path: str = "/page/index.mu") -> str:
        self.bus.publish(EngineEvent("nomadnet.page.requested", {"hash": destination_hash, "path": path}))
        return "`cFriendlyNode NomadNet stub page\n"
