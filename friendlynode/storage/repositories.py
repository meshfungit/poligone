"""Repository stubs for messages, peers and NomadNet nodes."""

from dataclasses import dataclass


@dataclass(slots=True)
class MessageRecord:
    destination_hash: str
    source_hash: str
    content: str
    created_at: float


class MessageRepository:
    def list_recent(self) -> list[MessageRecord]:
        return []


class PeerRepository:
    def list_known(self) -> list[dict[str, object]]:
        return []


class NomadNodeRepository:
    def list_known(self) -> list[dict[str, object]]:
        return []
