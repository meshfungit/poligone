"""Runtime discovery and selection."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from friendlynode.config.defaults import RUNTIMES_DIR


RUNTIME_MANIFEST_NAME = "runtime.json"
DEFAULT_RUNTIME_NAME = "stub"


@dataclass(slots=True)
class RuntimeInfo:
    name: str
    label: str
    kind: str
    path: Path
    enabled: bool
    python_path: Path | None = None
    source_path: Path | None = None
    description: str = ""

    @property
    def is_stub(self) -> bool:
        return self.kind == "stub"

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "label": self.label,
            "kind": self.kind,
            "path": str(self.path),
            "enabled": self.enabled,
            "python_path": str(self.python_path) if self.python_path is not None else None,
            "source_path": str(self.source_path) if self.source_path is not None else None,
            "description": self.description,
            "is_stub": self.is_stub,
            "python_exists": self.python_path.exists() if self.python_path is not None else None,
            "source_exists": self.source_path.exists() if self.source_path is not None else None,
        }


class RuntimeManager:
    def __init__(self, runtimes_dir: Path = RUNTIMES_DIR) -> None:
        self.runtimes_dir = runtimes_dir

    def list_runtimes(self) -> list[RuntimeInfo]:
        self.runtimes_dir.mkdir(parents=True, exist_ok=True)

        runtimes: list[RuntimeInfo] = []
        seen_names: set[str] = set()

        for item in sorted(self.runtimes_dir.iterdir()):
            if not item.is_dir():
                continue

            manifest_path = item / RUNTIME_MANIFEST_NAME

            if not manifest_path.exists():
                continue

            runtime = self._load_runtime_manifest(item, manifest_path)

            if runtime.name in seen_names:
                continue

            runtimes.append(runtime)
            seen_names.add(runtime.name)

        if DEFAULT_RUNTIME_NAME not in seen_names:
            runtimes.insert(0, self._fallback_stub_runtime())

        return runtimes

    def get_runtime(self, name: str) -> RuntimeInfo:
        for runtime in self.list_runtimes():
            if runtime.name == name:
                return runtime

        raise KeyError(f"Runtime not found: {name}")

    def get_default_runtime(self) -> RuntimeInfo:
        return self.get_runtime(DEFAULT_RUNTIME_NAME)

    def _load_runtime_manifest(self, runtime_path: Path, manifest_path: Path) -> RuntimeInfo:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))

        name = self._require_string(raw, "name")
        label = self._optional_string(raw, "label", name)
        kind = self._optional_string(raw, "kind", "external")
        description = self._optional_string(raw, "description", "")
        enabled = bool(raw.get("enabled", True))

        python_path = self._optional_path(runtime_path, raw.get("python"))
        source_path = self._optional_path(runtime_path, raw.get("source_path"))

        return RuntimeInfo(
            name=name,
            label=label,
            kind=kind,
            path=runtime_path,
            enabled=enabled,
            python_path=python_path,
            source_path=source_path,
            description=description,
        )

    def _fallback_stub_runtime(self) -> RuntimeInfo:
        return RuntimeInfo(
            name=DEFAULT_RUNTIME_NAME,
            label="Built-in Stub Runtime",
            kind="stub",
            path=self.runtimes_dir,
            enabled=True,
            description="Internal placeholder runtime used before real Reticulum is connected.",
        )

    def _optional_path(self, runtime_path: Path, value: Any) -> Path | None:
        if value is None or value == "":
            return None

        if not isinstance(value, str):
            raise TypeError(f"Runtime path value must be string or null, got {type(value).__name__}")

        path = Path(value)

        if not path.is_absolute():
            path = runtime_path / path

        return path.resolve()

    def _require_string(self, raw: dict[str, Any], key: str) -> str:
        value = raw.get(key)

        if not isinstance(value, str) or value == "":
            raise ValueError(f"Runtime manifest field '{key}' must be a non-empty string")

        return value

    def _optional_string(self, raw: dict[str, Any], key: str, default: str) -> str:
        value = raw.get(key, default)

        if not isinstance(value, str):
            raise ValueError(f"Runtime manifest field '{key}' must be a string")

        return value
