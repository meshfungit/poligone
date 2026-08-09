"""Application configuration objects."""

from __future__ import annotations

import json
import ipaddress
import subprocess
import socket
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from friendlynode.config.defaults import (
    DEFAULT_APP_CONFIG_PATH,
    DEFAULT_CLIENT_ENABLED,
    DEFAULT_CLIENTS_DIR,
    DEFAULT_CONTROLLER_HOST,
    DEFAULT_CONTROLLER_PORT,
    DEFAULT_DATABASE_PATH,
    DEFAULT_ENGINE_NAME,
    DEFAULT_LXMF_ENABLED,
    DEFAULT_NOMADNET_ENABLED,
    DEFAULT_NOMADNET_PAGES_DIR,
    DEFAULT_RNS_CONFIG_DIR,
    DEFAULT_TAILSCALE_ACCESS_ENABLED,
)
TAILSCALE_IP_COMMAND = ("tailscale", "ip", "-4")
TAILSCALE_COMMAND_TIMEOUT_SEC = 5
TAILSCALE_IPV4_NETWORK = ipaddress.ip_network("100.64.0.0/10")

@dataclass(slots=True)
class AppConfig:
    controller_host: str = DEFAULT_CONTROLLER_HOST
    controller_port: int = DEFAULT_CONTROLLER_PORT
    ssh_access_enabled: bool = True
    tailscale_access_enabled: bool = DEFAULT_TAILSCALE_ACCESS_ENABLED
    lxmf_enabled: bool = DEFAULT_LXMF_ENABLED
    nomadnet_enabled: bool = DEFAULT_NOMADNET_ENABLED
    client_enabled: bool = DEFAULT_CLIENT_ENABLED
    ssh_tunnel_host: str = ""
    ssh_tunnel_user: str = ""

    engine_name: str = DEFAULT_ENGINE_NAME

    app_config_path: Path = DEFAULT_APP_CONFIG_PATH
    rns_config_dir: Path = DEFAULT_RNS_CONFIG_DIR
    database_path: Path = DEFAULT_DATABASE_PATH
    nomadnet_pages_dir: Path = DEFAULT_NOMADNET_PAGES_DIR
    clients_dir: Path = DEFAULT_CLIENTS_DIR

    runtime_python: Path | None = None
    runtime_source_path: Path | None = None
    lxmf_source_path: Path | None = None

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
        config.ssh_access_enabled = bool(raw.get("ssh_access_enabled", config.ssh_access_enabled))
        config.tailscale_access_enabled = bool(
            raw.get("tailscale_access_enabled", config.tailscale_access_enabled)
        )
        config.lxmf_enabled = bool(raw.get("lxmf_enabled", config.lxmf_enabled))
        config.nomadnet_enabled = bool(raw.get("nomadnet_enabled", config.nomadnet_enabled))
        config.client_enabled = bool(raw.get("client_enabled", config.client_enabled))
        config.ssh_tunnel_host = str(raw.get("ssh_tunnel_host", config.ssh_tunnel_host))
        config.ssh_tunnel_user = str(raw.get("ssh_tunnel_user", config.ssh_tunnel_user))
        config.engine_name = str(raw.get("engine_name", config.engine_name))

        config.rns_config_dir = config._read_path(raw, "rns_config_dir", config.rns_config_dir)
        config.database_path = config._read_path(raw, "database_path", config.database_path)
        config.clients_dir = config._read_path(raw, "clients_dir", config.clients_dir)
        config.nomadnet_pages_dir = config._read_path(
            raw,
            "nomadnet_pages_dir",
            config.nomadnet_pages_dir,
        )

        config.ensure_dirs()

        if config.refresh_access_controller_host():
            config.save()

        return config

    def save(self) -> None:
        self.ensure_dirs()

        payload = {
            "controller_host": self.controller_host,
            "controller_port": self.controller_port,
            "ssh_access_enabled": self.ssh_access_enabled,
            "tailscale_access_enabled": self.tailscale_access_enabled,
            "lxmf_enabled": self.lxmf_enabled,
            "nomadnet_enabled": self.nomadnet_enabled,
            "client_enabled": self.client_enabled,
            "ssh_tunnel_host": self.ssh_tunnel_host,
            "ssh_tunnel_user": self.ssh_tunnel_user,
            "engine_name": self.engine_name,
            "rns_config_dir": str(self.rns_config_dir),
            "database_path": str(self.database_path),
            "nomadnet_pages_dir": str(self.nomadnet_pages_dir),
            "clients_dir": str(self.clients_dir),
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

    def set_ssh_access_enabled(self, enabled: bool) -> None:
        self.ssh_access_enabled = enabled
        self.save()

    def set_tailscale_access_enabled(self, enabled: bool) -> None:
        self.tailscale_access_enabled = enabled
        self.refresh_access_controller_host()
        self.save()

    def set_ssh_tunnel_endpoint(self, host: str, user: str) -> None:
        self.ssh_tunnel_host = host.strip()
        self.ssh_tunnel_user = user.strip()
        self.save()

    def ensure_dirs(self) -> None:
        self.app_config_path.parent.mkdir(parents=True, exist_ok=True)
        self.rns_config_dir.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.nomadnet_pages_dir.mkdir(parents=True, exist_ok=True)
        self.clients_dir.mkdir(parents=True, exist_ok=True)

    def to_dict(self) -> dict[str, object]:
        return {
            "controller_host": self.controller_host,
            "controller_port": self.controller_port,
            "ssh_access_enabled": self.ssh_access_enabled,
            "tailscale_access_enabled": self.tailscale_access_enabled,
            "lxmf_enabled": self.lxmf_enabled,
            "nomadnet_enabled": self.nomadnet_enabled,
            "client_enabled": self.client_enabled,
            "ssh_tunnel_host": self.ssh_tunnel_host,
            "ssh_tunnel_user": self.ssh_tunnel_user,
            "engine_name": self.engine_name,
            "app_config_path": str(self.app_config_path),
            "rns_config_dir": str(self.rns_config_dir),
            "database_path": str(self.database_path),
            "nomadnet_pages_dir": str(self.nomadnet_pages_dir),
            "clients_dir": str(self.clients_dir),
            "runtime_python": str(self.runtime_python) if self.runtime_python is not None else None,
            "runtime_source_path": (
                str(self.runtime_source_path) if self.runtime_source_path is not None else None
            ),
            "lxmf_source_path": (
                str(self.lxmf_source_path) if self.lxmf_source_path is not None else None
            ),
        }

    def controller_listen_hosts(self) -> list[str]:
        hosts: list[str] = ["127.0.0.1"]

        if self.ssh_access_enabled:
            ssh_host = self.ssh_tunnel_host.strip()

            if ssh_host != "" and self._can_bind_host(ssh_host):
                hosts.append(ssh_host)

        if self.tailscale_access_enabled and self._is_tailscale_ipv4(self.controller_host):
            hosts.append(self.controller_host)

        return self._unique_hosts(hosts)

    def _read_path(self, raw: dict[str, Any], key: str, default: Path) -> Path:
        value = raw.get(key)

        if value is None or value == "":
            return default

        return Path(str(value))

    def refresh_access_controller_host(self) -> bool:
        if not self.tailscale_access_enabled:
            if self._is_tailscale_ipv4(self.controller_host):
                previous_host = self.controller_host
                self.controller_host = DEFAULT_CONTROLLER_HOST

                print(
                    f"[friendlynode] Tailscale access disabled; controller host reset: "
                    f"{previous_host} -> {self.controller_host}",
                    flush=True,
                )

                return True

            return False

        tailscale_ip = self._discover_tailscale_ipv4()

        if tailscale_ip == "":
            print(
                "[friendlynode] Tailscale access enabled, but no Tailscale IPv4 address was found; "
                f"using controller_host={self.controller_host}",
                flush=True,
            )
            return False

        if self.controller_host == tailscale_ip:
            return False

        previous_host = self.controller_host
        self.controller_host = tailscale_ip

        print(
            f"[friendlynode] Tailscale controller host updated: {previous_host} -> {tailscale_ip}",
            flush=True,
        )

        return True

        if self.controller_host == tailscale_ip:
            return False

        previous_host = self.controller_host
        self.controller_host = tailscale_ip

        print(
            f"[friendlynode] Tailscale controller host updated: {previous_host} -> {tailscale_ip}",
            flush=True,
        )

        return True

    def _discover_tailscale_ipv4(self) -> str:
        try:
            completed = subprocess.run(
                list(TAILSCALE_IP_COMMAND),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=TAILSCALE_COMMAND_TIMEOUT_SEC,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            return ""

        if completed.returncode != 0:
            return ""

        for line in completed.stdout.splitlines():
            candidate = line.strip()

            if self._is_tailscale_ipv4(candidate):
                return candidate

        return ""

    def _is_tailscale_ipv4(self, value: str) -> bool:
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            return False

        return isinstance(address, ipaddress.IPv4Address) and address in TAILSCALE_IPV4_NETWORK

    def _unique_hosts(self, hosts: list[str]) -> list[str]:
        result: list[str] = []
        seen: set[str] = set()

        for host in hosts:
            cleaned = host.strip()

            if cleaned == "":
                continue

            if cleaned in seen:
                continue

            result.append(cleaned)
            seen.add(cleaned)

        return result

    def _can_bind_host(self, host: str) -> bool:
        cleaned_host = host.strip()

        if cleaned_host == "":
            return False

        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.bind((cleaned_host, 0))
        except OSError:
            return False

        return True