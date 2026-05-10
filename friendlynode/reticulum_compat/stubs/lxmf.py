"""Very small LXMF stub used before real LXMF is installed."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

__version__ = "stub-lxmf"


@dataclass(slots=True)
class LXMessage:
    destination_hash: bytes
    source_hash: bytes
    content: str
    title: str = ""
    fields: dict[int, Any] | None = None


class LXMRouter:
    def __init__(self, identity: Any, storagepath: str | Path | None = None) -> None:
        self.identity = identity
        self.storagepath = Path(storagepath) if storagepath else None
        self.delivery_callback: Callable[[LXMessage], None] | None = None

    def register_delivery_identity(self, identity: Any, display_name: str | None = None) -> Any:
        return identity

    def register_delivery_callback(self, callback: Callable[[LXMessage], None]) -> None:
        self.delivery_callback = callback

    def handle_outbound(self, message: LXMessage) -> None:
        return None

    def announce(self, destination_hash: bytes | None = None) -> None:
        return None
