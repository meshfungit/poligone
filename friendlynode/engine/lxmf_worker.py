"""Isolated LXMF worker process."""

from __future__ import annotations

import argparse
import json
import signal
import socket
import sys
import threading
import time
from pathlib import Path
from types import ModuleType
from typing import Any

from friendlynode.local_identities import LocalIdentity, LocalIdentityStore

DEFAULT_SOURCE_PATH = ""
DEFAULT_CONTROL_HOST = "127.0.0.1"
WORKER_CONTROL_STOP_COMMAND = "stop"
WORKER_CONTROL_STATUS_COMMAND = "status"
WORKER_CONTROL_ANNOUNCE_COMMAND = "announce"
WORKER_CONTROL_ANNOUNCED_RESPONSE = "announced"
WORKER_CONTROL_NOT_READY_RESPONSE = "not_ready"
WORKER_CONTROL_READY_RESPONSE = "ready"
WORKER_CONTROL_STARTING_RESPONSE = "starting"
WORKER_CONTROL_ACCEPT_TIMEOUT_SECONDS = 0.5
WORKER_CONTROL_RECEIVE_SIZE = 64
WORKER_CONTROL_THREAD_NAME = "friendlynode-lxmf-control"
WORKER_EVENT_PREFIX = "FN_LXMF_EVENT "
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
        self._announce_lock = threading.Lock()
        self._auto_announce_enabled = False
        self._auto_announce_interval_seconds: int | None = None
        self._next_auto_announce_at: float | None = None

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

        self._validate_network_identity(local_identity, identity_hash, destination_hash)
        self.identity_store.update_network_identity(local_identity.id, identity_hash, destination_hash)

        print(
            f"[friendlynode-lxmf:{local_identity.id}] ready "
            f"identity={identity_hash} destination={destination_hash}",
            flush=True,
        )

    def announce(self, source: str = "manual") -> str:
        if self.router is None or self.delivery_destination is None:
            raise RuntimeError("LXMF worker is not ready")

        with self._announce_lock:
            destination_hash = self._hex_value(getattr(self.delivery_destination, "hash", b""))
            self.router.announce(self.delivery_destination.hash)
            print(
                f"[friendlynode-lxmf:{self.identity_id}] announce sent "
                f"destination={destination_hash} source={source}",
                flush=True,
            )
            return destination_hash

    def process_periodic_tasks(self) -> None:
        try:
            local_identity = self._get_identity()
        except Exception as exc:
            print(
                f"[friendlynode-lxmf:{self.identity_id}] announce settings read failed: "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )
            return

        if not local_identity.lxmf_auto_announce:
            self._auto_announce_enabled = False
            self._auto_announce_interval_seconds = None
            self._next_auto_announce_at = None
            return

        now = time.monotonic()
        interval_seconds = local_identity.lxmf_announce_interval_seconds

        if not self._auto_announce_enabled:
            self.announce(source="auto")
            self._auto_announce_enabled = True
            self._auto_announce_interval_seconds = interval_seconds
            self._next_auto_announce_at = now + interval_seconds
            return

        if self._auto_announce_interval_seconds != interval_seconds:
            self._auto_announce_interval_seconds = interval_seconds
            self._next_auto_announce_at = now + interval_seconds
            return

        if self._next_auto_announce_at is not None and now >= self._next_auto_announce_at:
            self.announce(source="auto")
            self._next_auto_announce_at = now + interval_seconds

    def stop(self) -> None:
        if self.RNS is None:
            return

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

        if local_identity.identity_hash != "" or local_identity.lxmf_destination_hash != "":
            raise RuntimeError(
                f"RNS identity key file is missing for {local_identity.id}; "
                "refusing to replace an existing network identity"
            )

        identity = self.RNS.Identity()

        if not identity.to_file(str(identity_path)):
            raise RuntimeError(f"Could not save RNS identity to {identity_path}")

        return identity

    def _validate_network_identity(
        self,
        local_identity: LocalIdentity,
        identity_hash: str,
        destination_hash: str,
    ) -> None:
        if local_identity.identity_hash not in ("", identity_hash):
            raise RuntimeError(
                f"Stored identity hash does not match the RNS identity key for {local_identity.id}"
            )

        if local_identity.lxmf_destination_hash not in ("", destination_hash):
            raise RuntimeError(
                f"Stored LXMF destination hash does not match the RNS identity key for {local_identity.id}"
            )

    def _receive_message(self, message: object) -> None:
        self.received_messages += 1
        content_getter = getattr(message, "content_as_string", None)
        title_getter = getattr(message, "title_as_string", None)
        payload = {
            "identity_id": self.identity_id,
            "message_id": self._hex_value(getattr(message, "hash", b"")),
            "source_hash": self._hex_value(getattr(message, "source_hash", b"")),
            "destination_hash": self._hex_value(getattr(message, "destination_hash", b"")),
            "timestamp": getattr(message, "timestamp", None),
            "title": str(title_getter() or "") if callable(title_getter) else "",
            "content": str(content_getter() or "") if callable(content_getter) else "",
            "signature_validated": bool(getattr(message, "signature_validated", False)),
            "transport_encryption": str(getattr(message, "transport_encryption", "") or ""),
        }
        print(
            WORKER_EVENT_PREFIX + json.dumps(
                {"topic": "lxmf.message_received", "payload": payload},
                separators=(",", ":"),
            ),
            flush=True,
        )
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message received "
            f"source={payload['source_hash']} id={payload['message_id']}",
            flush=True,
        )

    def _hex_value(self, value: object) -> str:
        if isinstance(value, bytes):
            return value.hex()

        if isinstance(value, bytearray):
            return bytes(value).hex()

        return str(value or "").strip().lower()


def main() -> None:
    args = _parse_args()
    stop_event = threading.Event()
    ready_event = threading.Event()
    runtime = LxmfWorkerRuntime(
        identity_id=args.identity_id,
        identities_dir=Path(args.identities_dir),
        rns_config_dir=Path(args.rns_config_dir),
        rns_source_path=_optional_path(args.rns_source_path),
        lxmf_source_path=_optional_path(args.lxmf_source_path),
    )

    control_thread = threading.Thread(
        target=_control_loop,
        args=(runtime, stop_event, ready_event, args.control_host, args.control_port),
        name=WORKER_CONTROL_THREAD_NAME,
        daemon=True,
    )
    control_thread.start()
    _install_signal_handlers(stop_event)

    try:
        runtime.start()
        ready_event.set()

        while not stop_event.wait(WORKER_WAIT_INTERVAL_SECONDS):
            runtime.process_periodic_tasks()
    except KeyboardInterrupt:
        stop_event.set()
    finally:
        ready_event.clear()
        runtime.stop()


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="FriendlyNode isolated LXMF worker")
    parser.add_argument("--identity-id", required=True)
    parser.add_argument("--identities-dir", required=True)
    parser.add_argument("--rns-config-dir", required=True)
    parser.add_argument("--rns-source-path", default=DEFAULT_SOURCE_PATH)
    parser.add_argument("--lxmf-source-path", default=DEFAULT_SOURCE_PATH)
    parser.add_argument("--control-host", default=DEFAULT_CONTROL_HOST)
    parser.add_argument("--control-port", required=True, type=int)
    return parser.parse_args()


def _control_loop(
    runtime: LxmfWorkerRuntime,
    stop_event: threading.Event,
    ready_event: threading.Event,
    control_host: str,
    control_port: int,
) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
        server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        server.bind((control_host, control_port))
        server.listen()
        server.settimeout(WORKER_CONTROL_ACCEPT_TIMEOUT_SECONDS)

        while not stop_event.is_set():
            try:
                connection, _ = server.accept()
            except TimeoutError:
                continue
            except OSError:
                if stop_event.is_set():
                    return
                raise

            with connection:
                command = connection.recv(WORKER_CONTROL_RECEIVE_SIZE).decode("utf-8", errors="replace").strip().lower()

                if command == WORKER_CONTROL_STOP_COMMAND:
                    stop_event.set()
                    connection.sendall(b"stopping\n")
                    return

                if command == WORKER_CONTROL_STATUS_COMMAND:
                    response = WORKER_CONTROL_READY_RESPONSE if ready_event.is_set() else WORKER_CONTROL_STARTING_RESPONSE
                    connection.sendall(f"{response}\n".encode("utf-8"))
                    continue

                if command == WORKER_CONTROL_ANNOUNCE_COMMAND:
                    if not ready_event.is_set():
                        connection.sendall(f"{WORKER_CONTROL_NOT_READY_RESPONSE}\n".encode("utf-8"))
                        continue

                    try:
                        runtime.announce(source="manual")
                    except Exception as exc:
                        print(
                            f"[friendlynode-lxmf:{runtime.identity_id}] manual announce failed: "
                            f"{type(exc).__name__}: {exc}",
                            flush=True,
                        )
                        connection.sendall(b"error\n")
                        continue

                    connection.sendall(f"{WORKER_CONTROL_ANNOUNCED_RESPONSE}\n".encode("utf-8"))


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
