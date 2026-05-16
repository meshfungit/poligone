"""Announce handler stubs."""

from dataclasses import dataclass
from typing import Any

from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


@dataclass(slots=True)
class AnnounceRecord:
    aspect: str
    destination_hash: str
    display_name: str = ""
    hops: int | None = None
    raw: dict[str, Any] | None = None


class GenericAnnounceHandler:
    def __init__(self, aspect_filter: str, bus: IpcBus) -> None:
        self.aspect_filter = aspect_filter
        self.bus = bus

    def received_announce(
        self,
        destination_hash: bytes,
        announced_identity: Any,
        app_data: bytes,
        announce_packet_hash: bytes | None = None,
        is_path_response: bool = False,
    ) -> None:
        self.bus.publish(
            EngineEvent(
                "announce.received",
                {
                    "aspect": self.aspect_filter,
                    "destination_hash": destination_hash.hex(),
                    "app_data_hex": app_data.hex() if isinstance(app_data, bytes) else "",
                    "announce_packet_hash": announce_packet_hash.hex() if isinstance(announce_packet_hash, bytes) else "",
                    "is_path_response": is_path_response,
                },
            )
        )


DEFAULT_ANNOUNCE_ASPECTS = (
    "lxmf.delivery",
    "lxmf.propagation",
    "nomadnetwork.node",
)
