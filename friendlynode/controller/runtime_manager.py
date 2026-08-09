"""Runtime discovery and selection."""

from __future__ import annotations

import hashlib
import io
import json
import shutil
import tarfile
import tempfile
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

try:
    from packaging.requirements import Requirement
    from packaging.version import Version
except ImportError:
    Requirement = None
    Version = None

from friendlynode.config.defaults import RUNTIMES_DIR


RUNTIME_MANIFEST_NAME = "runtime.json"
DEFAULT_RUNTIME_NAME = "stub"
MIN_RETICULUM_RELEASE = "1.2.6"
DEFAULT_RETICULUM_RELEASE = MIN_RETICULUM_RELEASE
PYPI_RNS_PROJECT_JSON_URL = "https://pypi.org/pypi/rns/json"
PYPI_RNS_RELEASE_JSON_URL = "https://pypi.org/pypi/rns/{version}/json"
PYPI_LXMF_PROJECT_JSON_URL = "https://pypi.org/pypi/lxmf/json"
PYPI_LXMF_RELEASE_JSON_URL = "https://pypi.org/pypi/lxmf/{version}/json"
LXMF_COMPONENT_DIR_NAME = "lxmf"
LXMF_COMPONENT_MANIFEST_NAME = "component.json"
DEFAULT_LXMF_RUNTIME_NAME = "lxmf-stub"
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
            installed = bool(source_path) and all((source_path / Path(path)).exists() for path in paths)
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


@dataclass(slots=True)
class LxmfRuntimeInfo:
    name: str
    label: str
    kind: str
    path: Path
    source_path: Path | None = None
    description: str = ""
    release_version: str = ""
    rns_requirement: str = ""
    requires_dist: tuple[str, ...] = ()

    @property
    def is_stub(self) -> bool:
        return self.kind == "stub"

    @property
    def installed(self) -> bool:
        return not self.is_stub and self.release_version != ""

    def to_dict(self) -> dict[str, object]:
        return {
            "name": self.name,
            "label": self.label,
            "kind": self.kind,
            "path": str(self.path),
            "source_path": str(self.source_path) if self.source_path is not None else None,
            "description": self.description,
            "release_version": self.release_version,
            "rns_requirement": self.rns_requirement,
            "requires_dist": list(self.requires_dist),
            "is_stub": self.is_stub,
            "installed": self.installed,
            "source_exists": self.source_path.exists() if self.source_path is not None else False,
        }


class RuntimeManager:
    def __init__(self, runtimes_dir: Path = RUNTIMES_DIR) -> None:
        self.runtimes_dir = runtimes_dir
        self.lxmf_component_dir = (self.runtimes_dir / LXMF_COMPONENT_DIR_NAME).resolve()

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

    def get_lxmf_runtime(self) -> LxmfRuntimeInfo:
        manifest_path = self.lxmf_component_dir / LXMF_COMPONENT_MANIFEST_NAME
        if not manifest_path.is_file():
            return self._fallback_lxmf_runtime()
        try:
            return self._load_lxmf_manifest(self.lxmf_component_dir, manifest_path)
        except (OSError, TypeError, ValueError, json.JSONDecodeError):
            return self._fallback_lxmf_runtime(
                description="LXMF component manifest exists but could not be loaded."
            )

    def get_lxmf_status(self, rns_version: str) -> dict[str, object]:
        runtime = self.get_lxmf_runtime()
        result = runtime.to_dict()
        result["compatibility"] = self._check_lxmf_compatibility(
            rns_version=rns_version,
            rns_requirement=runtime.rns_requirement,
        )
        return result

    def list_lxmf_releases(self) -> list[dict[str, object]]:
        installed_runtime = self.get_lxmf_runtime()
        try:
            pypi_releases = self._list_pypi_lxmf_releases()
        except Exception:
            pypi_releases = []
        result: list[dict[str, object]] = []
        known_versions: set[str] = set()
        highest_version = str(pypi_releases[0]["version"]) if len(pypi_releases) > 0 else ""
        for release in pypi_releases:
            version = str(release["version"])
            result.append(
                {
                    "version": version,
                    "label": f"LXMF {version}",
                    "recommended": version == highest_version,
                    "source": "pypi",
                    "notes": "LXMF release from PyPI.",
                    "released": str(release.get("upload_time") or ""),
                    "installed": installed_runtime.release_version == version,
                    "runtime_name": self._lxmf_runtime_name(version),
                }
            )
            known_versions.add(version)
        installed_version = installed_runtime.release_version
        if installed_version != "" and installed_version not in known_versions:
            result.append(
                {
                    "version": installed_version,
                    "label": f"LXMF {installed_version}",
                    "recommended": False,
                    "source": "local",
                    "notes": "Installed locally, but not returned by the current PyPI release listing.",
                    "released": "",
                    "installed": True,
                    "runtime_name": installed_runtime.name,
                }
            )
        return result

    def get_lxmf_release_details(self, version: str, rns_version: str) -> dict[str, object]:
        release = self._get_pypi_lxmf_release(version)
        result = dict(release)
        result["compatibility"] = self._check_lxmf_compatibility(
            rns_version=rns_version,
            rns_requirement=str(release.get("rns_requirement") or ""),
        )
        return result

    def install_lxmf_release(self, version: str, *, rns_version: str) -> LxmfRuntimeInfo:
        release = self._get_pypi_lxmf_release(version)
        compatibility = self._check_lxmf_compatibility(
            rns_version=rns_version,
            rns_requirement=str(release.get("rns_requirement") or ""),
        )
        if compatibility["compatible"] is False:
            raise ValueError(str(compatibility["message"]))

        component_path = self.lxmf_component_dir
        source_path = component_path / "src"
        runtime_name = self._lxmf_runtime_name(str(release["version"]))
        self.runtimes_dir.mkdir(parents=True, exist_ok=True)
        self._ensure_inside_runtimes(component_path)
        data = self._download_lxmf_sdist(release)

        with tempfile.TemporaryDirectory(prefix=f"{runtime_name}-", dir=str(self.runtimes_dir)) as temp_dir:
            temp_path = Path(temp_dir).resolve()
            extracted_source = temp_path / "src"
            extracted_source.mkdir()
            self._extract_sdist(data, extracted_source)
            if component_path.exists():
                shutil.rmtree(component_path)
            component_path.mkdir()
            shutil.move(str(extracted_source), str(source_path))

        manifest = {
            "name": runtime_name,
            "label": f"LXMF {release['version']}",
            "kind": "lxmf",
            "source_path": "src",
            "release_version": str(release["version"]),
            "rns_requirement": str(release.get("rns_requirement") or ""),
            "requires_dist": list(release.get("requires_dist") or []),
            "description": "Managed LXMF component installed by FriendlyNode.",
        }
        manifest_path = component_path / LXMF_COMPONENT_MANIFEST_NAME
        manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding="utf-8")
        return self._load_lxmf_manifest(component_path, manifest_path)

    def remove_lxmf_release(self) -> LxmfRuntimeInfo:
        if self.lxmf_component_dir.exists():
            self._ensure_inside_runtimes(self.lxmf_component_dir)
            shutil.rmtree(self.lxmf_component_dir)
        return self._fallback_lxmf_runtime()

    def list_reticulum_releases(self) -> list[dict[str, object]]:
        installed_by_version = {
            runtime.release_version: runtime
            for runtime in self.list_runtimes()
            if runtime.release_version != ""
        }
        try:
            pypi_releases = self._list_pypi_reticulum_releases()
        except Exception:
            pypi_releases = []
        result: list[dict[str, object]] = []
        known_versions: set[str] = set()
        highest_version = str(pypi_releases[0]["version"]) if len(pypi_releases) > 0 else ""
        for release in pypi_releases:
            version = str(release["version"])
            installed_runtime = installed_by_version.get(version)
            runtime_name = installed_runtime.name if installed_runtime is not None else self._runtime_name(version)
            result.append(
                {
                    "version": version,
                    "label": f"Reticulum {version}",
                    "recommended": version == highest_version,
                    "verified": False,
                    "source": "pypi",
                    "notes": "Reticulum release from PyPI.",
                    "released": str(release.get("upload_time") or ""),
                    "installed": installed_runtime is not None,
                    "runtime_name": runtime_name,
                }
            )
            known_versions.add(version)
        for version, runtime in installed_by_version.items():
            if version in known_versions:
                continue
            if not self._is_supported_reticulum_release(version):
                continue
            result.append(
                {
                    "version": version,
                    "label": f"Reticulum {version}",
                    "recommended": False,
                    "verified": False,
                    "source": "local",
                    "notes": "Installed locally, but not returned by the current PyPI release listing.",
                    "released": "",
                    "installed": True,
                    "runtime_name": runtime.name,
                }
            )
        return result

    def install_reticulum_release(
        self,
        version: str,
        *,
        features: dict[str, bool] | None = None,
    ) -> RuntimeInfo:
        release = self._get_pypi_release(version)
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
        manifest_path.write_text(json.dumps(raw, indent=2, sort_keys=True), encoding="utf-8")
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
        interface_types = self._optional_string_tuple(raw, "interface_types", default_interface_types)
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

    def _load_lxmf_manifest(self, component_path: Path, manifest_path: Path) -> LxmfRuntimeInfo:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        name = self._require_string(raw, "name")
        label = self._optional_string(raw, "label", name)
        kind = self._optional_string(raw, "kind", "lxmf")
        description = self._optional_string(raw, "description", "")
        source_path = self._optional_path(component_path, raw.get("source_path"))
        release_version = self._optional_string(raw, "release_version", "")
        rns_requirement = self._optional_string(raw, "rns_requirement", "")
        requires_dist = self._optional_string_tuple(raw, "requires_dist", ())
        return LxmfRuntimeInfo(
            name=name,
            label=label,
            kind=kind,
            path=component_path,
            source_path=source_path,
            description=description,
            release_version=release_version,
            rns_requirement=rns_requirement,
            requires_dist=requires_dist,
        )

    def _fallback_lxmf_runtime(self, description: str = "No managed LXMF release is installed.") -> LxmfRuntimeInfo:
        return LxmfRuntimeInfo(
            name=DEFAULT_LXMF_RUNTIME_NAME,
            label="LXMF Stub Runtime",
            kind="stub",
            path=self.lxmf_component_dir,
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

    def _lxmf_runtime_name(self, version: str) -> str:
        clean_version = str(version).strip()
        if clean_version == "":
            raise ValueError("LXMF release version cannot be empty")
        return f"lxmf-{clean_version}"

    def _get_pypi_release(self, version: str) -> dict[str, object]:
        if not self._is_supported_reticulum_release(version):
            raise ValueError(
                f"Unsupported Reticulum release {version}. Minimum supported version is {MIN_RETICULUM_RELEASE}."
            )
        metadata = self._load_json_url(PYPI_RNS_RELEASE_JSON_URL.format(version=version), timeout=30)
        info = metadata.get("info", {})
        urls = metadata.get("urls", [])
        if not isinstance(info, dict):
            raise RuntimeError(f"Invalid PyPI metadata for rns {version}.")
        if not isinstance(urls, list):
            raise RuntimeError(f"Invalid PyPI file list for rns {version}.")
        sdist = self._find_sdist(urls)
        if sdist is None:
            raise RuntimeError(f"No source distribution found on PyPI for rns {version}.")
        resolved_version = str(info.get("version") or version)
        return {
            "version": resolved_version,
            "label": f"Reticulum {resolved_version}",
            "source": "pypi",
            "sdist_url": str(sdist["url"]),
            "sdist_sha256": str(sdist.get("digests", {}).get("sha256") or ""),
        }

    def _get_pypi_lxmf_release(self, version: str) -> dict[str, object]:
        metadata = self._load_json_url(PYPI_LXMF_RELEASE_JSON_URL.format(version=version), timeout=30)
        info = metadata.get("info", {})
        urls = metadata.get("urls", [])
        if not isinstance(info, dict):
            raise RuntimeError(f"Invalid PyPI metadata for lxmf {version}.")
        if not isinstance(urls, list):
            raise RuntimeError(f"Invalid PyPI file list for lxmf {version}.")
        sdist = self._find_sdist(urls)
        if sdist is None:
            raise RuntimeError(f"No source distribution found on PyPI for lxmf {version}.")
        resolved_version = str(info.get("version") or version)
        requires_dist = self._normalise_requires_dist(info.get("requires_dist"))
        return {
            "version": resolved_version,
            "label": f"LXMF {resolved_version}",
            "source": "pypi",
            "sdist_url": str(sdist["url"]),
            "sdist_sha256": str(sdist.get("digests", {}).get("sha256") or ""),
            "requires_dist": list(requires_dist),
            "rns_requirement": self._find_rns_requirement(requires_dist),
        }

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
        release = self._get_pypi_release(version)
        return self._download_release_sdist(release, package_label=f"rns {version}")

    def _download_lxmf_sdist(self, release: dict[str, object]) -> bytes:
        return self._download_release_sdist(release, package_label=f"lxmf {release['version']}")

    def _download_release_sdist(self, release: dict[str, object], *, package_label: str) -> bytes:
        url = str(release["sdist_url"])
        expected_sha256 = str(release.get("sdist_sha256") or "")
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read()
        if expected_sha256 != "":
            actual_sha256 = hashlib.sha256(data).hexdigest()
            if actual_sha256 != expected_sha256:
                raise RuntimeError(
                    f"Downloaded {package_label} source distribution failed SHA256 check. Expected {expected_sha256}, got {actual_sha256}."
                )
        return data

    def _list_pypi_reticulum_releases(self) -> list[dict[str, object]]:
        metadata = self._load_json_url(PYPI_RNS_PROJECT_JSON_URL, timeout=30)
        releases = metadata.get("releases", {})
        if not isinstance(releases, dict):
            raise RuntimeError("Invalid PyPI release metadata for rns.")
        result: list[dict[str, object]] = []
        for version, files in releases.items():
            if not isinstance(version, str) or not isinstance(files, list):
                continue
            if not self._is_supported_reticulum_release(version):
                continue
            if self._find_sdist(files) is None:
                continue
            result.append({"version": version, "upload_time": self._release_upload_time(files)})
        result.sort(key=lambda item: self._version_key(str(item["version"])), reverse=True)
        return result

    def _list_pypi_lxmf_releases(self) -> list[dict[str, object]]:
        metadata = self._load_json_url(PYPI_LXMF_PROJECT_JSON_URL, timeout=30)
        releases = metadata.get("releases", {})
        if not isinstance(releases, dict):
            raise RuntimeError("Invalid PyPI release metadata for lxmf.")
        result: list[dict[str, object]] = []
        for version, files in releases.items():
            if not isinstance(version, str) or not isinstance(files, list):
                continue
            if self._version_key(version) == tuple():
                continue
            if self._find_sdist(files) is None:
                continue
            result.append({"version": version, "upload_time": self._release_upload_time(files)})
        result.sort(key=lambda item: self._version_key(str(item["version"])), reverse=True)
        return result

    def _load_json_url(self, url: str, timeout: int) -> dict[str, object]:
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if not isinstance(payload, dict):
            raise RuntimeError(f"Invalid JSON object returned by {url}.")
        return payload

    def _find_sdist(self, files: list[object]) -> dict[str, object] | None:
        for item in files:
            if not isinstance(item, dict):
                continue
            if item.get("packagetype") != "sdist":
                continue
            url = item.get("url")
            if not isinstance(url, str) or url == "":
                continue
            return item
        return None

    def _release_upload_time(self, files: list[object]) -> str:
        sdist = self._find_sdist(files)
        if sdist is None:
            return ""
        upload_time = sdist.get("upload_time_iso_8601") or sdist.get("upload_time") or ""
        return str(upload_time)

    def _is_supported_reticulum_release(self, version: str) -> bool:
        return self._version_key(version) >= self._version_key(MIN_RETICULUM_RELEASE)

    def _normalise_requires_dist(self, raw: object) -> tuple[str, ...]:
        if not isinstance(raw, list):
            return ()
        result: list[str] = []
        for item in raw:
            if not isinstance(item, str):
                continue
            clean_item = item.strip()
            if clean_item != "":
                result.append(clean_item)
        return tuple(result)

    def _find_rns_requirement(self, requires_dist: tuple[str, ...]) -> str:
        for raw_requirement in requires_dist:
            if Requirement is not None:
                try:
                    requirement = Requirement(raw_requirement)
                except Exception:
                    requirement = None
                if requirement is not None and requirement.name.lower().replace("_", "-") == "rns":
                    return raw_requirement
            requirement_head = raw_requirement.split(";", 1)[0].strip().lower()
            if requirement_head == "rns" or requirement_head.startswith(("rns ", "rns<", "rns>", "rns=", "rns!", "rns~", "rns(")):
                return raw_requirement
        return ""

    def _check_lxmf_compatibility(self, *, rns_version: str, rns_requirement: str) -> dict[str, object]:
        clean_rns_version = str(rns_version).strip()
        clean_requirement = str(rns_requirement).strip()
        if clean_rns_version == "":
            return {
                "status": "unknown",
                "compatible": None,
                "rns_version": "",
                "rns_requirement": clean_requirement,
                "message": "LXMF compatibility cannot be checked because no Reticulum release is selected.",
            }
        if clean_requirement == "":
            return {
                "status": "unknown",
                "compatible": None,
                "rns_version": clean_rns_version,
                "rns_requirement": "",
                "message": "The selected LXMF release does not declare an RNS version requirement.",
            }
        if Requirement is None or Version is None:
            return {
                "status": "unknown",
                "compatible": None,
                "rns_version": clean_rns_version,
                "rns_requirement": clean_requirement,
                "message": "LXMF compatibility cannot be checked because the packaging module is unavailable.",
            }
        try:
            requirement = Requirement(clean_requirement)
            version = Version(clean_rns_version)
        except Exception as exc:
            return {
                "status": "unknown",
                "compatible": None,
                "rns_version": clean_rns_version,
                "rns_requirement": clean_requirement,
                "message": f"LXMF compatibility metadata could not be parsed: {type(exc).__name__}: {exc}",
            }
        compatible = True if requirement.marker is not None and not requirement.marker.evaluate() else requirement.specifier.contains(version, prereleases=True)
        if compatible:
            message = f"LXMF requirement {clean_requirement} is compatible with RNS {clean_rns_version}."
            status = "compatible"
        else:
            message = f"LXMF requirement {clean_requirement} is not compatible with RNS {clean_rns_version}."
            status = "incompatible"
        return {
            "status": status,
            "compatible": compatible,
            "rns_version": clean_rns_version,
            "rns_requirement": clean_requirement,
            "message": message,
        }

    def _version_key(self, version: str) -> tuple[int, ...]:
        parts: list[int] = []
        for raw_part in version.split("."):
            number = ""
            for char in raw_part:
                if not char.isdigit():
                    break
                number += char
            if number == "":
                return tuple()
            parts.append(int(number))
        return tuple(parts)

    def _extract_sdist(self, data: bytes, destination: Path) -> None:
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
            members = [member for member in archive.getmembers() if member.isfile() and "/" in member.name]
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

    def _restore_feature_from_sdist(self, data: bytes, source_path: Path, feature: dict[str, object]) -> None:
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
