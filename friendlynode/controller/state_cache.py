"""Controller-side state cache."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


MAX_LOG_RECORDS = 1000
MAX_ANNOUNCE_RECORDS = 1000


def build_stub_announces() -> list[dict[str, Any]]:
    return [
        {
            "id": 1,
            "time": "stub",
            "type": "identity",
            "name": "Test Identity 7D2C",
            "identity_hash": "7d2c3a6e91f0418aa0f7d45c3e2b9f01",
            "lxmf": "3c17802a5183b196c1e11ffa7cae78e0",
            "aspect": "lxmf.delivery",
            "destination_hash": "3c17802a5183b196c1e11ffa7cae78e0",
            "hops": 1,
            "interface": "Local Auto",
        },
        {
            "id": 2,
            "time": "stub",
            "type": "nomadnet",
            "name": "NomadNet Node 4A91",
            "identity_hash": "4a91f0b8de6a21c940cc0e5a8843d1b7",
            "lxmf": "",
            "aspect": "nomadnetwork.node",
            "destination_hash": "91d4bceab5f0123377aa901ed56c4a91",
            "hops": 2,
            "interface": "Backbone",
        },
        {
            "id": 3,
            "time": "stub",
            "type": "transport",
            "name": "TCP Gateway 4242",
            "identity_hash": "a05f7192b6c43e8d99820146cded138a",
            "lxmf": "",
            "aspect": "transport.interface",
            "destination_hash": "bb6e79054d924d3b9ed97bb5d2a44a7c",
            "hops": 0,
            "interface": "TCPServerInterface",
        },
    ]


@dataclass(slots=True)
class StateCache:
    engine_status: dict[str, Any] = field(default_factory=dict)
    interfaces: list[dict[str, Any]] = field(default_factory=list)
    peers: list[dict[str, Any]] = field(default_factory=list)
    nomad_nodes: list[dict[str, Any]] = field(default_factory=list)
    announces: list[dict[str, Any]] = field(default_factory=build_stub_announces)
    logs: list[dict[str, Any]] = field(default_factory=list)
    log_sequence: int = 0
    announce_sequence: int = 3

    def append_log(self, level: str, source: str, message: str) -> None:
        self.log_sequence += 1

        self.logs.append(
            {
                "id": self.log_sequence,
                "time": datetime.now(UTC).isoformat(timespec="seconds"),
                "level": level,
                "source": source,
                "message": message,
            }
        )

        if len(self.logs) > MAX_LOG_RECORDS:
            self.logs = self.logs[-MAX_LOG_RECORDS:]

    def snapshot_logs(self, limit: int = 200) -> list[dict[str, Any]]:
        if limit <= 0:
            return []

        return list(self.logs[-limit:])

    def append_announce(self, record: dict[str, Any]) -> None:
        self.announce_sequence += 1
        announce = {
            "id": self.announce_sequence,
            "time": datetime.now(UTC).isoformat(timespec="seconds"),
            **record,
        }
        self.announces.append(announce)

        if len(self.announces) > MAX_ANNOUNCE_RECORDS:
            self.announces = self.announces[-MAX_ANNOUNCE_RECORDS:]

    def snapshot_announces(self, limit: int = 500) -> list[dict[str, Any]]:
        if limit <= 0:
            return []

        return list(self.announces[-limit:])
