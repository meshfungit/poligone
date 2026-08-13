"""Contact and conversation storage bound to local identities."""

from __future__ import annotations

import json
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path

from friendlynode.config.defaults import DEFAULT_LOCAL_IDENTITIES_DIR

TEST_CONTACT_ID = "test-contact-9f3a"
TEST_CONTACT_RECORD: dict[str, object] = {
    "id": TEST_CONTACT_ID,
    "name": "Test Contact 9F3A",
    "destination_hash": "9f3a17c4d8e2b601a45c0f91e7d2a8b3",
    "identity_hash": "0c2f91a6b8d447e19a305bf64c28de73",
    "lxmf_address": "lxmf://9f3a17c4d8e2b601a45c0f91e7d2a8b3",
    "last_announce": "never",
    "hops": 2,
    "path_status": "stub",
}
TEST_MESSAGES: list[dict[str, object]] = [
    {
        "id": "test-inbound-1",
        "direction": "inbound",
        "content": "Test",
        "created_at": "2026-05-12T00:00:00Z",
    },
    {
        "id": "test-outbound-1",
        "direction": "outbound",
        "content": "Accept Test",
        "created_at": "2026-05-12T00:01:00Z",
    },
]


class ClientContactStore:
    def __init__(self, identities_dir: Path = DEFAULT_LOCAL_IDENTITIES_DIR) -> None:
        self.identities_dir = identities_dir

    def list_conversations(self, identity_id: str) -> list[dict[str, object]]:
        identity_path = self._identity_path(identity_id)
        self._ensure_sample_conversation(identity_path)

        contacts_dir = identity_path / "contacts"
        conversations: list[dict[str, object]] = []

        for contact_path in sorted(contacts_dir.glob("*.json")):
            contact = json.loads(contact_path.read_text(encoding="utf-8"))
            contact_id = str(contact.get("id") or contact_path.stem)
            messages = self.list_messages(identity_id, contact_id)
            last_message = messages[-1]["content"] if len(messages) > 0 else ""
            conversations.append(
                {
                    "contact": contact,
                    "last_message": last_message,
                    "unread": 0,
                    "message_count": len(messages),
                    "messages": messages,
                }
            )

        return conversations

    def list_messages(self, identity_id: str, contact_id: str) -> list[dict[str, object]]:
        messages_path = self._messages_path(identity_id, contact_id)

        if not messages_path.exists():
            return []

        raw = json.loads(messages_path.read_text(encoding="utf-8"))

        if not isinstance(raw, list):
            return []

        return [message for message in raw if isinstance(message, dict)]

    def clear_messages(self, identity_id: str, contact_id: str) -> dict[str, object]:
        messages_path = self._messages_path(identity_id, contact_id)
        messages_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.write_text("[]\n", encoding="utf-8")
        return {
            "identity_id": self._normalise_id(identity_id),
            "contact_id": self._normalise_id(contact_id),
            "messages": [],
        }

    def save_contact(self, identity_id: str, payload: dict[str, object]) -> dict[str, object]:
        contact_id = self._normalise_id(
            payload.get("id")
            or payload.get("destination_hash")
            or payload.get("lxmf_address")
        )
        contact = {
            "id": contact_id,
            "name": str(payload.get("name") or self._default_display_name(contact_id)),
            "destination_hash": str(payload.get("destination_hash") or ""),
            "identity_hash": str(payload.get("identity_hash") or ""),
            "lxmf_address": str(payload.get("lxmf_address") or ""),
            "last_announce": str(payload.get("last_announce") or ""),
            "hops": payload.get("hops"),
            "path_status": str(payload.get("path_status") or "announced"),
        }
        contact_path = self._contact_path(identity_id, contact_id)
        contact_path.parent.mkdir(parents=True, exist_ok=True)
        contact_path.write_text(
            json.dumps(contact, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return contact

    def add_outbound_message(self, identity_id: str, contact_id: str, content: str) -> dict[str, object]:
        text = content.strip()

        if text == "":
            raise ValueError("Message content cannot be empty")

        messages = self.list_messages(identity_id, contact_id)
        message = {
            "id": f"outbound-{secrets.token_hex(8)}",
            "direction": "outbound",
            "content": text,
            "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        messages.append(message)

        messages_path = self._messages_path(identity_id, contact_id)
        messages_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.write_text(
            json.dumps(messages, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return message

    def export_contact(self, identity_id: str, contact_id: str) -> dict[str, object]:
        contact_path = self._contact_path(identity_id, contact_id)

        if not contact_path.exists():
            return {}

        return json.loads(contact_path.read_text(encoding="utf-8"))

    def _identity_path(self, identity_id: str) -> Path:
        return self.identities_dir / self._normalise_id(identity_id)

    def _contact_path(self, identity_id: str, contact_id: str) -> Path:
        return self._identity_path(identity_id) / "contacts" / (self._normalise_id(contact_id) + ".json")

    def _messages_path(self, identity_id: str, contact_id: str) -> Path:
        return self._identity_path(identity_id) / "conversations" / self._normalise_id(contact_id) / "messages.json"

    def _ensure_sample_conversation(self, identity_path: Path) -> None:
        if not identity_path.exists():
            return

        contact_path = identity_path / "contacts" / f"{TEST_CONTACT_ID}.json"
        messages_path = identity_path / "conversations" / TEST_CONTACT_ID / "messages.json"
        contact_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.parent.mkdir(parents=True, exist_ok=True)

        if not contact_path.exists():
            contact_path.write_text(
                json.dumps(TEST_CONTACT_RECORD, indent=2, sort_keys=True),
                encoding="utf-8",
            )

        if not messages_path.exists():
            messages_path.write_text(
                json.dumps(TEST_MESSAGES, indent=2, sort_keys=True),
                encoding="utf-8",
            )

    def _normalise_id(self, raw_id: object) -> str:
        item_id = str(raw_id or "").strip().lower()
        item_id = re.sub(r"[^a-z0-9_-]+", "-", item_id).strip("-")

        if item_id == "":
            raise ValueError("Id cannot be empty")

        return item_id

    def _default_display_name(self, item_id: str) -> str:
        return item_id.replace("-", " ").title()
