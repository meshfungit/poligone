"""Desktop SSH access helper.

This helper is intentionally separate from the web UI. It may perform system
setup only when the user runs it explicitly with --apply.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import os
import platform
import shutil
import subprocess
import sys
from collections.abc import Sequence

from friendlynode.config.app_config import AppConfig
from friendlynode.controller.access import build_network_interfaces_status, build_ssh_access_status


WINDOWS_SSH_SETUP_COMMANDS = (
    "Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0",
    "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0",
    "Start-Service sshd",
    "Set-Service -Name sshd -StartupType Automatic",
    (
        "if (-not (Get-NetFirewallRule -Name FriendlyNode-OpenSSH -ErrorAction "
        "SilentlyContinue)) { New-NetFirewallRule -Name FriendlyNode-OpenSSH "
        '-DisplayName "FriendlyNode OpenSSH Server" -Enabled True -Direction '
        "Inbound -Protocol TCP -Action Allow -LocalPort 22 }"
    ),
)

LINUX_SSH_SETUP_COMMANDS = (
    "install openssh-server using your distribution package manager",
    "sudo systemctl enable --now ssh || sudo systemctl enable --now sshd",
)

MACOS_SSH_SETUP_COMMANDS = (
    "sudo systemsetup -setremotelogin on",
)


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="friendlynode-access",
        description="Prepare encrypted SSH access to FriendlyNode.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    check = subparsers.add_parser("check", help="Show SSH and network interface status.")
    check.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    check.set_defaults(func=command_check)

    setup = subparsers.add_parser("setup-server", help="Install/start the local SSH server.")
    setup.add_argument("--apply", action="store_true", help="Execute setup commands.")
    setup.add_argument(
        "--skip-firewall",
        action="store_true",
        help="Do not add the Windows firewall rule.",
    )
    setup.set_defaults(func=command_setup_server)

    tunnel_command = subparsers.add_parser("tunnel-command", help="Print SSH tunnel command.")
    add_tunnel_arguments(tunnel_command)
    tunnel_command.set_defaults(func=command_tunnel_command)

    tunnel = subparsers.add_parser("tunnel", help="Start SSH tunnel and keep it open.")
    add_tunnel_arguments(tunnel)
    tunnel.set_defaults(func=command_tunnel)

    return parser


def add_tunnel_arguments(parser: argparse.ArgumentParser) -> None:
    config = AppConfig.load()
    parser.add_argument("--host", default=config.ssh_tunnel_host, help="SSH server host.")
    parser.add_argument("--user", default=config.ssh_tunnel_user, help="SSH user.")
    parser.add_argument(
        "--local-port",
        type=int,
        default=config.controller_port,
        help="Local browser port.",
    )
    parser.add_argument(
        "--remote-port",
        type=int,
        default=config.controller_port,
        help="FriendlyNode port on the SSH server.",
    )


def command_check(args: argparse.Namespace) -> int:
    payload = {
        "ssh": build_ssh_access_status(),
        "network": build_network_interfaces_status(),
    }

    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
        return 0

    ssh = payload["ssh"]
    print("SSH server")
    print(f"  platform: {ssh['platform']}")
    print(f"  sshd: {'found' if ssh['sshd_found'] else 'not found'}")
    print(f"  sshd_path: {ssh['sshd_path'] or '-'}")
    print(f"  port 22: {'listening' if ssh['port_open'] else 'not listening'}")
    print(f"  ready: {ssh['ready']}")
    print()
    print("Network interfaces")

    for item in payload["network"]["interfaces"]:
        marker = "*" if item.get("recommended") else " "
        print(f" {marker} {item['address']}  {item['name']} ({item['kind']})")

    return 0


def command_setup_server(args: argparse.Namespace) -> int:
    system = platform.system().lower()
    commands = build_setup_plan(system, include_firewall=not args.skip_firewall)

    if not args.apply:
        print("Setup plan. Re-run with --apply to execute.")

        for command in commands:
            print(f"  {command}")

        return 0

    if not commands:
        print(f"No setup plan is available for platform: {system}", file=sys.stderr)
        return 2

    if not is_administrator():
        print("Administrator/root privileges are required for SSH server setup.", file=sys.stderr)
        print("Run this command from an elevated terminal.", file=sys.stderr)
        return 2

    if system == "windows":
        for command in commands:
            run_windows_powershell(command)
        return 0

    for command in commands:
        run_shell_command(command)

    return 0


def build_setup_plan(system: str, include_firewall: bool) -> list[str]:
    if system == "windows":
        commands = list(WINDOWS_SSH_SETUP_COMMANDS)

        if not include_firewall:
            commands = [
                command
                for command in commands
                if "New-NetFirewallRule" not in command
            ]

        return commands

    if system == "darwin":
        return list(MACOS_SSH_SETUP_COMMANDS)

    if system in ("linux", "freebsd", "openbsd", "netbsd"):
        return list(LINUX_SSH_SETUP_COMMANDS)

    return []


def command_tunnel_command(args: argparse.Namespace) -> int:
    print(build_tunnel_command(args))
    return 0


def command_tunnel(args: argparse.Namespace) -> int:
    command = build_tunnel_argv(args)
    print("Starting SSH tunnel:")
    print(f"  {build_tunnel_command(args)}")
    print(f"Open http://127.0.0.1:{args.local_port}/ while this window stays open.")
    return subprocess.run(command, check=False).returncode


def build_tunnel_command(args: argparse.Namespace) -> str:
    endpoint = build_ssh_endpoint(args.host, args.user)
    return f"ssh -N -L {args.local_port}:127.0.0.1:{args.remote_port} {endpoint}"


def build_tunnel_argv(args: argparse.Namespace) -> list[str]:
    endpoint = build_ssh_endpoint(args.host, args.user)
    return [
        "ssh",
        "-N",
        "-L",
        f"{args.local_port}:127.0.0.1:{args.remote_port}",
        endpoint,
    ]


def build_ssh_endpoint(host: str, user: str) -> str:
    clean_host = host.strip()
    clean_user = user.strip()

    if clean_host == "":
        raise SystemExit("SSH host is required. Pass --host or set it in FriendlyNode Settings.")

    if clean_user == "":
        return clean_host

    return f"{clean_user}@{clean_host}"


def is_administrator() -> bool:
    system = platform.system().lower()

    if system == "windows":
        try:
            return bool(ctypes.windll.shell32.IsUserAnAdmin())
        except OSError:
            return False

    return hasattr(os, "geteuid") and os.geteuid() == 0


def run_windows_powershell(command: str) -> None:
    powershell = shutil.which("powershell") or shutil.which("pwsh")

    if powershell is None:
        raise RuntimeError("PowerShell was not found")

    subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            command,
        ],
        check=True,
    )


def run_shell_command(command: str) -> None:
    subprocess.run(command, check=True, shell=True)


if __name__ == "__main__":
    raise SystemExit(main())
