"""Optional LXMF client runtime."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from friendlynode.local_identities import LocalIdentity, LocalIdentityStore


class LXMFClientRuntime:
    def __init__(self, rns_runtime: Any, identities_dir: Path) -> None:
        self.rns_runtime = rns_runtime
        self.identities_dir = identities_dir
        self.identity_store = LocalIdentityStore(identities_dir)
        self.started = False
        self.ready = False
        self.identity_id = ""
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
        self.identity_id = ""
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
            local_identity = self._select_active_identity()
            rns_identity = self._load_or_create_rns_identity(local_identity)
            self._start_router(local_identity, rns_identity)
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
            "identity_id": self.identity_id,
            "client_id": self.client_id,
            "identity_hash": self.identity_hash,
            "destination_hash": self.destination_hash,
            "identities_dir": str(self.identities_dir),
            "lxmf_version": getattr(lxmf_module, "__version__", None) if lxmf_module is not None else None,
            "router_loaded": self.router is not None,
            "delivery_destination_registered": self.delivery_destination is not None,
            "received_messages": self.received_messages,
            "last_error": self.last_error,
        }

    def _select_active_identity(self) -> LocalIdentity:
        identities = self.identity_store.list_enabled_identities()

        if len(identities) == 0:
            raise RuntimeError("No enabled local identity")

        if len(identities) > 1:
            raise RuntimeError("Multiple enabled local identities are not supported yet")

        return identities[0]

    def _load_or_create_rns_identity(self, local_identity: LocalIdentity) -> Any:
        rns = self.rns_runtime.RNS

        if rns is None:
            raise RuntimeError("RNS module is not loaded")

        identity_path = self.identity_store.rns_identity_path(local_identity.id)
        identity_path.parent.mkdir(parents=True, exist_ok=True)

        if identity_path.exists():
            identity = rns.Identity.from_file(str(identity_path))

            if identity is None:
                raise RuntimeError(f"Could not load RNS identity from {identity_path}")

            return identity

        identity = rns.Identity()

        if not identity.to_file(str(identity_path)):
            raise RuntimeError(f"Could not save RNS identity to {identity_path}")

        return identity

    def _start_router(self, local_identity: LocalIdentity, rns_identity: Any) -> None:
        lxmf = self.rns_runtime.LXMF

        if lxmf is None:
            raise RuntimeError("LXMF module is not loaded")

        router_path = self.identity_store.lxmf_router_path(local_identity.id)
        router_path.mkdir(parents=True, exist_ok=True)

        self.router = lxmf.LXMRouter(storagepath=str(router_path))
        self.router.register_delivery_callback(self._receive_message)

        self.delivery_destination = self.router.register_delivery_identity(
            rns_identity,
            display_name=local_identity.display_name,
        )

        self.identity_id = local_identity.id
        self.client_id = local_identity.id
        self.identity_hash = self._hex_value(getattr(rns_identity, "hash", b""))
        self.destination_hash = self._hex_value(getattr(self.delivery_destination, "hash", b""))

        if self.identity_hash == "":
            raise RuntimeError("Could not determine local identity hash")

        if self.destination_hash == "":
            raise RuntimeError("Could not determine LXMF delivery destination hash")

        self.identity_store.update_network_identity(
            local_identity.id,
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
