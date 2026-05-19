"""Persistent NomadNet browser state storage."""

from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

NOMADNET_BROWSER_STATE_VERSION = 1
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
        }

    def _normalise_legacy_bookmark_list(self, raw: list[object]) -> dict[str, object]:
        bookmarks = _default_store()["bookmarks"]

        if not isinstance(bookmarks, dict):
            raise RuntimeError("Default bookmark store is invalid")

        items = []
        seen = set()

        for value in raw:
            destination = str(value or "").strip().lower()

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
                    "runtime": "stub",
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

            group_id = str(raw_group.get("id") or "").strip()

            if group_id == "" or group_id in group_ids:
                continue

            group_ids.add(group_id)
            groups.append(
                {
                    "id": group_id,
                    "parent_id": str(raw_group.get("parent_id") or NOMADNET_BOOKMARK_ROOT_ID).strip(),
                    "name": str(raw_group.get("name") or "Group").strip() or "Group",
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

        item_id = str(raw.get("id") or "").strip()
        group_id = str(raw.get("group_id") or NOMADNET_BOOKMARK_ROOT_ID).strip()

        if item_id == "":
            item_id = f"bookmark-{entry['destination_hash'][:12]}-{abs(hash(entry['path']))}"

        if group_id not in group_ids:
            group_id = NOMADNET_BOOKMARK_ROOT_ID

        return {
            "id": item_id,
            "group_id": group_id,
            "name": str(raw.get("name") or entry["name"] or entry["destination_hash"]).strip(),
            "destination_hash": entry["destination_hash"],
            "identity_hash": entry["identity_hash"],
            "hops": entry["hops"],
            "path": entry["path"],
            "runtime": entry["runtime"],
            "created_at": str(raw.get("created_at") or ""),
            "updated_at": str(raw.get("updated_at") or ""),
        }

    def _normalise_page_entry(self, raw: object) -> dict[str, object] | None:
        if not isinstance(raw, dict):
            return None

        destination = str(raw.get("destination_hash") or "").strip().lower()

        if destination == "":
            return None

        path = str(raw.get("path") or NOMADNET_DEFAULT_PATH).strip() or NOMADNET_DEFAULT_PATH

        if not path.startswith("/"):
            path = f"/{path}"

        return {
            "name": str(raw.get("name") or ""),
            "destination_hash": destination,
            "identity_hash": str(raw.get("identity_hash") or ""),
            "hops": raw.get("hops", ""),
            "path": path,
            "source": "",
            "runtime": str(raw.get("runtime") or "stub"),
            "error": "",
            "loading": False,
        }

    def _as_list(self, value: object) -> list[object]:
        return value if isinstance(value, list) else []
