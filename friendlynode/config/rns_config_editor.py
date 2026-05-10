"""Reticulum config editor model.

This module intentionally avoids external dependencies. It reads and writes a
small, UI-friendly subset of Reticulum's ConfigObj-style configuration file.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


RNS_CONFIG_FILENAME = "config"

BOOLEAN_TRUE_VALUES = {"yes", "true", "1", "on"}
BOOLEAN_FALSE_VALUES = {"no", "false", "0", "off"}

FIELD_TYPE_TEXT = "text"
FIELD_TYPE_INTEGER = "integer"
FIELD_TYPE_BOOLEAN = "boolean"
FIELD_TYPE_SELECT = "select"

INTERFACE_MODE_CHOICES = ("", "full", "gateway", "access_point", "ap", "roaming", "boundary")
MULTICAST_ADDRESS_TYPE_CHOICES = ("", "temporary", "permanent")
DISCOVERY_SCOPE_CHOICES = ("", "link", "admin", "site", "organisation", "global")

SUPPORTED_RNS_INTERFACE_TYPES = (
    "AutoInterface",
    "BackboneInterface",
    "TCPClientInterface",
    "TCPServerInterface",
    "UDPInterface",
    "I2PInterface",
    "PipeInterface",
    "CustomInterface",
)

DEFAULT_RETICULUM_VALUES: dict[str, object] = {
    "enable_transport": False,
    "share_instance": False,
    "shared_instance_port": "",
    "instance_control_port": "",
    "panic_on_interface_error": False,
    "respond_to_probes": True,
    "discover_interfaces": True,
    "interface_discovery_sources": "",
    "required_discovery_value": "",
    "autoconnect_discovered_interfaces": 0,
    "network_identity": "",
    "enable_remote_management": False,
    "remote_management_allowed": "",
}

FORCED_RETICULUM_RENDER_KEYS = {
    "enable_transport",
    "discover_interfaces",
}

FORCED_INTERFACE_RENDER_KEYS = {
    "type",
    "enabled",
}

DEFAULT_INTERFACE_VALUES: dict[str, object] = {
    "name": "Local Auto",
    "type": "AutoInterface",
    "enabled": False,
    "mode": "",
    "outgoing": True,
    "bitrate": "",
    "announce_cap": "",
    "announce_rate_target": "",
    "announce_rate_grace": "",
    "announce_rate_penalty": "",
    "bootstrap_only": False,
    "discoverable": False,
    "discovery_name": "",
    "announce_interval": "",
    "reachable_on": "",
    "network_name": "",
    "passphrase": "",
    "ifac_size": "",
    "ifac_netname": "",
    "ifac_netkey": "",
    "publish_ifac": False,
    "discovery_encrypt": False,
    "location_lat": "",
    "location_lon": "",
    "location_alt": "",
}

INTERFACE_TYPE_DEFAULTS: dict[str, dict[str, object]] = {
    "AutoInterface": {
        "group_id": "",
        "multicast_address_type": "",
        "discovery_scope": "",
        "devices": "",
        "ignored_devices": "",
        "discovery_port": "",
        "data_port": "",
    },
    "BackboneInterface": {
        "listen_on": "",
        "port": "",
        "device": "",
        "prefer_ipv6": False,
        "remote": "",
        "target_host": "",
        "target_port": "",
    },
    "TCPClientInterface": {
        "target_host": "",
        "target_port": "",
        "kiss_framing": False,
        "fixed_mtu": "",
        "i2p_tunneled": False,
    },
    "TCPServerInterface": {
        "listen_ip": "0.0.0.0",
        "listen_port": "",
        "device": "",
        "port": "",
        "prefer_ipv6": False,
        "i2p_tunneled": False,
    },
    "UDPInterface": {
        "listen_ip": "0.0.0.0",
        "listen_port": "",
        "forward_ip": "",
        "forward_port": "",
        "device": "",
        "port": "",
    },
    "I2PInterface": {
        "connectable": True,
        "peers": "",
    },
    "PipeInterface": {
        "command": "",
        "respawn_delay": "",
    },
    "CustomInterface": {
        "module_path": "",
        "class_name": "",
    },
}

RETICULUM_FIELD_SCHEMA: list[dict[str, object]] = [
    {"key": "enable_transport", "label": "Enable transport", "type": FIELD_TYPE_BOOLEAN},
    {"key": "share_instance", "label": "Share instance", "type": FIELD_TYPE_BOOLEAN},
    {"key": "shared_instance_port", "label": "Shared instance port", "type": FIELD_TYPE_INTEGER},
    {"key": "instance_control_port", "label": "Instance control port", "type": FIELD_TYPE_INTEGER},
    {
        "key": "panic_on_interface_error",
        "label": "Panic on interface error",
        "type": FIELD_TYPE_BOOLEAN,
    },
    {"key": "respond_to_probes", "label": "Respond to probes", "type": FIELD_TYPE_BOOLEAN},
    {"key": "discover_interfaces", "label": "Discover interfaces", "type": FIELD_TYPE_BOOLEAN},
    {
        "key": "interface_discovery_sources",
        "label": "Interface discovery sources",
        "type": FIELD_TYPE_TEXT,
    },
    {
        "key": "required_discovery_value",
        "label": "Required discovery value",
        "type": FIELD_TYPE_INTEGER,
    },
    {
        "key": "autoconnect_discovered_interfaces",
        "label": "Autoconnect discovered interfaces",
        "type": FIELD_TYPE_INTEGER,
    },
    {"key": "network_identity", "label": "Network identity", "type": FIELD_TYPE_TEXT},
    {
        "key": "enable_remote_management",
        "label": "Enable remote management",
        "type": FIELD_TYPE_BOOLEAN,
    },
    {
        "key": "remote_management_allowed",
        "label": "Remote management allowed",
        "type": FIELD_TYPE_TEXT,
    },
]

COMMON_INTERFACE_FIELD_SCHEMA: list[dict[str, object]] = [
    {"key": "name", "label": "Section name", "type": FIELD_TYPE_TEXT, "required": True},
    {
        "key": "type",
        "label": "Interface type",
        "type": FIELD_TYPE_SELECT,
        "required": True,
        "choices": list(SUPPORTED_RNS_INTERFACE_TYPES),
    },
    {"key": "enabled", "label": "Enabled", "type": FIELD_TYPE_BOOLEAN},
    {
        "key": "mode",
        "label": "Mode",
        "type": FIELD_TYPE_SELECT,
        "choices": list(INTERFACE_MODE_CHOICES),
    },
    {"key": "outgoing", "label": "Outgoing", "type": FIELD_TYPE_BOOLEAN},
    {"key": "bitrate", "label": "Bitrate", "type": FIELD_TYPE_INTEGER},
    {"key": "announce_cap", "label": "Announce cap", "type": FIELD_TYPE_INTEGER},
    {
        "key": "announce_rate_target",
        "label": "Announce rate target",
        "type": FIELD_TYPE_INTEGER,
    },
    {
        "key": "announce_rate_grace",
        "label": "Announce rate grace",
        "type": FIELD_TYPE_INTEGER,
    },
    {
        "key": "announce_rate_penalty",
        "label": "Announce rate penalty",
        "type": FIELD_TYPE_INTEGER,
    },
    {"key": "bootstrap_only", "label": "Bootstrap only", "type": FIELD_TYPE_BOOLEAN},
    {"key": "discoverable", "label": "Discoverable", "type": FIELD_TYPE_BOOLEAN},
    {"key": "discovery_name", "label": "Discovery name", "type": FIELD_TYPE_TEXT},
    {"key": "announce_interval", "label": "Announce interval", "type": FIELD_TYPE_INTEGER},
    {"key": "reachable_on", "label": "Reachable on", "type": FIELD_TYPE_TEXT},
    {"key": "network_name", "label": "Network name", "type": FIELD_TYPE_TEXT},
    {"key": "passphrase", "label": "Passphrase", "type": FIELD_TYPE_TEXT},
    {"key": "ifac_size", "label": "IFAC size", "type": FIELD_TYPE_INTEGER},
    {"key": "ifac_netname", "label": "IFAC network name", "type": FIELD_TYPE_TEXT},
    {"key": "ifac_netkey", "label": "IFAC network key", "type": FIELD_TYPE_TEXT},
    {"key": "publish_ifac", "label": "Publish IFAC", "type": FIELD_TYPE_BOOLEAN},
    {
        "key": "discovery_encrypt",
        "label": "Encrypt discovery",
        "type": FIELD_TYPE_BOOLEAN,
    },
    {"key": "location_lat", "label": "Latitude", "type": FIELD_TYPE_TEXT},
    {"key": "location_lon", "label": "Longitude", "type": FIELD_TYPE_TEXT},
    {"key": "location_alt", "label": "Altitude", "type": FIELD_TYPE_TEXT},
]

INTERFACE_TYPE_FIELD_SCHEMA: dict[str, list[dict[str, object]]] = {
    "AutoInterface": [
        {"key": "group_id", "label": "Group ID", "type": FIELD_TYPE_TEXT},
        {
            "key": "multicast_address_type",
            "label": "Multicast address type",
            "type": FIELD_TYPE_SELECT,
            "choices": list(MULTICAST_ADDRESS_TYPE_CHOICES),
        },
        {
            "key": "discovery_scope",
            "label": "Discovery scope",
            "type": FIELD_TYPE_SELECT,
            "choices": list(DISCOVERY_SCOPE_CHOICES),
        },
        {"key": "devices", "label": "Devices", "type": FIELD_TYPE_TEXT},
        {"key": "ignored_devices", "label": "Ignored devices", "type": FIELD_TYPE_TEXT},
        {"key": "discovery_port", "label": "Discovery port", "type": FIELD_TYPE_INTEGER},
        {"key": "data_port", "label": "Data port", "type": FIELD_TYPE_INTEGER},
    ],
    "BackboneInterface": [
        {"key": "listen_on", "label": "Listen on", "type": FIELD_TYPE_TEXT},
        {"key": "port", "label": "Port", "type": FIELD_TYPE_INTEGER},
        {"key": "device", "label": "Device", "type": FIELD_TYPE_TEXT},
        {"key": "prefer_ipv6", "label": "Prefer IPv6", "type": FIELD_TYPE_BOOLEAN},
        {"key": "remote", "label": "Remote", "type": FIELD_TYPE_TEXT},
        {"key": "target_host", "label": "Target host", "type": FIELD_TYPE_TEXT},
        {"key": "target_port", "label": "Target port", "type": FIELD_TYPE_INTEGER},
    ],
    "TCPClientInterface": [
        {"key": "target_host", "label": "Target host", "type": FIELD_TYPE_TEXT},
        {"key": "target_port", "label": "Target port", "type": FIELD_TYPE_INTEGER},
        {"key": "kiss_framing", "label": "KISS framing", "type": FIELD_TYPE_BOOLEAN},
        {"key": "fixed_mtu", "label": "Fixed MTU", "type": FIELD_TYPE_INTEGER},
        {"key": "i2p_tunneled", "label": "I2P tunneled", "type": FIELD_TYPE_BOOLEAN},
    ],
    "TCPServerInterface": [
        {"key": "listen_ip", "label": "Listen IP", "type": FIELD_TYPE_TEXT},
        {"key": "listen_port", "label": "Listen port", "type": FIELD_TYPE_INTEGER},
        {"key": "device", "label": "Device", "type": FIELD_TYPE_TEXT},
        {"key": "port", "label": "Port", "type": FIELD_TYPE_INTEGER},
        {"key": "prefer_ipv6", "label": "Prefer IPv6", "type": FIELD_TYPE_BOOLEAN},
        {"key": "i2p_tunneled", "label": "I2P tunneled", "type": FIELD_TYPE_BOOLEAN},
    ],
    "UDPInterface": [
        {"key": "listen_ip", "label": "Listen IP", "type": FIELD_TYPE_TEXT},
        {"key": "listen_port", "label": "Listen port", "type": FIELD_TYPE_INTEGER},
        {"key": "forward_ip", "label": "Forward IP", "type": FIELD_TYPE_TEXT},
        {"key": "forward_port", "label": "Forward port", "type": FIELD_TYPE_INTEGER},
        {"key": "device", "label": "Device", "type": FIELD_TYPE_TEXT},
        {"key": "port", "label": "Port", "type": FIELD_TYPE_INTEGER},
    ],
    "I2PInterface": [
        {"key": "connectable", "label": "Connectable", "type": FIELD_TYPE_BOOLEAN},
        {"key": "peers", "label": "Peers", "type": FIELD_TYPE_TEXT},
    ],
    "PipeInterface": [
        {"key": "command", "label": "Command", "type": FIELD_TYPE_TEXT},
        {"key": "respawn_delay", "label": "Respawn delay", "type": FIELD_TYPE_INTEGER},
    ],
    "CustomInterface": [
        {"key": "module_path", "label": "Module path", "type": FIELD_TYPE_TEXT},
        {"key": "class_name", "label": "Class name", "type": FIELD_TYPE_TEXT},
    ],
}


@dataclass(slots=True)
class ParsedRnsConfig:
    config_path: Path
    file_path: Path
    reticulum: dict[str, object]
    interfaces: list[dict[str, object]]

    def to_dict(self) -> dict[str, object]:
        return {
            "config_path": str(self.config_path),
            "file_path": str(self.file_path),
            "reticulum": self.reticulum,
            "interfaces": self.interfaces,
            "schema": build_schema(),
        }


def build_schema() -> dict[str, object]:
    return {
        "reticulum_fields": RETICULUM_FIELD_SCHEMA,
        "common_interface_fields": COMMON_INTERFACE_FIELD_SCHEMA,
        "interface_type_fields": INTERFACE_TYPE_FIELD_SCHEMA,
        "supported_interface_types": list(SUPPORTED_RNS_INTERFACE_TYPES),
    }


def load_rns_config(config_dir: Path) -> ParsedRnsConfig:
    file_path = config_dir / RNS_CONFIG_FILENAME

    if not file_path.exists():
        return ParsedRnsConfig(
            config_path=config_dir,
            file_path=file_path,
            reticulum=dict(DEFAULT_RETICULUM_VALUES),
            interfaces=[build_default_interface("Local Auto", "AutoInterface")],
        )

    reticulum = dict(DEFAULT_RETICULUM_VALUES)
    interfaces: list[dict[str, object]] = []

    current_section: str | None = None
    current_interface: dict[str, object] | None = None

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if line == "" or line.startswith("#"):
            continue

        if line.startswith("[[") and line.endswith("]]"):
            name = line[2:-2].strip()
            current_section = "interface"
            current_interface = build_default_interface(name, "AutoInterface")
            interfaces.append(current_interface)
            continue

        if line.startswith("[") and line.endswith("]"):
            current_section = line[1:-1].strip()
            current_interface = None
            continue

        if "=" not in line:
            continue

        key, value = _split_key_value(line)

        if current_section == "reticulum":
            reticulum[key] = _parse_value(key, value, RETICULUM_FIELD_SCHEMA)
            continue

        if current_section == "interface" and current_interface is not None:
            if key == "type":
                interface_type = value.strip()
                current_interface["type"] = interface_type
                _merge_missing_type_defaults(current_interface, interface_type)
                continue

            current_interface[key] = _parse_value(
                key,
                value,
                _interface_schema_for(str(current_interface.get("type", ""))),
            )

    return ParsedRnsConfig(
        config_path=config_dir,
        file_path=file_path,
        reticulum=reticulum,
        interfaces=interfaces,
    )


def save_rns_config(config_dir: Path, payload: dict[str, object]) -> ParsedRnsConfig:
    config_dir.mkdir(parents=True, exist_ok=True)
    file_path = config_dir / RNS_CONFIG_FILENAME

    reticulum = _normalise_reticulum(payload.get("reticulum"))
    interfaces = _normalise_interfaces(payload.get("interfaces"))

    file_path.write_text(
        _render_rns_config(reticulum, interfaces),
        encoding="utf-8",
    )

    return ParsedRnsConfig(
        config_path=config_dir,
        file_path=file_path,
        reticulum=reticulum,
        interfaces=interfaces,
    )


def build_default_interface(name: str, interface_type: str) -> dict[str, object]:
    interface = dict(DEFAULT_INTERFACE_VALUES)
    interface["name"] = name
    interface["type"] = interface_type
    _merge_missing_type_defaults(interface, interface_type)
    return interface


def _normalise_reticulum(raw: object) -> dict[str, object]:
    if not isinstance(raw, dict):
        raw = {}

    result = dict(DEFAULT_RETICULUM_VALUES)

    for field in RETICULUM_FIELD_SCHEMA:
        key = str(field["key"])
        value = raw.get(key, result.get(key))
        result[key] = _normalise_by_field(value, field)

    return result


def _normalise_interfaces(raw: object) -> list[dict[str, object]]:
    if not isinstance(raw, list):
        return [build_default_interface("Local Auto", "AutoInterface")]

    result: list[dict[str, object]] = []

    for index, raw_interface in enumerate(raw, start=1):
        if not isinstance(raw_interface, dict):
            continue

        interface_type = str(raw_interface.get("type", "AutoInterface"))

        if interface_type not in SUPPORTED_RNS_INTERFACE_TYPES:
            interface_type = "CustomInterface"

        name = str(raw_interface.get("name", f"{interface_type} {index}")).strip()

        if name == "":
            name = f"{interface_type} {index}"

        interface = build_default_interface(name, interface_type)

        for field in _interface_schema_for(interface_type):
            key = str(field["key"])

            if key in raw_interface:
                interface[key] = _normalise_by_field(raw_interface[key], field)

        interface["name"] = name
        interface["type"] = interface_type
        result.append(interface)

    if len(result) == 0:
        result.append(build_default_interface("Local Auto", "AutoInterface"))

    return result


def _interface_schema_for(interface_type: str) -> list[dict[str, object]]:
    return [
        *COMMON_INTERFACE_FIELD_SCHEMA,
        *INTERFACE_TYPE_FIELD_SCHEMA.get(interface_type, INTERFACE_TYPE_FIELD_SCHEMA["CustomInterface"]),
    ]


def _merge_missing_type_defaults(interface: dict[str, object], interface_type: str) -> None:
    for key, value in INTERFACE_TYPE_DEFAULTS.get(interface_type, {}).items():
        interface.setdefault(key, value)


def _split_key_value(line: str) -> tuple[str, str]:
    key, value = line.split("=", 1)
    return key.strip(), value.strip()


def _parse_value(key: str, raw_value: str, schema: list[dict[str, object]]) -> object:
    field = _find_field(key, schema)

    if field is None:
        return raw_value

    return _normalise_by_field(raw_value, field)


def _find_field(key: str, schema: list[dict[str, object]]) -> dict[str, object] | None:
    for field in schema:
        if field.get("key") == key:
            return field

    return None


def _normalise_by_field(value: object, field: dict[str, object]) -> object:
    field_type = field.get("type")

    if field_type == FIELD_TYPE_BOOLEAN:
        return _to_bool(value)

    if field_type == FIELD_TYPE_INTEGER:
        return _to_integer_or_blank(value)

    return "" if value is None else str(value)


def _to_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value

    if value is None:
        return False

    text = str(value).strip().lower()

    if text in BOOLEAN_TRUE_VALUES:
        return True

    if text in BOOLEAN_FALSE_VALUES:
        return False

    return False


def _to_integer_or_blank(value: object) -> int | str:
    if value is None or value == "":
        return ""

    if isinstance(value, int):
        return value

    text = str(value).strip()

    if text == "":
        return ""

    return int(text)


def _render_rns_config(reticulum: dict[str, object], interfaces: list[dict[str, object]]) -> str:
    lines: list[str] = [
        "# FriendlyNode generated Reticulum config",
        "",
        "[reticulum]",
    ]

    for field in RETICULUM_FIELD_SCHEMA:
        key = str(field["key"])
        value = reticulum.get(key, "")

        if not _should_render_reticulum_field(key, value):
            continue

        lines.append(f"  {key} = {_render_value(value)}")

    lines.extend(["", "[interfaces]"])

    for interface in interfaces:
        interface_name = str(interface.get("name", "Unnamed Interface"))
        interface_type = str(interface.get("type", "AutoInterface"))

        lines.extend(["", f"  [[{interface_name}]]"])

        for field in _interface_schema_for(interface_type):
            key = str(field["key"])

            if key == "name":
                continue

            value = interface.get(key, "")

            if not _should_render_interface_field(interface_type, key, value):
                continue

            lines.append(f"    {key} = {_render_value(value)}")

    lines.append("")
    return "\n".join(lines)

def _should_render_reticulum_field(key: str, value: object) -> bool:
    if key in FORCED_RETICULUM_RENDER_KEYS:
        return True

    if value == "":
        return False

    default_value = DEFAULT_RETICULUM_VALUES.get(key, "")

    if _values_are_equivalent(value, default_value):
        return False

    return True


def _should_render_interface_field(interface_type: str, key: str, value: object) -> bool:
    if key in FORCED_INTERFACE_RENDER_KEYS:
        return True

    if value == "":
        return False

    default_value = _interface_default_value(interface_type, key)

    if _values_are_equivalent(value, default_value):
        return False

    return True


def _interface_default_value(interface_type: str, key: str) -> object:
    if key in DEFAULT_INTERFACE_VALUES:
        return DEFAULT_INTERFACE_VALUES[key]

    return INTERFACE_TYPE_DEFAULTS.get(interface_type, {}).get(key, "")


def _values_are_equivalent(left: object, right: object) -> bool:
    return _normalise_for_compare(left) == _normalise_for_compare(right)


def _normalise_for_compare(value: object) -> object:
    if isinstance(value, bool):
        return value

    if isinstance(value, int):
        return value

    if value is None:
        return ""

    text = str(value).strip()

    if text.lower() in BOOLEAN_TRUE_VALUES:
        return True

    if text.lower() in BOOLEAN_FALSE_VALUES:
        return False

    if text == "":
        return ""

    try:
        return int(text)
    except ValueError:
        return text

def _render_value(value: object) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"

    return str(value)
