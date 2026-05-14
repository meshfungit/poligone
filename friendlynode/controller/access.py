"""Access diagnostics for encrypted local forwarding."""

from __future__ import annotations

import platform
import re
import shutil
import socket
import subprocess
from pathlib import Path


SSH_PORT = 22
SSH_CONNECT_TIMEOUT_SECONDS = 0.2
COMMAND_TIMEOUT_SECONDS = 2


def build_ssh_access_status() -> dict[str, object]:
    system = platform.system().lower()
    sshd_path = _find_sshd(system)
    port_open = _is_local_port_open(SSH_PORT)

    return {
        "platform": system or "unknown",
        "sshd_path": str(sshd_path) if sshd_path is not None else "",
        "sshd_found": sshd_path is not None,
        "port": SSH_PORT,
        "port_open": port_open,
        "ready": sshd_path is not None and port_open,
        "setup_commands": _build_setup_commands(system),
        "notes": _build_notes(system, sshd_path is not None, port_open),
    }


def build_network_interfaces_status() -> dict[str, object]:
    system = platform.system().lower()
    interfaces = [
        {
            "name": "Local only",
            "address": "127.0.0.1",
            "kind": "loopback",
            "recommended": True,
        },
        {
            "name": "All interfaces",
            "address": "0.0.0.0",
            "kind": "wildcard",
            "recommended": False,
        },
    ]

    interfaces.extend(_scan_ipv4_interfaces(system))

    seen: set[str] = set()
    unique_interfaces = []

    for item in interfaces:
        address = str(item.get("address") or "")

        if address == "" or address in seen:
            continue

        seen.add(address)
        unique_interfaces.append(item)

    return {
        "platform": system or "unknown",
        "interfaces": unique_interfaces,
    }


def _find_sshd(system: str) -> Path | None:
    found = shutil.which("sshd")

    if found is not None:
        return Path(found)

    if system == "windows":
        windows_dir = Path(str(Path.home().anchor or "C:\\")) / "Windows"
        candidates = [
            Path("C:/Windows/System32/OpenSSH/sshd.exe"),
            windows_dir / "System32" / "OpenSSH" / "sshd.exe",
        ]

        for candidate in candidates:
            if candidate.exists():
                return candidate

    for candidate in (Path("/usr/sbin/sshd"), Path("/usr/local/sbin/sshd")):
        if candidate.exists():
            return candidate

    return None


def _scan_ipv4_interfaces(system: str) -> list[dict[str, object]]:
    if system == "windows":
        return _scan_windows_ipv4_interfaces()

    interfaces = _scan_ip_addr_interfaces()

    if interfaces:
        return interfaces

    return _scan_hostname_interfaces()


def _scan_windows_ipv4_interfaces() -> list[dict[str, object]]:
    try:
        result = subprocess.run(
            ["ipconfig"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return _scan_hostname_interfaces()

    interfaces: list[dict[str, object]] = []
    adapter = "Windows adapter"

    for line in result.stdout.splitlines():
        stripped = line.strip()

        if stripped.endswith(":") and not line.startswith(" "):
            adapter = stripped.rstrip(":")
            continue

        match = re.search(r"IPv4[^:]*:\s*([0-9]+(?:\.[0-9]+){3})", stripped)

        if match is None:
            continue

        address = match.group(1)
        interfaces.append(
            {
                "name": adapter,
                "address": address,
                "kind": _classify_ipv4_address(adapter, address),
                "recommended": _is_private_network_address(address),
            }
        )

    return interfaces or _scan_hostname_interfaces()


def _scan_ip_addr_interfaces() -> list[dict[str, object]]:
    try:
        result = subprocess.run(
            ["ip", "-o", "-4", "addr", "show"],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=COMMAND_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return []

    interfaces: list[dict[str, object]] = []

    for line in result.stdout.splitlines():
        match = re.search(r"^\d+:\s+([^ ]+)\s+.*\binet\s+([0-9]+(?:\.[0-9]+){3})/", line)

        if match is None:
            continue

        name = match.group(1)
        address = match.group(2)
        interfaces.append(
            {
                "name": name,
                "address": address,
                "kind": _classify_ipv4_address(name, address),
                "recommended": _is_private_network_address(address),
            }
        )

    return interfaces


def _scan_hostname_interfaces() -> list[dict[str, object]]:
    hostname = socket.gethostname()
    interfaces: list[dict[str, object]] = []

    try:
        addresses = socket.getaddrinfo(hostname, None, socket.AF_INET, socket.SOCK_STREAM)
    except OSError:
        return []

    for item in addresses:
        address = item[4][0]
        interfaces.append(
            {
                "name": hostname,
                "address": address,
                "kind": _classify_ipv4_address(hostname, address),
                "recommended": _is_private_network_address(address),
            }
        )

    return interfaces


def _classify_ipv4_address(name: str, address: str) -> str:
    lower_name = name.lower()

    if address.startswith("127."):
        return "loopback"

    if lower_name.startswith("tailscale") or address.startswith("100."):
        return "tailscale"

    if _is_private_network_address(address):
        return "private"

    return "public"


def _is_private_network_address(address: str) -> bool:
    parts = [int(part) for part in address.split(".") if part.isdigit()]

    if len(parts) != 4:
        return False

    return (
        parts[0] == 10
        or (parts[0] == 172 and 16 <= parts[1] <= 31)
        or (parts[0] == 192 and parts[1] == 168)
        or parts[0] == 100
    )


def _is_local_port_open(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), SSH_CONNECT_TIMEOUT_SECONDS):
            return True
    except OSError:
        return False


def _build_setup_commands(system: str) -> list[str]:
    if system == "windows":
        return [
            "Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0",
            "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0",
            "Start-Service sshd",
            "Set-Service -Name sshd -StartupType Automatic",
        ]

    if system in ("linux", "freebsd", "openbsd", "netbsd"):
        return [
            "sshd -T",
            "sudo systemctl enable --now ssh",
            "sudo systemctl enable --now sshd",
        ]

    if system == "darwin":
        return [
            "sudo systemsetup -setremotelogin on",
        ]

    return []


def _build_notes(system: str, sshd_found: bool, port_open: bool) -> list[str]:
    notes: list[str] = []

    if not sshd_found:
        notes.append("OpenSSH server was not found on this host.")

    if sshd_found and not port_open:
        notes.append("OpenSSH server exists, but localhost port 22 is not listening.")

    if system == "windows":
        notes.append("Windows OpenSSH Server setup requires an elevated PowerShell.")
    elif system in ("linux", "freebsd", "openbsd", "netbsd", "darwin"):
        notes.append("Starting the SSH server usually requires administrator privileges.")

    if port_open:
        notes.append("SSH server is listening locally. Keep FriendlyNode bound to 127.0.0.1.")

    return notes
