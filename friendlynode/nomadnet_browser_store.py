"""Persistent NomadNet browser state storage."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

NOMADNET_BROWSER_STATE_VERSION = 2
NOMADNET_BOOKMARK_ROOT_ID = "root"
NOMADNET_DEFAULT_PATH = "/page/index.mu"
NOMADNET_HISTORY_LIMIT = 50
NOMADNET_BROWSER_STATE_FILENAME = "nomadnet_browser.json"


def _default_store() -> dict[str, object]:
    return {
        "version": NOMADNET_BROWSER_STATE_VERSION,
        "history": [],
        "history_index": -1,
        "bookmarks": {
            "groups": [
                {
                    "id": NOMADNET_BOOKMARK_ROOT_ID,
                    "parent_id": "",
                    "name": "Bookmarks",
                }
            ],
            "items": [],
            "collapsed_group_ids": [],
        },
    }


class NomadNetBrowserStore:
    """JSON-backed store for browser history and bookmarks."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self._lock = threading.RLock()

    def load(self) -> dict[str, object]:
        with self._lock:
            if not self.path.exists():
                data = _default_store()
                self._write_locked(data)
                return data

            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                raw = {}

            data = self._normalise(raw)
            self._write_locked(data)
            return data

    def save(self, payload: dict[str, object]) -> dict[str, object]:
        with self._lock:
            data = self._normalise(payload)
            self._write_locked(data)
            return data

    def _write_locked(self, data: dict[str, object]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary_path.write_text(
            json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False),
            encoding="utf-8",
        )
        temporary_path.replace(self.path)

    def _normalise(self, payload: object) -> dict[str, object]:
        if not isinstance(payload, dict):
            payload = {}

        bookmarks = self._normalise_bookmarks(payload.get("bookmarks"))
        history = [
            entry
            for item in self._as_list(payload.get("history"))
            if (entry := self._normalise_page_entry(item)) is not None
        ][-NOMADNET_HISTORY_LIMIT:]
        history_index = self._normalise_history_index(payload.get("history_index"), len(history))

        return {
            "version": NOMADNET_BROWSER_STATE_VERSION,
            "history": history,
            "history_index": history_index,
            "bookmarks": bookmarks,
        }

    def _normalise_history_index(self, value: object, history_length: int) -> int:
        if history_length <= 0:
            return -1

        try:
            index = int(value)
        except (TypeError, ValueError):
            return history_length - 1

        if index < 0:
            return -1

        return min(index, history_length - 1)

    def _normalise_bookmarks(self, raw: object) -> dict[str, object]:
        default = _default_store()["bookmarks"]

        if not isinstance(default, dict):
            raise RuntimeError("Default bookmark store is invalid")

        if isinstance(raw, list):
            return self._normalise_legacy_bookmark_list(raw)

        if not isinstance(raw, dict):
            return default

        groups = self._normalise_bookmark_groups(raw.get("groups"))
        group_ids = {str(group["id"]) for group in groups}
        items = []
        seen_keys = set()

        for raw_item in self._as_list(raw.get("items")):
            item = self._normalise_bookmark_item(raw_item, group_ids)

            if item is None:
                continue

            key = (item["destination_hash"], item["path"])

            if key in seen_keys:
                continue

            seen_keys.add(key)
            items.append(item)

        return {
            "groups": groups,
            "items": items,
            "collapsed_group_ids": self._normalise_collapsed_group_ids(
                raw.get("collapsed_group_ids"),
                group_ids,
            ),
        }

    def _normalise_legacy_bookmark_list(self, raw: list[object]) -> dict[str, object]:
        bookmarks = _default_store()["bookmarks"]

        if not isinstance(bookmarks, dict):
            raise RuntimeError("Default bookmark store is invalid")

        items = []
        seen = set()

        for value in raw:
            destination = self._normalise_destination_hash(value)

            if destination == "" or destination in seen:
                continue

            seen.add(destination)
            items.append(
                {
                    "id": f"bookmark-{destination[:12]}",
                    "group_id": NOMADNET_BOOKMARK_ROOT_ID,
                    "name": destination,
                    "destination_hash": destination,
                    "identity_hash": "",
                    "hops": "",
                    "path": NOMADNET_DEFAULT_PATH,
                    "announced_path": NOMADNET_DEFAULT_PATH,
                    "runtime": "stub",
                    "last_interface": "",
                    "last_transport": {},
                    "last_announce_at": "",
                    "last_success_at": "",
                    "last_opened_at": "",
                    "announce_seen_count": 0,
                    "created_at": "",
                    "updated_at": "",
                }
            )

        bookmarks["items"] = items
        return bookmarks

    def _normalise_bookmark_groups(self, raw: object) -> list[dict[str, object]]:
        groups = [
            {
                "id": NOMADNET_BOOKMARK_ROOT_ID,
                "parent_id": "",
                "name": "Bookmarks",
            }
        ]
        group_ids = {NOMADNET_BOOKMARK_ROOT_ID}

        for raw_group in self._as_list(raw):
            if not isinstance(raw_group, dict):
                continue

            group_id = self._normalise_string(raw_group.get("id"))

            if group_id == "" or group_id in group_ids:
                continue

            group_ids.add(group_id)
            groups.append(
                {
                    "id": group_id,
                    "parent_id": self._normalise_string(
                        raw_group.get("parent_id") or NOMADNET_BOOKMARK_ROOT_ID,
                    ),
                    "name": self._normalise_string(raw_group.get("name") or "Group") or "Group",
                }
            )

        for group in groups:
            group_id = str(group["id"])

            if group_id == NOMADNET_BOOKMARK_ROOT_ID:
                group["parent_id"] = ""
                continue

            parent_id = str(group.get("parent_id") or NOMADNET_BOOKMARK_ROOT_ID)

            if parent_id not in group_ids or parent_id == group_id:
                group["parent_id"] = NOMADNET_BOOKMARK_ROOT_ID

        return groups

    def _normalise_collapsed_group_ids(
        self,
        raw: object,
        group_ids: set[str],
    ) -> list[str]:
        collapsed_group_ids = []
        seen = set()

        for value in self._as_list(raw):
            group_id = self._normalise_string(value)

            if group_id == "" or group_id not in group_ids or group_id in seen:
                continue

            seen.add(group_id)
            collapsed_group_ids.append(group_id)

        return collapsed_group_ids

    def _normalise_bookmark_item(
        self,
        raw: object,
        group_ids: set[str],
    ) -> dict[str, object] | None:
        if not isinstance(raw, dict):
            return None

        entry = self._normalise_page_entry(raw)

        if entry is None:
            return None

        item_id = self._normalise_string(raw.get("id"))
        group_id = self._normalise_string(raw.get("group_id") or NOMADNET_BOOKMARK_ROOT_ID)

        if item_id == "":
            item_id = f"bookmark-{entry['destination_hash'][:12]}-{abs(hash(entry['path']))}"

        if group_id not in group_ids:
            group_id = NOMADNET_BOOKMARK_ROOT_ID

        return {
            "id": item_id,
            "group_id": group_id,
            "name": self._normalise_string(raw.get("name") or entry["name"] or entry["destination_hash"]),
            "destination_hash": entry["destination_hash"],
            "identity_hash": entry["identity_hash"],
            "hops": entry["hops"],
            "path": entry["path"],
            "announced_path": self._normalise_path(raw.get("announced_path") or entry["path"]),
            "runtime": entry["runtime"],
            "last_interface": entry["last_interface"],
            "last_transport": entry["last_transport"],
            "last_announce_at": entry["last_announce_at"],
            "last_success_at": entry["last_success_at"],
            "last_opened_at": entry["last_opened_at"],
            "announce_seen_count": self._normalise_non_negative_int(raw.get("announce_seen_count")),
            "created_at": self._normalise_string(raw.get("created_at")),
            "updated_at": self._normalise_string(raw.get("updated_at")),
        }

    def _normalise_page_entry(self, raw: object) -> dict[str, object] | None:
        if not isinstance(raw, dict):
            return None

        destination = self._normalise_destination_hash(raw.get("destination_hash"))

        if destination == "":
            return None

        return {
            "name": self._normalise_string(raw.get("name")),
            "destination_hash": destination,
            "identity_hash": self._normalise_string(raw.get("identity_hash")),
            "hops": self._normalise_hops(raw.get("hops", "")),
            "path": self._normalise_path(raw.get("path")),
            "source": "",
            "runtime": self._normalise_string(raw.get("runtime") or "stub") or "stub",
            "error": "",
            "loading": False,
            "last_interface": self._normalise_string(raw.get("last_interface")),
            "last_transport": self._normalise_transport_hint(raw.get("last_transport")),
            "last_announce_at": self._normalise_string(raw.get("last_announce_at")),
            "last_success_at": self._normalise_string(raw.get("last_success_at")),
            "last_opened_at": self._normalise_string(raw.get("last_opened_at")),
        }

    def _normalise_transport_hint(self, raw: object) -> dict[str, object]:
        if not isinstance(raw, dict):
            return {}

        hint = {}

        for key in (
            "interface",
            "interface_name",
            "interface_type",
            "target_host",
            "target_port",
            "transport_identity_hash",
            "next_hop",
        ):
            value = self._normalise_string(raw.get(key))

            if value == "":
                continue

            hint[key] = value

        return hint

    def _normalise_destination_hash(self, value: object) -> str:
        destination = self._normalise_string(value).lower()

        if len(destination) != 32:
            return ""

        if any(char not in "0123456789abcdef" for char in destination):
            return ""

        return destination

    def _normalise_path(self, value: object) -> str:
        clean = self._normalise_string(value or NOMADNET_DEFAULT_PATH).replace("\\", "/")

        if clean == "":
            clean = NOMADNET_DEFAULT_PATH

        if not clean.startswith("/"):
            clean = f"/{clean}"

        if "\0" in clean or "//" in clean or "/../" in clean or clean.endswith("/.."):
            return NOMADNET_DEFAULT_PATH

        return clean

    def _normalise_hops(self, value: object) -> int | str:
        if value is None or value == "":
            return ""

        try:
            hops = int(value)
        except (TypeError, ValueError):
            return ""

        if hops < 0:
            return ""

        return hops

    def _normalise_non_negative_int(self, value: object) -> int:
        try:
            number = int(value)
        except (TypeError, ValueError):
            return 0

        return max(0, number)

    def _normalise_string(self, value: object) -> str:
        return str(value or "").strip()

    def _as_list(self, value: object) -> list[object]:
        return value if isinstance(value, list) else []
