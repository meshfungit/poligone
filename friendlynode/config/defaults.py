"""Central defaults for FriendlyNode."""

from __future__ import annotations

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]

DATA_DIR = PROJECT_ROOT / "data"
IMPORT_EXPORT_DIR = DATA_DIR / "import-export"
INTERFACES_EXPORT_PATH = IMPORT_EXPORT_DIR / "interfaces-export.json"
WEB_UI_DIR = PROJECT_ROOT / "web-ui"
RUNTIMES_DIR = PROJECT_ROOT / "runtimes"
CUSTOM_INTERFACES_DIR = PROJECT_ROOT / "custom_interfaces"

DEFAULT_CONTROLLER_HOST = "127.0.0.1"
DEFAULT_CONTROLLER_PORT = 8787
DEFAULT_TAILSCALE_ACCESS_ENABLED = False
DEFAULT_LXMF_ENABLED = False
DEFAULT_NOMADNET_ENABLED = True
DEFAULT_CLIENT_ENABLED = False

DEFAULT_ENGINE_NAME = "stub"

DEFAULT_APP_CONFIG_PATH = DATA_DIR / "config" / "friendlynode.json"
DEFAULT_RNS_CONFIG_DIR = DATA_DIR / "config" / "reticulum"
DEFAULT_NOMADNET_PAGES_DIR = DATA_DIR / "nomadnet-pages"
DEFAULT_DATABASE_PATH = DATA_DIR / "db" / "friendlynode.sqlite3"
DEFAULT_CLIENTS_DIR = DATA_DIR / "clients"

SUPPORTED_INTERFACE_TYPES = (
    "AutoInterface",
    "BackboneInterface",
    "TCPClientInterface",
    "TCPServerInterface",
    "UDPInterface",
    "I2PInterface",
    "PipeInterface",
    "CustomInterface",
)

HIDDEN_INTERFACE_TYPES = (
    "KISSInterface",
    "AX25KISSInterface",
    "RNodeInterface",
    "RNodeMultiInterface",
    "SerialInterface",
)
