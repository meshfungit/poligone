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
WORKER_CONTROL_SEND_COMMAND = "send"
WORKER_CONTROL_ANNOUNCED_RESPONSE = "announced"
WORKER_CONTROL_NOT_READY_RESPONSE = "not_ready"
WORKER_CONTROL_READY_RESPONSE = "ready"
WORKER_CONTROL_STARTING_RESPONSE = "starting"
WORKER_CONTROL_ACCEPT_TIMEOUT_SECONDS = 0.5
WORKER_CONTROL_RECEIVE_CHUNK_SIZE = 4096
WORKER_CONTROL_MAX_REQUEST_BYTES = 1024 * 1024
WORKER_CONTROL_THREAD_NAME = "friendlynode-lxmf-control"
WORKER_EVENT_PREFIX = "FN_LXMF_EVENT "
WORKER_WAIT_INTERVAL_SECONDS = 1.0
OUTBOUND_IDENTITY_LOOKUP_TIMEOUT_SECONDS = 5.0
OUTBOUND_IDENTITY_LOOKUP_POLL_SECONDS = 0.1
MESSAGE_DELIVERY_DIRECT = "direct"
MESSAGE_DELIVERY_PROPAGATION = "propagation"
MESSAGE_DELIVERY_METHODS = (
    MESSAGE_DELIVERY_DIRECT,
    MESSAGE_DELIVERY_PROPAGATION,
)


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

    def send_message(
        self,
        destination_hash: str,
        content: str,
        *,
        title: str = "",
        local_message_id: str = "",
        contact_id: str = "",
        delivery_method: str = MESSAGE_DELIVERY_DIRECT,
        propagation_node_hash: str = "",
    ) -> dict[str, object]:
        if self.router is None or self.delivery_destination is None or self.RNS is None or self.LXMF is None:
            raise RuntimeError("LXMF worker is not ready")

        clean_delivery_method = delivery_method.strip().lower()

        if clean_delivery_method not in MESSAGE_DELIVERY_METHODS:
            raise ValueError(f"Unsupported LXMF delivery method: {clean_delivery_method}")

        clean_destination_hash = destination_hash.strip().lower()
        destination_hash_bytes = bytes.fromhex(clean_destination_hash)
        expected_length = self.RNS.Identity.TRUNCATED_HASHLENGTH // 8

        if len(destination_hash_bytes) != expected_length:
            raise ValueError(f"Invalid LXMF destination hash length: {clean_destination_hash}")

        clean_propagation_node_hash = propagation_node_hash.strip().lower()

        if clean_delivery_method == MESSAGE_DELIVERY_PROPAGATION:
            propagation_node_bytes = bytes.fromhex(clean_propagation_node_hash)

            if len(propagation_node_bytes) != expected_length:
                raise ValueError(
                    f"Invalid propagation node hash length: {clean_propagation_node_hash}"
                )

            self.router.set_outbound_propagation_node(propagation_node_bytes)

        recipient_identity = self.RNS.Identity.recall(destination_hash_bytes)

        if recipient_identity is None:
            self.RNS.Transport.request_path(destination_hash_bytes)
            deadline = time.monotonic() + OUTBOUND_IDENTITY_LOOKUP_TIMEOUT_SECONDS

            while recipient_identity is None and time.monotonic() < deadline:
                time.sleep(OUTBOUND_IDENTITY_LOOKUP_POLL_SECONDS)
                recipient_identity = self.RNS.Identity.recall(destination_hash_bytes)

        if recipient_identity is None:
            raise RuntimeError(
                f"Destination identity is not available after path lookup: {clean_destination_hash}"
            )

        destination = self.RNS.Destination(
            recipient_identity,
            self.RNS.Destination.OUT,
            self.RNS.Destination.SINGLE,
            "lxmf",
            "delivery",
        )

        desired_method = (
            self.LXMF.LXMessage.PROPAGATED
            if clean_delivery_method == MESSAGE_DELIVERY_PROPAGATION
            else self.LXMF.LXMessage.DIRECT
        )
        message_kwargs: dict[str, object] = {
            "desired_method": desired_method,
        }

        if clean_delivery_method == MESSAGE_DELIVERY_DIRECT:
            message_kwargs["include_ticket"] = True

        message = self.LXMF.LXMessage(
            destination,
            self.delivery_destination,
            content,
            title,
            **message_kwargs,
        )
        message.register_delivery_callback(
            lambda succeeded_message: self._outbound_succeeded(
                succeeded_message,
                local_message_id=local_message_id,
                contact_id=contact_id,
                delivery_method=clean_delivery_method,
                propagation_node_hash=clean_propagation_node_hash,
            )
        )
        message.register_failed_callback(
            lambda failed_message: self._outbound_failed(
                failed_message,
                local_message_id=local_message_id,
                contact_id=contact_id,
                delivery_method=clean_delivery_method,
                propagation_node_hash=clean_propagation_node_hash,
            )
        )
        self.router.handle_outbound(message)

        message_id = self._hex_value(getattr(message, "hash", b""))
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message queued "
            f"destination={clean_destination_hash} id={message_id} "
            f"mode={clean_delivery_method}"
            + (
                f" propagation_node={clean_propagation_node_hash}"
                if clean_delivery_method == MESSAGE_DELIVERY_PROPAGATION
                else ""
            ),
            flush=True,
        )
        return {
            "status": "queued",
            "identity_id": self.identity_id,
            "contact_id": contact_id,
            "local_message_id": local_message_id,
            "message_id": message_id,
            "destination_hash": clean_destination_hash,
            "delivery_method": clean_delivery_method,
            "propagation_node_hash": clean_propagation_node_hash,
        }
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
        self._emit_worker_event("lxmf.message_received", payload)
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message received "
            f"source={payload['source_hash']} id={payload['message_id']}",
            flush=True,
        )

    def _outbound_succeeded(
        self,
        message: object,
        *,
        local_message_id: str,
        contact_id: str,
        delivery_method: str,
        propagation_node_hash: str,
    ) -> None:
        propagated = delivery_method == MESSAGE_DELIVERY_PROPAGATION
        state = "propagated" if propagated else "delivered"
        topic = "lxmf.message_propagated" if propagated else "lxmf.message_delivered"
        payload = self._outbound_event_payload(
            message,
            local_message_id=local_message_id,
            contact_id=contact_id,
            state=state,
            delivery_method=delivery_method,
            propagation_node_hash=propagation_node_hash,
        )
        self._emit_worker_event(topic, payload)
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message {state} "
            f"destination={payload['destination_hash']} id={payload['message_id']}"
            + (
                f" propagation_node={propagation_node_hash}"
                if propagated
                else ""
            ),
            flush=True,
        )

    def _outbound_failed(
        self,
        message: object,
        *,
        local_message_id: str,
        contact_id: str,
        delivery_method: str,
        propagation_node_hash: str,
    ) -> None:
        payload = self._outbound_event_payload(
            message,
            local_message_id=local_message_id,
            contact_id=contact_id,
            state="failed",
            delivery_method=delivery_method,
            propagation_node_hash=propagation_node_hash,
        )
        self._emit_worker_event("lxmf.message_failed", payload)
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message failed "
            f"destination={payload['destination_hash']} id={payload['message_id']} "
            f"mode={delivery_method}",
            flush=True,
        )

    def _outbound_event_payload(
        self,
        message: object,
        *,
        local_message_id: str,
        contact_id: str,
        state: str,
        delivery_method: str,
        propagation_node_hash: str,
    ) -> dict[str, object]:
        return {
            "identity_id": self.identity_id,
            "contact_id": contact_id,
            "local_message_id": local_message_id,
            "message_id": self._hex_value(getattr(message, "hash", b"")),
            "destination_hash": self._hex_value(getattr(message, "destination_hash", b"")),
            "state": state,
            "delivery_method": delivery_method,
            "propagation_node_hash": propagation_node_hash,
        }
    def _emit_worker_event(self, topic: str, payload: dict[str, object]) -> None:
        print(
            WORKER_EVENT_PREFIX + json.dumps(
                {"topic": topic, "payload": payload},
                separators=(",", ":"),
            ),
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
                raw_request = _receive_control_request(connection)
                command = raw_request.strip().lower()

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
                    continue

                try:
                    request = json.loads(raw_request)
                except (TypeError, ValueError):
                    connection.sendall(b'{"status":"error","error":"invalid_request"}\n')
                    continue

                if not isinstance(request, dict) or str(request.get("command") or "") != WORKER_CONTROL_SEND_COMMAND:
                    connection.sendall(b'{"status":"error","error":"unknown_command"}\n')
                    continue

                if not ready_event.is_set():
                    connection.sendall(b'{"status":"error","error":"not_ready"}\n')
                    continue

                try:
                    result = runtime.send_message(
                        str(request.get("destination_hash") or ""),
                        str(request.get("content") or ""),
                        title=str(request.get("title") or ""),
                        local_message_id=str(request.get("local_message_id") or ""),
                        contact_id=str(request.get("contact_id") or ""),
                        delivery_method=str(request.get("delivery_method") or MESSAGE_DELIVERY_DIRECT),
                        propagation_node_hash=str(request.get("propagation_node_hash") or ""),
                    )
                    connection.sendall((json.dumps(result, separators=(",", ":")) + "\n").encode("utf-8"))
                except Exception as exc:
                    print(
                        f"[friendlynode-lxmf:{runtime.identity_id}] outbound send failed: "
                        f"{type(exc).__name__}: {exc}",
                        flush=True,
                    )
                    response = {
                        "status": "error",
                        "error": type(exc).__name__,
                        "message": str(exc),
                    }
                    connection.sendall((json.dumps(response, separators=(",", ":")) + "\n").encode("utf-8"))


def _receive_control_request(connection: socket.socket) -> str:
    received = bytearray()

    while len(received) < WORKER_CONTROL_MAX_REQUEST_BYTES:
        chunk = connection.recv(WORKER_CONTROL_RECEIVE_CHUNK_SIZE)

        if not chunk:
            break

        received.extend(chunk)

        if b"\n" in chunk:
            break

    if len(received) >= WORKER_CONTROL_MAX_REQUEST_BYTES:
        raise ValueError("LXMF worker control request is too large")

    return bytes(received).decode("utf-8", errors="strict").strip()


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
