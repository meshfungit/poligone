"""Optional LXMF client runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from friendlynode.client_accounts import ClientAccount, ClientAccountStore


class LXMFClientRuntime:
    def __init__(self, rns_runtime: Any, clients_dir: Path) -> None:
        self.rns_runtime = rns_runtime
        self.clients_dir = clients_dir
        self.client_store = ClientAccountStore(clients_dir)
        self.started = False
        self.ready = False
        self.client_id = ""
        self.identity_hash = ""
        self.destination_hash = ""
        self.last_error = ""
        self.router: Any | None = None
        self.delivery_destination: Any | None = None
        self.received_messages = 0

    def start(self) -> None:
        self.started = True
        self.ready = False
        self.client_id = ""
        self.identity_hash = ""
        self.destination_hash = ""
        self.last_error = ""
        self.router = None
        self.delivery_destination = None

        if self.rns_runtime.reticulum is None:
            self.last_error = "Reticulum runtime is not running"
            return

        if self.rns_runtime.rns_using_stub:
            self.last_error = "Reticulum runtime is running in stub mode"
            return

        if self.rns_runtime.LXMF is None or self.rns_runtime.lxmf_using_stub:
            self.last_error = "LXMF runtime is not loaded"
            return

        try:
            client = self._select_active_client()
            identity = self._load_or_create_identity(client)
            self._start_router(client, identity)
        except Exception as exc:
            self.ready = False
            self.last_error = f"{type(exc).__name__}: {exc}"

    def stop(self) -> None:
        self.started = False
        self.ready = False
        self.router = None
        self.delivery_destination = None

    def status(self) -> dict[str, object]:
        lxmf_module = self.rns_runtime.LXMF

        return {
            "started": self.started,
            "ready": self.ready,
            "client_id": self.client_id,
            "identity_hash": self.identity_hash,
            "destination_hash": self.destination_hash,
            "clients_dir": str(self.clients_dir),
            "lxmf_version": getattr(lxmf_module, "__version__", None) if lxmf_module is not None else None,
            "router_loaded": self.router is not None,
            "delivery_destination_registered": self.delivery_destination is not None,
            "received_messages": self.received_messages,
            "last_error": self.last_error,
        }

    def _select_active_client(self) -> ClientAccount:
        clients = self.client_store.list_enabled_clients()

        if len(clients) == 0:
            raise RuntimeError("No enabled client account")

        if len(clients) > 1:
            raise RuntimeError("Multiple enabled client accounts are not supported yet")

        return clients[0]

    def _load_or_create_identity(self, client: ClientAccount) -> Any:
        rns = self.rns_runtime.RNS

        if rns is None:
            raise RuntimeError("RNS module is not loaded")

        identity_path = self.client_store.identity_path(client.id)
        identity_path.parent.mkdir(parents=True, exist_ok=True)

        if identity_path.exists():
            identity = rns.Identity.from_file(str(identity_path))

            if identity is None:
                raise RuntimeError(f"Could not load LXMF identity from {identity_path}")

            return identity

        identity = rns.Identity()

        if not identity.to_file(str(identity_path)):
            raise RuntimeError(f"Could not save LXMF identity to {identity_path}")

        return identity

    def _start_router(self, client: ClientAccount, identity: Any) -> None:
        lxmf = self.rns_runtime.LXMF

        if lxmf is None:
            raise RuntimeError("LXMF module is not loaded")

        router_path = self.client_store.lxmf_router_path(client.id)
        router_path.mkdir(parents=True, exist_ok=True)

        self.router = lxmf.LXMRouter(storagepath=str(router_path))
        self.router.register_delivery_callback(self._receive_message)

        self.delivery_destination = self.router.register_delivery_identity(
            identity,
            display_name=client.display_name,
        )

        self.client_id = client.id
        self.identity_hash = self._hex_value(getattr(identity, "hash", b""))
        self.destination_hash = self._hex_value(
            getattr(self.delivery_destination, "hash", b"")
        )

        if self.identity_hash == "":
            raise RuntimeError("Could not determine client identity hash")

        if self.destination_hash == "":
            raise RuntimeError("Could not determine LXMF delivery destination hash")

        self.client_store.update_client_network_identity(
            client.id,
            self.identity_hash,
            self.destination_hash,
        )

        self.ready = True
        self.last_error = ""

    def _receive_message(self, message: object) -> None:
        self.received_messages += 1

    def _hex_value(self, value: object) -> str:
        if isinstance(value, bytes):
            return value.hex()

        if isinstance(value, bytearray):
            return bytes(value).hex()

        return str(value or "").strip().lower()
