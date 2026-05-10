"""Very small RNS stub used before real Reticulum is installed."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

__version__ = "stub-rns"


class Identity:
    def __init__(self) -> None:
        self.hash = b"stub-identity"

    @staticmethod
    def remember(*_args: Any, **_kwargs: Any) -> None:
        return None


class Reticulum:
    def __init__(self, configdir: str | Path | None = None) -> None:
        self.configdir = Path(configdir) if configdir else None


@dataclass(slots=True)
class Destination:
    identity: Identity
    direction: str
    proof_strategy: str
    app_name: str
    aspect: str

    IN = "in"
    OUT = "out"
    SINGLE = "single"
    GROUP = "group"


class Link:
    MDU = 512

    def __init__(self, destination: Destination) -> None:
        self.destination = destination

    def teardown(self) -> None:
        return None


class Packet:
    def __init__(self, destination_or_link: Destination | Link, data: bytes) -> None:
        self.destination_or_link = destination_or_link
        self.data = data

    def send(self) -> None:
        return None


class Transport:
    _announce_handlers: list[Any] = []

    @classmethod
    def register_announce_handler(cls, handler: Any) -> None:
        cls._announce_handlers.append(handler)

    @classmethod
    def request_path(cls, destination_hash: bytes) -> None:
        return None

    @classmethod
    def has_path(cls, destination_hash: bytes) -> bool:
        return False


def prettyhexrep(value: bytes | str) -> str:
    if isinstance(value, bytes):
        return "<" + value.hex() + ">"
    return f"<{value}>"


def log(message: str, level: int | None = None) -> None:
    print(message)


class AnnounceHandler:
    aspect_filter: str | None = None
    received_announce: Callable[..., None]
