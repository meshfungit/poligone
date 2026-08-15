"""Contact and conversation storage bound to local identities."""

from __future__ import annotations

import json
import re
import secrets
from datetime import UTC, datetime
from pathlib import Path

from friendlynode.config.defaults import DEFAULT_LOCAL_IDENTITIES_DIR

MESSAGE_STATE_SENDING = "sending"
MESSAGE_STATE_DELIVERED = "delivered"
MESSAGE_STATE_FAILED = "failed"
MESSAGE_STATE_RECEIVED = "received"
MESSAGE_PENDING_STATES = frozenset({
    "sending",
    "queueing",
    "queued",
})

OUTBOUND_MESSAGE_MUTABLE_FIELDS = frozenset({
    "state",
    "state_datetime",
    "lxmf_message_id",
    "destination_hash",
    "error",
})

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

        return [
            self._normalise_message_record(message)
            for message in raw
            if isinstance(message, dict)
        ]
    def clear_messages(self, identity_id: str, contact_id: str) -> dict[str, object]:
        messages_path = self._messages_path(identity_id, contact_id)
        messages_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.write_text("[]\n", encoding="utf-8")
        return {
            "identity_id": self._normalise_id(identity_id),
            "contact_id": self._normalise_id(contact_id),
            "messages": [],
        }

    def delete_message(self, identity_id: str, contact_id: str, message_id: str) -> dict[str, object]:
        target_id = str(message_id).strip()

        if target_id == "":
            raise ValueError("Message id cannot be empty")

        messages = self.list_messages(identity_id, contact_id)
        remaining = [message for message in messages if str(message.get("id") or "") != target_id]

        if len(remaining) == len(messages):
            raise ValueError(f"Message does not exist: {target_id}")

        self._write_messages(identity_id, contact_id, remaining)
        return {
            "identity_id": self._normalise_id(identity_id),
            "contact_id": self._normalise_id(contact_id),
            "message_id": target_id,
            "messages": remaining,
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

    def find_contact_by_lxmf_address(self, identity_id: str, address: str) -> dict[str, object] | None:
        target = self._normalise_lxmf_address(address)

        if target == "":
            return None

        contacts_dir = self._identity_path(identity_id) / "contacts"

        for contact_path in sorted(contacts_dir.glob("*.json")):
            contact = json.loads(contact_path.read_text(encoding="utf-8"))
            candidates = (
                contact.get("lxmf_address"),
                contact.get("destination_hash"),
            )

            if any(self._normalise_lxmf_address(candidate) == target for candidate in candidates):
                return contact

        return None

    def ensure_inbound_contact(self, identity_id: str, source_hash: str) -> dict[str, object]:
        existing = self.find_contact_by_lxmf_address(identity_id, source_hash)

        if existing is not None:
            return existing

        clean_hash = self._normalise_lxmf_address(source_hash)
        return self.save_contact(
            identity_id,
            {
                "id": f"lxmf-{clean_hash}",
                "name": f"Unknown {clean_hash[:8]}",
                "destination_hash": clean_hash,
                "lxmf_address": clean_hash,
                "path_status": "message_received",
            },
        )

    def add_inbound_message(
        self,
        identity_id: str,
        contact_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        content = str(payload.get("content") or "")
        incoming_id = str(payload.get("message_id") or "").strip().lower()
        message_id = f"inbound-{incoming_id}" if incoming_id != "" else f"inbound-{secrets.token_hex(8)}"
        messages = self.list_messages(identity_id, contact_id)

        for message in messages:
            if str(message.get("id") or "") == message_id:
                return message

        created_at = self._timestamp_to_iso(payload.get("timestamp"))
        message = {
            "id": message_id,
            "direction": "inbound",
            "content": content,
            "created_at": created_at,
            "state": MESSAGE_STATE_RECEIVED,
            "state_datetime": self._now_iso(),
            "source_hash": str(payload.get("source_hash") or ""),
            "destination_hash": str(payload.get("destination_hash") or ""),
            "title": str(payload.get("title") or ""),
            "signature_validated": bool(payload.get("signature_validated")),
            "transport_encryption": str(payload.get("transport_encryption") or ""),
        }
        messages.append(message)
        self._write_messages(identity_id, contact_id, messages)
        return message
    def add_outbound_message(self, identity_id: str, contact_id: str, content: str) -> dict[str, object]:
        text = content.strip()

        if text == "":
            raise ValueError("Message content cannot be empty")

        messages = self.list_messages(identity_id, contact_id)
        created_at = self._now_iso()
        message = {
            "id": f"outbound-{secrets.token_hex(8)}",
            "direction": "outbound",
            "content": text,
            "created_at": created_at,
            "state": MESSAGE_STATE_SENDING,
            "state_datetime": created_at,
            "lxmf_message_id": "",
            "destination_hash": "",
            "error": "",
        }
        messages.append(message)
        self._write_messages(identity_id, contact_id, messages)
        return message
    def update_outbound_message(
        self,
        identity_id: str,
        contact_id: str,
        message_id: str,
        updates: dict[str, object],
        *,
        expected_state: str | None = None,
    ) -> dict[str, object] | None:
        messages = self.list_messages(identity_id, contact_id)

        for message in messages:
            if str(message.get("id") or "") != message_id:
                continue
            if message.get("direction") != "outbound":
                return None
            if expected_state is not None and str(message.get("state") or "") != expected_state:
                return message

            previous_state = str(message.get("state") or "")
            requested_state = str(updates.get("state") or previous_state)

            for key, value in updates.items():
                if key in OUTBOUND_MESSAGE_MUTABLE_FIELDS and key not in ("state", "state_datetime"):
                    message[key] = value

            if requested_state != previous_state:
                message["state"] = requested_state
                message["state_datetime"] = self._now_iso()

            self._write_messages(identity_id, contact_id, messages)
            return message

        return None
    def fail_pending_outbound_messages(
        self,
        identity_id: str | None,
        error: str,
    ) -> int:
        identity_paths = self._pending_identity_paths(identity_id)
        failed_count = 0
        state_datetime = self._now_iso()

        for identity_path in identity_paths:
            conversations_dir = identity_path / "conversations"

            if not conversations_dir.exists():
                continue

            for messages_path in sorted(conversations_dir.glob("*/messages.json")):
                raw = json.loads(messages_path.read_text(encoding="utf-8"))

                if not isinstance(raw, list):
                    continue

                changed = False
                messages: list[dict[str, object]] = []

                for raw_message in raw:
                    if not isinstance(raw_message, dict):
                        continue

                    message = self._normalise_message_record(raw_message)
                    direction = str(message.get("direction") or "")
                    state = str(message.get("state") or "").lower()

                    if direction == "outbound" and state in MESSAGE_PENDING_STATES:
                        message["state"] = MESSAGE_STATE_FAILED
                        message["state_datetime"] = state_datetime
                        message["error"] = error
                        failed_count += 1
                        changed = True

                    messages.append(message)

                if changed:
                    messages_path.write_text(
                        json.dumps(messages, indent=2, sort_keys=True),
                        encoding="utf-8",
                    )

        return failed_count

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

    def _write_messages(self, identity_id: str, contact_id: str, messages: list[dict[str, object]]) -> None:
        messages_path = self._messages_path(identity_id, contact_id)
        messages_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.write_text(
            json.dumps(messages, indent=2, sort_keys=True),
            encoding="utf-8",
        )

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

    def _normalise_message_record(self, message: dict[str, object]) -> dict[str, object]:
        normalised = dict(message)
        direction = str(normalised.get("direction") or "")
        state = str(normalised.get("state") or "").strip().lower()

        if direction == "inbound" and state == "":
            normalised["state"] = MESSAGE_STATE_RECEIVED
        elif direction == "outbound" and state in ("queueing", "queued"):
            normalised["state"] = MESSAGE_STATE_SENDING

        return normalised

    def _pending_identity_paths(self, identity_id: str | None) -> list[Path]:
        if identity_id is not None:
            identity_path = self._identity_path(identity_id)
            return [identity_path] if identity_path.exists() else []

        if not self.identities_dir.exists():
            return []

        return [
            path
            for path in sorted(self.identities_dir.iterdir())
            if path.is_dir()
        ]

    def _normalise_id(self, raw_id: object) -> str:
        item_id = str(raw_id or "").strip().lower()
        item_id = re.sub(r"[^a-z0-9_-]+", "-", item_id).strip("-")

        if item_id == "":
            raise ValueError("Id cannot be empty")

        return item_id

    def _normalise_lxmf_address(self, value: object) -> str:
        text = str(value or "").strip().lower()

        if text.startswith("lxmf://"):
            text = text[7:]

        return text

    def _now_iso(self) -> str:
        return datetime.now(UTC).isoformat(timespec="seconds")

    def _timestamp_to_iso(self, value: object) -> str:
        try:
            timestamp = float(value)
        except (TypeError, ValueError):
            return datetime.now(UTC).isoformat(timespec="seconds")

        return datetime.fromtimestamp(timestamp, UTC).isoformat(timespec="seconds")

    def _default_display_name(self, item_id: str) -> str:
        return item_id.replace("-", " ").title()
