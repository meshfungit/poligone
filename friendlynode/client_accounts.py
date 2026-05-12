"""Client account storage and defaults."""

from __future__ import annotations

import json
import re
import secrets
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from datetime import UTC, datetime

from friendlynode.config.defaults import DEFAULT_CLIENTS_DIR


CLIENT_CONFIG_FILENAME = "client.json"
CLIENT_STORE_MARKER_FILENAME = ".initialized"
DEFAULT_CLIENT_ID = "default"
DEFAULT_CLIENT_NAME = "Default Client"
DEFAULT_RUNTIME_MODE = "shared"
SUPPORTED_RUNTIME_MODES = ("shared", "isolated")
CLIENT_SUBDIRECTORIES = (
    "identities",
    "config",
    "groups",
    "contacts",
    "conversations",
    "attachments",
    "themes",
)
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


@dataclass(slots=True)
class ClientAccount:
    id: str
    display_name: str
    enabled: bool
    runtime_mode: str
    identity_hash: str
    lxmf_destination_hash: str
    path: Path
    config_path: Path | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "enabled": self.enabled,
            "runtime_mode": self.runtime_mode,
            "identity_hash": self.identity_hash,
            "lxmf_destination_hash": self.lxmf_destination_hash,
            "path": str(self.path),
            "config_path": str(self.config_path) if self.config_path is not None else None,
            "directories": {
                name: str(self.path / name)
                for name in CLIENT_SUBDIRECTORIES
            },
        }


class ClientAccountStore:
    def __init__(self, clients_dir: Path = DEFAULT_CLIENTS_DIR) -> None:
        self.clients_dir = clients_dir

    def list_clients(self) -> list[ClientAccount]:
        self.ensure_default_client()
        clients: list[ClientAccount] = []

        for item in sorted(self.clients_dir.iterdir()):
            if not item.is_dir():
                continue

            config_path = item / CLIENT_CONFIG_FILENAME
            if not config_path.exists():
                continue

            clients.append(self._load_client(config_path))

        return clients

    def build_draft(self) -> ClientAccount:
        client_id = self._next_client_id()
        return self._build_client(
            client_id=client_id,
            display_name=self._default_display_name(client_id),
            enabled=False,
            runtime_mode=DEFAULT_RUNTIME_MODE,
            identity_hash=self._new_hash(),
            lxmf_destination_hash=self._new_hash(),
        )

    def save_client(self, payload: dict[str, object]) -> ClientAccount:
        client_id = self._normalise_client_id(payload.get("id"))
        existing = self._load_existing_or_none(client_id)

        identity_hash = str(payload.get("identity_hash") or "")
        lxmf_destination_hash = str(payload.get("lxmf_destination_hash") or "")

        if identity_hash == "":
            identity_hash = existing.identity_hash if existing is not None else self._new_hash()

        if lxmf_destination_hash == "":
            lxmf_destination_hash = (
                existing.lxmf_destination_hash if existing is not None else self._new_hash()
            )

        runtime_mode = str(payload.get("runtime_mode") or DEFAULT_RUNTIME_MODE)
        if runtime_mode not in SUPPORTED_RUNTIME_MODES:
            runtime_mode = DEFAULT_RUNTIME_MODE

        display_name = str(payload.get("display_name") or "").strip()
        if display_name == "":
            display_name = self._default_display_name(client_id)

        config_path = payload.get("config_path")
        client = self._build_client(
            client_id=client_id,
            display_name=display_name,
            enabled=bool(payload.get("enabled", False)),
            runtime_mode=runtime_mode,
            identity_hash=identity_hash,
            lxmf_destination_hash=lxmf_destination_hash,
            config_path=Path(str(config_path)) if config_path not in (None, "") else None,
        )
        self._write_client(client)
        return client

    def remove_client(self, client_id: str) -> None:
        normalised_id = self._normalise_client_id(client_id)
        client_path = self._client_path(normalised_id)

        if not client_path.exists():
            return

        if not client_path.is_dir() or client_path.parent.resolve() != self.clients_dir.resolve():
            raise ValueError(f"Refusing to remove unexpected client path: {client_path}")

        for item in client_path.rglob("*"):
            if item.is_file():
                item.unlink()

        for item in sorted(client_path.rglob("*"), reverse=True):
            if item.is_dir():
                item.rmdir()

        client_path.rmdir()

    def to_dict(self) -> dict[str, object]:
        clients = []

        for client in self.list_clients():
            client_payload = client.to_dict()
            client_payload["conversations"] = self.list_conversations(client.id)
            clients.append(client_payload)

        return {
            "clients_dir": str(self.clients_dir),
            "clients": clients,
            "schema": {
                "runtime_modes": list(SUPPORTED_RUNTIME_MODES),
                "subdirectories": list(CLIENT_SUBDIRECTORIES),
            },
        }

    def list_conversations(self, client_id: str) -> list[dict[str, object]]:
        client_path = self._client_path(self._normalise_client_id(client_id))
        self._ensure_sample_conversation(client_path)

        contacts_dir = client_path / "contacts"
        conversations: list[dict[str, object]] = []

        for contact_path in sorted(contacts_dir.glob("*.json")):
            contact = json.loads(contact_path.read_text(encoding="utf-8"))
            contact_id = str(contact.get("id") or contact_path.stem)
            messages = self.list_messages(client_id, contact_id)
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

    def list_messages(self, client_id: str, contact_id: str) -> list[dict[str, object]]:
        messages_path = self._messages_path(client_id, contact_id)
        if not messages_path.exists():
            return []
        raw = json.loads(messages_path.read_text(encoding="utf-8"))
        if not isinstance(raw, list):
            return []
        return [message for message in raw if isinstance(message, dict)]

    def clear_messages(self, client_id: str, contact_id: str) -> dict[str, object]:
        messages_path = self._messages_path(client_id, contact_id)
        messages_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.write_text("[]\n", encoding="utf-8")
        return {
            "client_id": self._normalise_client_id(client_id),
            "contact_id": self._normalise_client_id(contact_id),
            "messages": [],
        }

    def add_outbound_message(self, client_id: str, contact_id: str, content: str) -> dict[str, object]:
        text = content.strip()
        if text == "":
            raise ValueError("Message content cannot be empty")

        messages = self.list_messages(client_id, contact_id)
        message = {
            "id": f"outbound-{secrets.token_hex(8)}",
            "direction": "outbound",
            "content": text,
            "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
        }
        messages.append(message)

        messages_path = self._messages_path(client_id, contact_id)
        messages_path.parent.mkdir(parents=True, exist_ok=True)
        messages_path.write_text(
            json.dumps(messages, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        return message

    def export_contact(self, client_id: str, contact_id: str) -> dict[str, object]:
        contact_path = self._contact_path(client_id, contact_id)
        if not contact_path.exists():
            return {}
        return json.loads(contact_path.read_text(encoding="utf-8"))

    def ensure_default_client(self) -> None:
        self.clients_dir.mkdir(parents=True, exist_ok=True)
        marker_path = self.clients_dir / CLIENT_STORE_MARKER_FILENAME

        if marker_path.exists():
            return

        default_path = self._client_path(DEFAULT_CLIENT_ID) / CLIENT_CONFIG_FILENAME

        if default_path.exists():
            marker_path.write_text("ok\n", encoding="utf-8")
            return

        self._write_client(
            self._build_client(
                client_id=DEFAULT_CLIENT_ID,
                display_name=DEFAULT_CLIENT_NAME,
                enabled=False,
                runtime_mode=DEFAULT_RUNTIME_MODE,
                identity_hash=self._new_hash(),
                lxmf_destination_hash=self._new_hash(),
            )
        )
        marker_path.write_text("ok\n", encoding="utf-8")

    def _load_existing_or_none(self, client_id: str) -> ClientAccount | None:
        config_path = self._client_path(client_id) / CLIENT_CONFIG_FILENAME
        if not config_path.exists():
            return None
        return self._load_client(config_path)

    def _load_client(self, config_path: Path) -> ClientAccount:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        client_id = self._normalise_client_id(raw.get("id"))
        runtime_mode = str(raw.get("runtime_mode") or DEFAULT_RUNTIME_MODE)

        if runtime_mode not in SUPPORTED_RUNTIME_MODES:
            runtime_mode = DEFAULT_RUNTIME_MODE

        external_config_path = raw.get("config_path")

        return self._build_client(
            client_id=client_id,
            display_name=str(raw.get("display_name") or self._default_display_name(client_id)),
            enabled=bool(raw.get("enabled", False)),
            runtime_mode=runtime_mode,
            identity_hash=str(raw.get("identity_hash") or self._new_hash()),
            lxmf_destination_hash=str(raw.get("lxmf_destination_hash") or self._new_hash()),
            config_path=(
                Path(str(external_config_path))
                if external_config_path not in (None, "")
                else None
            ),
        )

    def _write_client(self, client: ClientAccount) -> None:
        client.path.mkdir(parents=True, exist_ok=True)

        for directory_name in CLIENT_SUBDIRECTORIES:
            (client.path / directory_name).mkdir(parents=True, exist_ok=True)

        payload = {
            "id": client.id,
            "display_name": client.display_name,
            "enabled": client.enabled,
            "runtime_mode": client.runtime_mode,
            "identity_hash": client.identity_hash,
            "lxmf_destination_hash": client.lxmf_destination_hash,
            "config_path": str(client.config_path) if client.config_path is not None else "",
        }
        (client.path / CLIENT_CONFIG_FILENAME).write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        self._ensure_sample_conversation(client.path)

    def _build_client(
        self,
        client_id: str,
        display_name: str,
        enabled: bool,
        runtime_mode: str,
        identity_hash: str,
        lxmf_destination_hash: str,
        config_path: Path | None = None,
    ) -> ClientAccount:
        return ClientAccount(
            id=client_id,
            display_name=display_name,
            enabled=enabled,
            runtime_mode=runtime_mode,
            identity_hash=identity_hash,
            lxmf_destination_hash=lxmf_destination_hash,
            path=self._client_path(client_id),
            config_path=config_path,
        )

    def _next_client_id(self) -> str:
        index = 1

        while True:
            client_id = f"client-{index}"
            if not self._client_path(client_id).exists():
                return client_id
            index += 1

    def _client_path(self, client_id: str) -> Path:
        return self.clients_dir / client_id

    def _contact_path(self, client_id: str, contact_id: str) -> Path:
        return self._client_path(self._normalise_client_id(client_id)) / "contacts" / (
            self._normalise_client_id(contact_id) + ".json"
        )

    def _messages_path(self, client_id: str, contact_id: str) -> Path:
        return (
            self._client_path(self._normalise_client_id(client_id))
            / "conversations"
            / self._normalise_client_id(contact_id)
            / "messages.json"
        )

    def _ensure_sample_conversation(self, client_path: Path) -> None:
        if not client_path.exists():
            return

        contact_path = client_path / "contacts" / f"{TEST_CONTACT_ID}.json"
        messages_path = client_path / "conversations" / TEST_CONTACT_ID / "messages.json"
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

    def _normalise_client_id(self, raw_id: object) -> str:
        client_id = str(raw_id or "").strip().lower()
        client_id = re.sub(r"[^a-z0-9_-]+", "-", client_id).strip("-")

        if client_id == "":
            raise ValueError("Client id cannot be empty")

        return client_id

    def _default_display_name(self, client_id: str) -> str:
        return client_id.replace("-", " ").title()

    def _new_hash(self) -> str:
        return secrets.token_hex(16)
