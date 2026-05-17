"""Controller-side state cache."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any


MAX_LOG_RECORDS = 1000
MAX_ANNOUNCE_RECORDS = 1000


@dataclass(slots=True)
class StateCache:
    engine_status: dict[str, Any] = field(default_factory=dict)
    interfaces: list[dict[str, Any]] = field(default_factory=list)
    peers: list[dict[str, Any]] = field(default_factory=list)
    nomad_nodes: list[dict[str, Any]] = field(default_factory=list)
    announces: list[dict[str, Any]] = field(default_factory=list)
    logs: list[dict[str, Any]] = field(default_factory=list)
    log_sequence: int = 0
    announce_sequence: int = 0
    _lock: threading.RLock = field(default_factory=threading.RLock)
    _announce_condition: threading.Condition = field(init=False)

    def __post_init__(self) -> None:
        self._announce_condition = threading.Condition(self._lock)

    def append_log(self, level: str, source: str, message: str) -> None:
        with self._lock:
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

        with self._lock:
            return list(self.logs[-limit:])

    def append_announce(self, record: dict[str, Any]) -> dict[str, Any]:
        with self._announce_condition:
            existing = self._find_duplicate_announce(record)

            if existing is not None:
                self._merge_announce(existing, record)
                self._announce_condition.notify_all()
                return existing

            self.announce_sequence += 1
            announce = {
                "id": self.announce_sequence,
                "time": datetime.now(UTC).isoformat(timespec="seconds"),
                **record,
            }
            self.announces.append(announce)

            if len(self.announces) > MAX_ANNOUNCE_RECORDS:
                self.announces = self.announces[-MAX_ANNOUNCE_RECORDS:]

            self._announce_condition.notify_all()
            return announce

    def _find_duplicate_announce(self, record: dict[str, Any]) -> dict[str, Any] | None:
        packet_hash = str(record.get("announce_packet_hash") or "")

        if packet_hash == "":
            return None

        for announce in reversed(self.announces):
            if str(announce.get("announce_packet_hash") or "") == packet_hash:
                return announce

        return None

    def _merge_announce(self, existing: dict[str, Any], record: dict[str, Any]) -> None:
        for key, value in record.items():
            if value in (None, ""):
                continue

            if existing.get(key) in (None, ""):
                existing[key] = value

    def snapshot_announces(
        self,
        *,
        limit: int = 500,
        filters: dict[str, object] | None = None,
    ) -> list[dict[str, Any]]:
        if limit <= 0:
            return []

        with self._lock:
            filtered = [
                announce
                for announce in self.announces
                if self._announce_matches(announce, filters or {})
            ]
            return list(filtered[-limit:])

    def wait_for_announces(
        self,
        *,
        after_id: int,
        timeout: float,
        limit: int = 500,
        filters: dict[str, object] | None = None,
    ) -> list[dict[str, Any]]:
        filter_payload = filters or {}

        with self._announce_condition:
            self._announce_condition.wait_for(
                lambda: any(
                    self._announce_after_and_matches(announce, after_id, filter_payload)
                    for announce in self.announces
                ),
                timeout=timeout,
            )
            matching = [
                announce
                for announce in self.announces
                if self._announce_after_and_matches(announce, after_id, filter_payload)
            ]
            return list(matching[:limit])

    def _announce_after_and_matches(
        self,
        announce: dict[str, Any],
        after_id: int,
        filters: dict[str, object],
    ) -> bool:
        try:
            announce_id = int(announce.get("id") or 0)
        except (TypeError, ValueError):
            announce_id = 0

        return announce_id > after_id and self._announce_matches(announce, filters)

    def _announce_matches(self, announce: dict[str, Any], filters: dict[str, object]) -> bool:
        announce_type = str(filters.get("type") or "all")
        if announce_type not in ("", "all") and str(announce.get("type") or "") != announce_type:
            return False

        name = str(filters.get("name") or "").strip().lower()
        if name != "" and name not in str(announce.get("name") or "").lower():
            return False

        destination = str(filters.get("destination") or "").strip().lower()
        if destination != "" and destination not in str(announce.get("destination_hash") or "").lower():
            return False

        identity = str(filters.get("identity") or "").strip().lower()
        if identity != "" and identity not in str(announce.get("identity_hash") or "").lower():
            return False

        lxmf = str(filters.get("lxmf") or "").strip().lower()
        if lxmf != "" and lxmf not in str(announce.get("lxmf") or "").lower():
            return False

        text = str(filters.get("text") or "").strip().lower()
        if text != "":
            searchable = " ".join(
                str(announce.get(key) or "")
                for key in (
                    "name",
                    "type",
                    "aspect",
                    "destination_hash",
                    "identity_hash",
                    "lxmf",
                    "interface",
                    "app_data_preview",
                )
            ).lower()

            if text not in searchable:
                return False

        try:
            hops = int(filters.get("hops") or 0)
        except (TypeError, ValueError):
            hops = 0

        if hops > 0:
            try:
                announce_hops = int(announce.get("hops"))
            except (TypeError, ValueError):
                return False

            if announce_hops > hops:
                return False

        return True
