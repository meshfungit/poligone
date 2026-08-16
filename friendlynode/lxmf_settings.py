"""Persistent instance-wide LXMF conversation settings."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import threading


LXMF_SETTINGS_VERSION = 1
MESSAGE_MODE_DIRECT = "direct"
MESSAGE_MODE_PROPAGATION = "propagation"
MESSAGE_MODES = (
    MESSAGE_MODE_DIRECT,
    MESSAGE_MODE_PROPAGATION,
)
DEFAULT_MESSAGE_MODE = MESSAGE_MODE_DIRECT


@dataclass(slots=True)
class LxmfSettings:
    message_mode: str = DEFAULT_MESSAGE_MODE

    def to_dict(self) -> dict[str, object]:
        return {
            "message_mode": self.message_mode,
        }


class LxmfSettingsStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._lock = threading.RLock()

    def get(self) -> LxmfSettings:
        with self._lock:
            return self._load()

    def set_message_mode(self, message_mode: str) -> LxmfSettings:
        clean_mode = str(message_mode or "").strip().lower()

        if clean_mode not in MESSAGE_MODES:
            raise ValueError(f"Unsupported LXMF message mode: {clean_mode}")

        with self._lock:
            settings = self._load()
            settings.message_mode = clean_mode
            self._save(settings)
            return settings

    def _load(self) -> LxmfSettings:
        if not self.path.exists():
            return LxmfSettings()

        raw = json.loads(self.path.read_text(encoding="utf-8"))

        if not isinstance(raw, dict):
            raise ValueError("LXMF settings root must be an object")

        version = int(raw.get("version") or 0)

        if version != LXMF_SETTINGS_VERSION:
            raise ValueError(f"Unsupported LXMF settings version: {version}")

        message_mode = str(raw.get("message_mode") or DEFAULT_MESSAGE_MODE).strip().lower()

        if message_mode not in MESSAGE_MODES:
            message_mode = DEFAULT_MESSAGE_MODE

        return LxmfSettings(message_mode=message_mode)

    def _save(self, settings: LxmfSettings) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": LXMF_SETTINGS_VERSION,
            **settings.to_dict(),
        }
        temporary_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(self.path)
