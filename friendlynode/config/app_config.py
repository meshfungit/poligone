"""Application configuration objects."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from friendlynode.config.defaults import (
    DEFAULT_APP_CONFIG_PATH,
    DEFAULT_CONTROLLER_HOST,
    DEFAULT_CONTROLLER_PORT,
    DEFAULT_DATABASE_PATH,
    DEFAULT_ENGINE_NAME,
    DEFAULT_NOMADNET_PAGES_DIR,
    DEFAULT_RNS_CONFIG_DIR,
)


@dataclass(slots=True)
class AppConfig:
    controller_host: str = DEFAULT_CONTROLLER_HOST
    controller_port: int = DEFAULT_CONTROLLER_PORT

    engine_name: str = DEFAULT_ENGINE_NAME

    app_config_path: Path = DEFAULT_APP_CONFIG_PATH
    rns_config_dir: Path = DEFAULT_RNS_CONFIG_DIR
    database_path: Path = DEFAULT_DATABASE_PATH
    nomadnet_pages_dir: Path = DEFAULT_NOMADNET_PAGES_DIR

    runtime_python: Path | None = None
    runtime_source_path: Path | None = None

    @classmethod
    def load(cls, path: Path = DEFAULT_APP_CONFIG_PATH) -> "AppConfig":
        config = cls(app_config_path=path)

        if not path.exists():
            config.ensure_dirs()
            config.save()
            return config

        raw = json.loads(path.read_text(encoding="utf-8"))

        config.controller_host = str(raw.get("controller_host", config.controller_host))
        config.controller_port = int(raw.get("controller_port", config.controller_port))
        config.engine_name = str(raw.get("engine_name", config.engine_name))

        config.rns_config_dir = config._read_path(raw, "rns_config_dir", config.rns_config_dir)
        config.database_path = config._read_path(raw, "database_path", config.database_path)
        config.nomadnet_pages_dir = config._read_path(
            raw,
            "nomadnet_pages_dir",
            config.nomadnet_pages_dir,
        )

        config.ensure_dirs()
        return config

    def save(self) -> None:
        self.ensure_dirs()

        payload = {
            "controller_host": self.controller_host,
            "controller_port": self.controller_port,
            "engine_name": self.engine_name,
            "rns_config_dir": str(self.rns_config_dir),
            "database_path": str(self.database_path),
            "nomadnet_pages_dir": str(self.nomadnet_pages_dir),
        }

        self.app_config_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def set_engine_name(self, engine_name: str) -> None:
        if engine_name == "":
            raise ValueError("engine_name cannot be empty")

        self.engine_name = engine_name
        self.save()

    def ensure_dirs(self) -> None:
        self.app_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.rns_config_dir.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.nomadnet_pages_dir.mkdir(parents=True, exist_ok=True)

    def to_dict(self) -> dict[str, object]:
        return {
            "controller_host": self.controller_host,
            "controller_port": self.controller_port,
            "engine_name": self.engine_name,
            "app_config_path": str(self.app_config_path),
            "rns_config_dir": str(self.rns_config_dir),
            "database_path": str(self.database_path),
            "nomadnet_pages_dir": str(self.nomadnet_pages_dir),
            "runtime_python": str(self.runtime_python) if self.runtime_python is not None else None,
            "runtime_source_path": (
                str(self.runtime_source_path) if self.runtime_source_path is not None else None
            ),
        }

    def _read_path(self, raw: dict[str, Any], key: str, default: Path) -> Path:
        value = raw.get(key)

        if value is None or value == "":
            return default

        return Path(str(value))
