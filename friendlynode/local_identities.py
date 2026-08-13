"""Local LXMF identity storage."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from friendlynode.config.defaults import DEFAULT_LOCAL_IDENTITIES_DIR

LOCAL_IDENTITY_CONFIG_FILENAME = "identity.json"
LOCAL_IDENTITY_STORE_MARKER_FILENAME = ".initialized"
DEFAULT_LOCAL_IDENTITY_ID = "default"
DEFAULT_LOCAL_IDENTITY_NAME = "Anonymous User"
DEFAULT_LOCAL_IDENTITY_ENABLED = True
RNS_IDENTITY_FILENAME = "rns_identity"
LOCAL_IDENTITY_SUBDIRECTORIES = (
    "contacts",
    "conversations",
    "attachments",
    "config",
    "lxmf-router",
)


@dataclass(slots=True)
class LocalIdentity:
    id: str
    display_name: str
    enabled: bool
    identity_hash: str
    lxmf_destination_hash: str
    path: Path
    config_path: Path | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "enabled": self.enabled,
            "identity_hash": self.identity_hash,
            "lxmf_destination_hash": self.lxmf_destination_hash,
            "path": str(self.path),
            "config_path": str(self.config_path) if self.config_path is not None else None,
            "directories": {
                name: str(self.path / name)
                for name in LOCAL_IDENTITY_SUBDIRECTORIES
            },
        }


class LocalIdentityStore:
    def __init__(self, identities_dir: Path = DEFAULT_LOCAL_IDENTITIES_DIR) -> None:
        self.identities_dir = identities_dir

    def list_identities(self) -> list[LocalIdentity]:
        self.ensure_default_identity()
        identities: list[LocalIdentity] = []

        for item in sorted(self.identities_dir.iterdir()):
            if not item.is_dir():
                continue

            config_path = item / LOCAL_IDENTITY_CONFIG_FILENAME
            if not config_path.exists():
                continue

            identities.append(self._load_identity(config_path))

        return identities

    def list_enabled_identities(self) -> list[LocalIdentity]:
        return [
            identity
            for identity in self.list_identities()
            if identity.enabled
        ]

    def build_draft(self) -> LocalIdentity:
        identity_id = self._next_identity_id()
        return self._build_identity(
            identity_id=identity_id,
            display_name=self._default_display_name(identity_id),
            enabled=False,
            identity_hash="",
            lxmf_destination_hash="",
        )

    def save_identity(self, payload: dict[str, object]) -> LocalIdentity:
        identity_id = self._normalise_identity_id(payload.get("id"))
        existing = self._load_existing_or_none(identity_id)
        display_name = str(payload.get("display_name") or "").strip()

        if display_name == "":
            display_name = self._default_display_name(identity_id)

        config_path = payload.get("config_path")
        identity = self._build_identity(
            identity_id=identity_id,
            display_name=display_name,
            enabled=bool(payload.get("enabled", False)),
            identity_hash=existing.identity_hash if existing is not None else "",
            lxmf_destination_hash=(
                existing.lxmf_destination_hash if existing is not None else ""
            ),
            config_path=Path(str(config_path)) if config_path not in (None, "") else None,
        )
        self._write_identity(identity)
        return identity

    def update_network_identity(
        self,
        identity_id: str,
        identity_hash: str,
        lxmf_destination_hash: str,
    ) -> LocalIdentity:
        normalised_id = self._normalise_identity_id(identity_id)
        existing = self._load_existing_or_none(normalised_id)

        if existing is None:
            raise ValueError(f"Local identity does not exist: {normalised_id}")

        identity = self._build_identity(
            identity_id=existing.id,
            display_name=existing.display_name,
            enabled=existing.enabled,
            identity_hash=identity_hash.strip().lower(),
            lxmf_destination_hash=lxmf_destination_hash.strip().lower(),
            config_path=existing.config_path,
        )
        self._write_identity(identity)
        return identity

    def remove_identity(self, identity_id: str) -> None:
        normalised_id = self._normalise_identity_id(identity_id)

        if normalised_id == DEFAULT_LOCAL_IDENTITY_ID:
            raise ValueError("Default local identity cannot be removed")

        identity_path = self._identity_path(normalised_id)

        if not identity_path.exists():
            return

        if not identity_path.is_dir() or identity_path.parent.resolve() != self.identities_dir.resolve():
            raise ValueError(f"Refusing to remove unexpected identity path: {identity_path}")

        for item in identity_path.rglob("*"):
            if item.is_file():
                item.unlink()

        for item in sorted(identity_path.rglob("*"), reverse=True):
            if item.is_dir():
                item.rmdir()

        identity_path.rmdir()

    def rns_identity_path(self, identity_id: str) -> Path:
        return self._identity_path(self._normalise_identity_id(identity_id)) / RNS_IDENTITY_FILENAME

    def lxmf_router_path(self, identity_id: str) -> Path:
        return self._identity_path(self._normalise_identity_id(identity_id)) / "lxmf-router"

    def to_dict(self) -> dict[str, object]:
        identities = [identity.to_dict() for identity in self.list_identities()]
        return {
            "identities_dir": str(self.identities_dir),
            "identities": identities,
            "schema": {
                "subdirectories": list(LOCAL_IDENTITY_SUBDIRECTORIES),
            },
        }

    def ensure_default_identity(self) -> None:
        self.identities_dir.mkdir(parents=True, exist_ok=True)
        marker_path = self.identities_dir / LOCAL_IDENTITY_STORE_MARKER_FILENAME

        if marker_path.exists():
            return

        default_path = self._identity_path(DEFAULT_LOCAL_IDENTITY_ID) / LOCAL_IDENTITY_CONFIG_FILENAME

        if default_path.exists():
            marker_path.write_text("ok\n", encoding="utf-8")
            return

        self._write_identity(
            self._build_identity(
                identity_id=DEFAULT_LOCAL_IDENTITY_ID,
                display_name=DEFAULT_LOCAL_IDENTITY_NAME,
                enabled=DEFAULT_LOCAL_IDENTITY_ENABLED,
                identity_hash="",
                lxmf_destination_hash="",
            )
        )
        marker_path.write_text("ok\n", encoding="utf-8")

    def _load_existing_or_none(self, identity_id: str) -> LocalIdentity | None:
        config_path = self._identity_path(identity_id) / LOCAL_IDENTITY_CONFIG_FILENAME
        if not config_path.exists():
            return None

        return self._load_identity(config_path)

    def _load_identity(self, config_path: Path) -> LocalIdentity:
        raw = json.loads(config_path.read_text(encoding="utf-8"))
        identity_id = self._normalise_identity_id(raw.get("id"))
        external_config_path = raw.get("config_path")
        return self._build_identity(
            identity_id=identity_id,
            display_name=str(raw.get("display_name") or self._default_display_name(identity_id)),
            enabled=bool(raw.get("enabled", False)),
            identity_hash=str(raw.get("identity_hash") or ""),
            lxmf_destination_hash=str(raw.get("lxmf_destination_hash") or ""),
            config_path=(
                Path(str(external_config_path))
                if external_config_path not in (None, "")
                else None
            ),
        )

    def _write_identity(self, identity: LocalIdentity) -> None:
        identity.path.mkdir(parents=True, exist_ok=True)

        for directory_name in LOCAL_IDENTITY_SUBDIRECTORIES:
            (identity.path / directory_name).mkdir(parents=True, exist_ok=True)

        payload = {
            "id": identity.id,
            "display_name": identity.display_name,
            "enabled": identity.enabled,
            "identity_hash": identity.identity_hash,
            "lxmf_destination_hash": identity.lxmf_destination_hash,
            "config_path": str(identity.config_path) if identity.config_path is not None else "",
        }
        (identity.path / LOCAL_IDENTITY_CONFIG_FILENAME).write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _build_identity(
        self,
        identity_id: str,
        display_name: str,
        enabled: bool,
        identity_hash: str,
        lxmf_destination_hash: str,
        config_path: Path | None = None,
    ) -> LocalIdentity:
        return LocalIdentity(
            id=identity_id,
            display_name=display_name,
            enabled=enabled,
            identity_hash=identity_hash,
            lxmf_destination_hash=lxmf_destination_hash,
            path=self._identity_path(identity_id),
            config_path=config_path,
        )

    def _next_identity_id(self) -> str:
        index = 1

        while True:
            identity_id = f"identity-{index}"
            if not self._identity_path(identity_id).exists():
                return identity_id

            index += 1

    def _identity_path(self, identity_id: str) -> Path:
        return self.identities_dir / identity_id

    def _normalise_identity_id(self, raw_id: object) -> str:
        identity_id = str(raw_id or "").strip().lower()
        identity_id = re.sub(r"[^a-z0-9_-]+", "-", identity_id).strip("-")

        if identity_id == "":
            raise ValueError("Local identity id cannot be empty")

        return identity_id

    def _default_display_name(self, identity_id: str) -> str:
        return identity_id.replace("-", " ").title()
