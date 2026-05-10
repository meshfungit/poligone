"""Controller-side state cache."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


MAX_LOG_RECORDS = 1000


@dataclass(slots=True)
class StateCache:
    engine_status: dict[str, Any] = field(default_factory=dict)
    interfaces: list[dict[str, Any]] = field(default_factory=list)
    peers: list[dict[str, Any]] = field(default_factory=list)
    nomad_nodes: list[dict[str, Any]] = field(default_factory=list)
    logs: list[dict[str, Any]] = field(default_factory=list)
    log_sequence: int = 0

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
