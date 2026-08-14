"""Isolated LXMF worker process."""

from __future__ import annotations

import argparse
import signal
import sys
import threading
from pathlib import Path
from types import ModuleType
from typing import Any

from friendlynode.local_identities import LocalIdentity, LocalIdentityStore

DEFAULT_SOURCE_PATH = ""
WORKER_CONTROL_STOP_COMMAND = "stop"
WORKER_CONTROL_THREAD_NAME = "friendlynode-lxmf-control"
WORKER_WAIT_INTERVAL_SECONDS = 1.0


class LxmfWorkerRuntime:
    def __init__(
        self,
        identity_id: str,
        identities_dir: Path,
        rns_config_dir: Path,
        rns_source_path: Path | None,
        lxmf_source_path: Path | None,
    ) -> None:
        self.identity_id = identity_id
        self.identities_dir = identities_dir
        self.rns_config_dir = rns_config_dir
        self.rns_source_path = rns_source_path
        self.lxmf_source_path = lxmf_source_path
        self.identity_store = LocalIdentityStore(identities_dir)
        self.RNS: ModuleType | None = None
        self.LXMF: ModuleType | None = None
        self.reticulum: Any | None = None
        self.router: Any | None = None
        self.delivery_destination: Any | None = None
        self.rns_identity: Any | None = None
        self.received_messages = 0

    def start(self) -> None:
        self._configure_module_paths()

        import RNS
        import LXMF

        self.RNS = RNS
        self.LXMF = LXMF
        self.reticulum = RNS.Reticulum(
            configdir=str(self.rns_config_dir),
            require_shared_instance=True,
        )

        if not bool(getattr(self.reticulum, "is_connected_to_shared_instance", False)):
            raise RuntimeError("LXMF worker is not connected to the FriendlyNode Reticulum shared instance")

        local_identity = self._get_identity()
        self.rns_identity = self._load_or_create_rns_identity(local_identity)

        router_path = self.identity_store.lxmf_router_path(local_identity.id)
        router_path.mkdir(parents=True, exist_ok=True)

        self.router = LXMF.LXMRouter(storagepath=str(router_path))
        self.router.register_delivery_callback(self._receive_message)
        self.delivery_destination = self.router.register_delivery_identity(
            self.rns_identity,
            display_name=local_identity.display_name,
        )

        identity_hash = self._hex_value(getattr(self.rns_identity, "hash", b""))
        destination_hash = self._hex_value(getattr(self.delivery_destination, "hash", b""))

        if identity_hash == "":
            raise RuntimeError("Could not determine local identity hash")
        if destination_hash == "":
            raise RuntimeError("Could not determine LXMF delivery destination hash")

        self.identity_store.update_network_identity(local_identity.id, identity_hash, destination_hash)

        print(
            f"[friendlynode-lxmf:{local_identity.id}] ready "
            f"identity={identity_hash} destination={destination_hash}",
            flush=True,
        )

    def stop(self) -> None:
        if self.RNS is None:
            return

        transport = getattr(self.RNS, "Transport", None)
        detach_interfaces = getattr(transport, "detach_interfaces", None)

        if callable(detach_interfaces):
            try:
                detach_interfaces()
            except Exception as exc:
                print(
                    f"[friendlynode-lxmf:{self.identity_id}] detach failed: "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )

        reticulum_class = getattr(self.RNS, "Reticulum", None)
        exit_handler = getattr(reticulum_class, "exit_handler", None)

        if callable(exit_handler):
            try:
                exit_handler()
            except Exception as exc:
                print(
                    f"[friendlynode-lxmf:{self.identity_id}] exit handler failed: "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )

        self.delivery_destination = None
        self.router = None
        self.rns_identity = None
        self.reticulum = None

    def _configure_module_paths(self) -> None:
        for path in (self.lxmf_source_path, self.rns_source_path):
            if path is None:
                continue

            resolved = str(path.resolve())

            if resolved in sys.path:
                sys.path.remove(resolved)

            sys.path.insert(0, resolved)

    def _get_identity(self) -> LocalIdentity:
        for identity in self.identity_store.list_identities():
            if identity.id == self.identity_id:
                return identity

        raise ValueError(f"Local identity does not exist: {self.identity_id}")

    def _load_or_create_rns_identity(self, local_identity: LocalIdentity) -> Any:
        if self.RNS is None:
            raise RuntimeError("RNS module is not loaded")

        identity_path = self.identity_store.rns_identity_path(local_identity.id)
        identity_path.parent.mkdir(parents=True, exist_ok=True)

        if identity_path.exists():
            identity = self.RNS.Identity.from_file(str(identity_path))

            if identity is None:
                raise RuntimeError(f"Could not load RNS identity from {identity_path}")

            return identity

        identity = self.RNS.Identity()

        if not identity.to_file(str(identity_path)):
            raise RuntimeError(f"Could not save RNS identity to {identity_path}")

        return identity

    def _receive_message(self, message: object) -> None:
        self.received_messages += 1

    def _hex_value(self, value: object) -> str:
        if isinstance(value, bytes):
            return value.hex()

        if isinstance(value, bytearray):
            return bytes(value).hex()

        return str(value or "").strip().lower()


def main() -> None:
    args = _parse_args()
    stop_event = threading.Event()
    runtime = LxmfWorkerRuntime(
        identity_id=args.identity_id,
        identities_dir=Path(args.identities_dir),
        rns_config_dir=Path(args.rns_config_dir),
        rns_source_path=_optional_path(args.rns_source_path),
        lxmf_source_path=_optional_path(args.lxmf_source_path),
    )

    control_thread = threading.Thread(
        target=_control_loop,
        args=(stop_event,),
        name=WORKER_CONTROL_THREAD_NAME,
        daemon=True,
    )
    control_thread.start()
    _install_signal_handlers(stop_event)

    try:
        runtime.start()

        while not stop_event.wait(WORKER_WAIT_INTERVAL_SECONDS):
            pass
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        runtime.stop()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="FriendlyNode isolated LXMF worker")
    parser.add_argument("--identity-id", required=True)
    parser.add_argument("--identities-dir", required=True)
    parser.add_argument("--rns-config-dir", required=True)
    parser.add_argument("--rns-source-path", default=DEFAULT_SOURCE_PATH)
    parser.add_argument("--lxmf-source-path", default=DEFAULT_SOURCE_PATH)
    return parser.parse_args()


def _control_loop(stop_event: threading.Event) -> None:
    try:
        for line in sys.stdin:
            if line.strip().lower() == WORKER_CONTROL_STOP_COMMAND:
                stop_event.set()
                return
    finally:
        stop_event.set()


def _install_signal_handlers(stop_event: threading.Event) -> None:
    def request_stop(signum: int, frame: object) -> None:
        stop_event.set()

    for signal_name in ("SIGTERM", "SIGINT"):
        signal_value = getattr(signal, signal_name, None)

        if signal_value is not None:
            signal.signal(signal_value, request_stop)


def _optional_path(value: str) -> Path | None:
    cleaned = value.strip()
    return Path(cleaned) if cleaned != "" else None


if __name__ == "__main__":
    main()
