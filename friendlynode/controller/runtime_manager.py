"""Runtime discovery and selection."""

from __future__ import annotations

import io
import json
import shutil
import tarfile
import tempfile
import urllib.request
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from friendlynode.config.defaults import RUNTIMES_DIR


RUNTIME_MANIFEST_NAME = "runtime.json"
DEFAULT_RUNTIME_NAME = "stub"
DEFAULT_RETICULUM_RELEASE = "1.2.5"
DEFAULT_INTERFACE_TYPES = (
    "AutoInterface",
    "BackboneInterface",
    "TCPClientInterface",
    "TCPServerInterface",
)
DEFAULT_RUNTIME_FEATURES = {
    "rngit": False,
}
RUNTIME_FEATURES = {
    "rngit": {
        "label": "Reticulum Git",
        "description": "Git transport and NomadNetwork repository pages over Reticulum.",
        "paths": (
            "RNS/Utilities/rngit",
        ),
        "console_scripts": (
            "rngit",
            "git-remote-rns",
        ),
        "default_enabled": False,
    },
}
RETICULUM_RELEASES = (
    {
        "version": "1.2.5",
        "label": "Reticulum 1.2.5",
        "recommended": True,
        "verified": True,
        "source": "pypi",
        "notes": "Stable baseline matching the current public GitHub release.",
    },
    {
        "version": "1.2.6",
        "label": "Reticulum 1.2.6",
        "recommended": False,
        "verified": False,
        "source": "pypi",
        "notes": "PyPI-only release at the time of inspection; not selected by default.",
    },
)


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
    release_version: str = ""
    interface_types: tuple[str, ...] = DEFAULT_INTERFACE_TYPES
    features: dict[str, bool] | None = None

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
            "release_version": self.release_version,
            "interface_types": list(self.interface_types),
            "features": dict(self.features or {}),
            "feature_capabilities": self.feature_capabilities(),
            "is_stub": self.is_stub,
            "python_exists": self.python_path.exists() if self.python_path is not None else None,
            "source_exists": self.source_path.exists() if self.source_path is not None else None,
        }

    def feature_capabilities(self) -> list[dict[str, object]]:
        capabilities = []
        source_path = self.source_path
        configured_features = self.features or {}

        for feature_name, feature in RUNTIME_FEATURES.items():
            paths = feature["paths"]
            installed = bool(source_path) and all(
                (source_path / Path(path)).exists()
                for path in paths
            )
            capabilities.append(
                {
                    "name": feature_name,
                    "label": feature["label"],
                    "description": feature["description"],
                    "enabled": bool(configured_features.get(feature_name, False)),
                    "installed": installed,
                    "default_enabled": bool(feature["default_enabled"]),
                    "console_scripts": list(feature["console_scripts"]),
                }
            )

        return capabilities


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

    def list_reticulum_releases(self) -> list[dict[str, object]]:
        runtimes = {
            runtime.release_version: runtime
            for runtime in self.list_runtimes()
            if runtime.release_version != ""
        }
        releases = []

        for release in RETICULUM_RELEASES:
            version = str(release["version"])
            runtime = runtimes.get(version)
            releases.append(
                {
                    **release,
                    "installed": runtime is not None,
                    "runtime_name": runtime.name if runtime is not None else self._runtime_name(version),
                }
            )

        return releases

    def install_reticulum_release(
        self,
        version: str,
        *,
        features: dict[str, bool] | None = None,
    ) -> RuntimeInfo:
        release = self._get_release(version)
        runtime_name = self._runtime_name(version)
        runtime_path = (self.runtimes_dir / runtime_name).resolve()
        source_path = runtime_path / "src"
        selected_features = self._normalise_features(features)

        self.runtimes_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_inside_runtimes(runtime_path)

        data = self._download_sdist(str(release["version"]))

        with tempfile.TemporaryDirectory(prefix=f"{runtime_name}-", dir=str(self.runtimes_dir)) as temp_dir:
            temp_path = Path(temp_dir).resolve()
            extracted_source = temp_path / "src"
            extracted_source.mkdir()
            self._extract_sdist(data, extracted_source)

            if runtime_path.exists():
                shutil.rmtree(runtime_path)

            runtime_path.mkdir()
            shutil.move(str(extracted_source), str(source_path))

        self._apply_runtime_features(source_path, selected_features)

        manifest = {
            "name": runtime_name,
            "label": f"Reticulum {version}",
            "kind": "reticulum",
            "enabled": True,
            "source_path": "src",
            "release_version": version,
            "interface_types": list(DEFAULT_INTERFACE_TYPES),
            "features": selected_features,
            "description": "Managed Reticulum runtime installed by FriendlyNode.",
        }
        (runtime_path / RUNTIME_MANIFEST_NAME).write_text(
            json.dumps(manifest, indent=2, sort_keys=True),
            encoding="utf-8",
        )
        self._remove_other_managed_reticulum_runtimes(runtime_path)

        return self._load_runtime_manifest(runtime_path, runtime_path / RUNTIME_MANIFEST_NAME)

    def set_runtime_feature(self, runtime_name: str, feature_name: str, enabled: bool) -> RuntimeInfo:
        runtime = self.get_runtime(runtime_name)

        if runtime.release_version == "":
            raise ValueError(f"Runtime is not a managed Reticulum release: {runtime.name}")

        if runtime.source_path is None:
            raise ValueError(f"Runtime has no source path: {runtime.name}")

        feature = self._get_feature(feature_name)
        features = self._normalise_features(runtime.features)
        features[feature_name] = bool(enabled)

        if enabled:
            data = self._download_sdist(runtime.release_version)
            self._restore_feature_from_sdist(data, runtime.source_path, feature)
        else:
            self._remove_feature_paths(runtime.source_path, feature)

        manifest_path = runtime.path / RUNTIME_MANIFEST_NAME
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        raw["features"] = features
        manifest_path.write_text(
            json.dumps(raw, indent=2, sort_keys=True),
            encoding="utf-8",
        )

        return self._load_runtime_manifest(runtime.path, manifest_path)

    def _load_runtime_manifest(self, runtime_path: Path, manifest_path: Path) -> RuntimeInfo:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))

        name = self._require_string(raw, "name")
        label = self._optional_string(raw, "label", name)
        kind = self._optional_string(raw, "kind", "external")
        description = self._optional_string(raw, "description", "")
        enabled = bool(raw.get("enabled", True))

        python_path = self._optional_path(runtime_path, raw.get("python"))
        source_path = self._optional_path(runtime_path, raw.get("source_path"))
        release_version = self._optional_string(raw, "release_version", "")
        default_interface_types = () if kind == "stub" else DEFAULT_INTERFACE_TYPES
        interface_types = self._optional_string_tuple(
            raw,
            "interface_types",
            default_interface_types,
        )
        features = self._normalise_features(raw.get("features"))

        return RuntimeInfo(
            name=name,
            label=label,
            kind=kind,
            path=runtime_path,
            enabled=enabled,
            python_path=python_path,
            source_path=source_path,
            description=description,
            release_version=release_version,
            interface_types=interface_types,
            features=features,
        )

    def _fallback_stub_runtime(self) -> RuntimeInfo:
        return RuntimeInfo(
            name=DEFAULT_RUNTIME_NAME,
            label="Built-in Stub Runtime",
            kind="stub",
            path=self.runtimes_dir,
            enabled=True,
            description="Internal placeholder runtime used before real Reticulum is connected.",
            interface_types=(),
            features={},
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

    def _optional_string_tuple(
        self,
        raw: dict[str, Any],
        key: str,
        default: tuple[str, ...],
    ) -> tuple[str, ...]:
        value = raw.get(key, list(default))

        if not isinstance(value, list):
            raise ValueError(f"Runtime manifest field '{key}' must be a list")

        result = []

        for item in value:
            if not isinstance(item, str) or item == "":
                raise ValueError(f"Runtime manifest field '{key}' must contain strings")

            result.append(item)

        return tuple(result)

    def _runtime_name(self, version: str) -> str:
        clean_version = str(version).strip()

        if clean_version == "":
            raise ValueError("Reticulum release version cannot be empty")

        return f"rns-{clean_version}"

    def _get_release(self, version: str) -> dict[str, object]:
        for release in RETICULUM_RELEASES:
            if release["version"] == version:
                return release

        raise KeyError(f"Unsupported Reticulum release: {version}")

    def _get_feature(self, feature_name: str) -> dict[str, object]:
        feature = RUNTIME_FEATURES.get(feature_name)

        if feature is None:
            raise KeyError(f"Unsupported runtime feature: {feature_name}")

        return feature

    def _normalise_features(self, raw: object) -> dict[str, bool]:
        features = dict(DEFAULT_RUNTIME_FEATURES)

        if isinstance(raw, dict):
            for key, value in raw.items():
                if key in RUNTIME_FEATURES:
                    features[key] = bool(value)

        return features

    def _download_sdist(self, version: str) -> bytes:
        metadata_url = f"https://pypi.org/pypi/rns/{version}/json"
        request = urllib.request.Request(metadata_url, headers={"Accept": "application/json"})
        metadata = json.loads(urllib.request.urlopen(request, timeout=30).read().decode("utf-8"))

        for item in metadata.get("urls", []):
            if item.get("packagetype") != "sdist":
                continue

            url = str(item.get("url") or "")

            if url == "":
                continue

            return urllib.request.urlopen(url, timeout=60).read()

        raise RuntimeError(f"No source distribution found for rns {version}")

    def _extract_sdist(self, data: bytes, destination: Path) -> None:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            members = [
                member
                for member in archive.getmembers()
                if member.isfile() and "/" in member.name
            ]

            for member in members:
                relative = Path(member.name.split("/", 1)[1])

                if relative == Path("."):
                    continue

                target = (destination / relative).resolve()

                try:
                    target.relative_to(destination.resolve())
                except ValueError as exc:
                    raise RuntimeError(f"Unsafe archive path: {member.name}") from exc

                target.parent.mkdir(parents=True, exist_ok=True)
                extracted = archive.extractfile(member)

                if extracted is None:
                    continue

                target.write_bytes(extracted.read())

    def _ensure_inside_runtimes(self, path: Path) -> None:
        try:
            path.relative_to(self.runtimes_dir.resolve())
        except ValueError as exc:
            raise RuntimeError(f"Runtime path escapes runtimes directory: {path}") from exc

    def _remove_other_managed_reticulum_runtimes(self, current_runtime_path: Path) -> None:
        current = current_runtime_path.resolve()

        for item in self.runtimes_dir.iterdir():
            if not item.is_dir():
                continue

            runtime_path = item.resolve()

            if runtime_path == current:
                continue

            self._ensure_inside_runtimes(runtime_path)
            manifest_path = runtime_path / RUNTIME_MANIFEST_NAME

            if not manifest_path.exists():
                continue

            try:
                raw = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue

            if raw.get("kind") != "reticulum" or not raw.get("release_version"):
                continue

            shutil.rmtree(runtime_path)

    def _apply_runtime_features(self, source_path: Path, features: dict[str, bool]) -> None:
        for feature_name, enabled in features.items():
            feature = self._get_feature(feature_name)

            if not enabled:
                self._remove_feature_paths(source_path, feature)

    def _remove_feature_paths(self, source_path: Path, feature: dict[str, object]) -> None:
        for path in feature["paths"]:
            target = (source_path / Path(path)).resolve()

            try:
                target.relative_to(source_path.resolve())
            except ValueError as exc:
                raise RuntimeError(f"Feature path escapes runtime source: {target}") from exc

            if target.is_dir():
                shutil.rmtree(target)
            elif target.exists():
                target.unlink()

    def _restore_feature_from_sdist(
        self,
        data: bytes,
        source_path: Path,
        feature: dict[str, object],
    ) -> None:
        with tempfile.TemporaryDirectory(prefix="friendlynode-feature-") as temp_dir:
            temp_path = Path(temp_dir).resolve()
            self._extract_sdist(data, temp_path)

            for path in feature["paths"]:
                relative = Path(path)
                source = temp_path / relative
                target = source_path / relative

                if not source.exists():
                    raise RuntimeError(f"Feature path missing from source distribution: {path}")

                if target.exists():
                    if target.is_dir():
                        shutil.rmtree(target)
                    else:
                        target.unlink()

                target.parent.mkdir(parents=True, exist_ok=True)

                if source.is_dir():
                    shutil.copytree(source, target)
                else:
                    shutil.copy2(source, target)
