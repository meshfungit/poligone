"""Isolated LXMF worker process."""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import json
import queue
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
PROPAGATION_REPLICATION_THREAD_NAME = "friendlynode-lxmf-propagation"
PROPAGATION_PENDING_POLL_SECONDS = 0.05
PROPAGATION_QUEUE_STOP = object()


@dataclass(slots=True)
class PropagationSendJob:
    message: Any
    destination_hash: str
    local_message_id: str
    contact_id: str
    propagation_node_hashes: tuple[str, ...]




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
        self._propagation_queue: queue.Queue[PropagationSendJob | object] = queue.Queue()
        self._propagation_stop_event = threading.Event()
        self._propagation_thread: threading.Thread | None = None

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

        self._propagation_stop_event.clear()
        self._propagation_thread = threading.Thread(
            target=self._propagation_loop,
            name=PROPAGATION_REPLICATION_THREAD_NAME,
            daemon=True,
        )
        self._propagation_thread.start()

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
        propagation_node_hashes: list[str] | None = None,
    ) -> dict[str, object]:
        if self.router is None or self.delivery_destination is None or self.RNS is None or self.LXMF is None:
            raise RuntimeError("LXMF worker is not ready")

        clean_delivery_method = delivery_method.strip().lower()

        if clean_delivery_method not in MESSAGE_DELIVERY_METHODS:
            raise ValueError(f"Unsupported LXMF delivery method: {clean_delivery_method}")

        clean_destination_hash = destination_hash.strip().lower()
        destination = self._resolve_lxmf_destination(clean_destination_hash)
        clean_propagation_node_hashes = self._normalise_propagation_node_hashes(
            propagation_node_hashes or []
        )

        if (
            clean_delivery_method == MESSAGE_DELIVERY_PROPAGATION
            and len(clean_propagation_node_hashes) == 0
        ):
            raise ValueError("Propagation delivery requires at least one propagation node")

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

        if clean_delivery_method == MESSAGE_DELIVERY_DIRECT:
            message.register_delivery_callback(
                lambda succeeded_message: self._outbound_succeeded(
                    succeeded_message,
                    local_message_id=local_message_id,
                    contact_id=contact_id,
                    delivery_method=clean_delivery_method,
                    propagation_node_hash="",
                )
            )
            message.register_failed_callback(
                lambda failed_message: self._outbound_failed(
                    failed_message,
                    local_message_id=local_message_id,
                    contact_id=contact_id,
                    delivery_method=clean_delivery_method,
                    propagation_node_hash="",
                )
            )
            self.router.handle_outbound(message)
        else:
            self._propagation_queue.put(
                PropagationSendJob(
                    message=message,
                    destination_hash=clean_destination_hash,
                    local_message_id=local_message_id,
                    contact_id=contact_id,
                    propagation_node_hashes=tuple(clean_propagation_node_hashes),
                )
            )

        message_id = self._hex_value(getattr(message, "hash", b""))
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message queued "
            f"destination={clean_destination_hash} id={message_id} "
            f"mode={clean_delivery_method}"
            + (
                f" propagation_nodes={len(clean_propagation_node_hashes)}"
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
            "propagation_node_hashes": clean_propagation_node_hashes,
        }
    def _resolve_lxmf_destination(self, destination_hash: str) -> Any:
        if self.RNS is None:
            raise RuntimeError("RNS module is not loaded")

        destination_hash_bytes = bytes.fromhex(destination_hash)
        expected_length = self.RNS.Identity.TRUNCATED_HASHLENGTH // 8

        if len(destination_hash_bytes) != expected_length:
            raise ValueError(f"Invalid LXMF destination hash length: {destination_hash}")

        recipient_identity = self.RNS.Identity.recall(destination_hash_bytes)

        if recipient_identity is None:
            self.RNS.Transport.request_path(destination_hash_bytes)
            deadline = time.monotonic() + OUTBOUND_IDENTITY_LOOKUP_TIMEOUT_SECONDS

            while recipient_identity is None and time.monotonic() < deadline:
                time.sleep(OUTBOUND_IDENTITY_LOOKUP_POLL_SECONDS)
                recipient_identity = self.RNS.Identity.recall(destination_hash_bytes)

        if recipient_identity is None:
            raise RuntimeError(
                f"Destination identity is not available after path lookup: {destination_hash}"
            )

        return self.RNS.Destination(
            recipient_identity,
            self.RNS.Destination.OUT,
            self.RNS.Destination.SINGLE,
            "lxmf",
            "delivery",
        )

    def _normalise_propagation_node_hashes(self, node_hashes: list[str]) -> list[str]:
        if self.RNS is None:
            raise RuntimeError("RNS module is not loaded")

        expected_length = self.RNS.Identity.TRUNCATED_HASHLENGTH // 8
        result: list[str] = []
        seen: set[str] = set()

        for raw_hash in node_hashes:
            node_hash = str(raw_hash or "").strip().lower()

            if node_hash == "" or node_hash in seen:
                continue

            node_hash_bytes = bytes.fromhex(node_hash)

            if len(node_hash_bytes) != expected_length:
                raise ValueError(f"Invalid propagation node hash length: {node_hash}")

            seen.add(node_hash)
            result.append(node_hash)

        return result

    def _propagation_loop(self) -> None:
        while not self._propagation_stop_event.is_set():
            job = self._propagation_queue.get()

            try:
                if job is PROPAGATION_QUEUE_STOP:
                    return

                if not isinstance(job, PropagationSendJob):
                    continue

                self._replicate_propagation_message(job)
            except Exception as exc:
                print(
                    f"[friendlynode-lxmf:{self.identity_id}] propagation replication error: "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )

                if isinstance(job, PropagationSendJob):
                    self._emit_final_propagation_failure(
                        job,
                        f"{type(exc).__name__}: {exc}",
                    )
            finally:
                self._propagation_queue.task_done()

    def _replicate_propagation_message(self, job: PropagationSendJob) -> None:
        if self.router is None:
            raise RuntimeError("LXMF router is not ready")

        candidates = self._propagation_candidates(job)
        accepted_count = 0

        for node_hash, stamp_cost in candidates:
            if self._propagation_stop_event.is_set():
                return

            succeeded, error = self._attempt_propagation_node(
                job,
                node_hash,
                stamp_cost,
            )

            if succeeded:
                accepted_count += 1
                payload = self._outbound_event_payload(
                    job.message,
                    local_message_id=job.local_message_id,
                    contact_id=job.contact_id,
                    state="propagated",
                    delivery_method=MESSAGE_DELIVERY_PROPAGATION,
                    propagation_node_hash=node_hash,
                )
                self._emit_worker_event("lxmf.message_propagated", payload)
                print(
                    f"[friendlynode-lxmf:{self.identity_id}] message propagated "
                    f"destination={payload['destination_hash']} id={payload['message_id']} "
                    f"transient_id={payload['transient_id']} propagation_node={node_hash}",
                    flush=True,
                )
            else:
                self._emit_propagation_node_failed(job, node_hash, error)

                if bool(getattr(job.message, "stamp_generation_failed", False)):
                    break

        completion_payload = {
            "identity_id": self.identity_id,
            "contact_id": job.contact_id,
            "local_message_id": job.local_message_id,
            "message_id": self._hex_value(getattr(job.message, "hash", b"")),
            "transient_id": self._hex_value(getattr(job.message, "transient_id", b"")),
            "destination_hash": job.destination_hash,
            "accepted_count": accepted_count,
            "node_count": len(job.propagation_node_hashes),
        }
        self._emit_worker_event("lxmf.propagation_replication_complete", completion_payload)
        print(
            f"[friendlynode-lxmf:{self.identity_id}] propagation replication complete "
            f"id={completion_payload['message_id']} transient_id={completion_payload['transient_id']} "
            f"accepted={accepted_count}/{len(job.propagation_node_hashes)}",
            flush=True,
        )

        if accepted_count == 0:
            self._emit_final_propagation_failure(
                job,
                "All enabled propagation nodes failed",
            )

    def _propagation_candidates(
        self,
        job: PropagationSendJob,
    ) -> list[tuple[str, int]]:
        if self.router is None:
            raise RuntimeError("LXMF router is not ready")

        candidates: list[tuple[str, int]] = []

        for node_hash in job.propagation_node_hashes:
            try:
                self.router.set_outbound_propagation_node(bytes.fromhex(node_hash))
                stamp_cost = self.router.get_outbound_propagation_cost()

                if stamp_cost is None:
                    self._emit_propagation_node_failed(
                        job,
                        node_hash,
                        "Propagation stamp cost unavailable",
                    )
                    continue

                candidates.append((node_hash, int(stamp_cost)))
            except Exception as exc:
                self._emit_propagation_node_failed(
                    job,
                    node_hash,
                    f"{type(exc).__name__}: {exc}",
                )

        if len(candidates) == 0:
            return []

        stamp_seed = max(candidates, key=lambda candidate: candidate[1])
        return [
            stamp_seed,
            *[
                candidate
                for candidate in candidates
                if candidate[0] != stamp_seed[0]
            ],
        ]

    def _attempt_propagation_node(
        self,
        job: PropagationSendJob,
        node_hash: str,
        stamp_cost: int,
    ) -> tuple[bool, str]:
        if self.router is None:
            return False, "LXMF router is not ready"

        message = job.message
        completion = threading.Event()
        outcome: dict[str, object] = {
            "succeeded": False,
            "error": "LXMF propagation failed",
        }

        def succeeded_callback(_: object) -> None:
            outcome["succeeded"] = True
            outcome["error"] = ""
            completion.set()

        def failed_callback(_: object) -> None:
            outcome["succeeded"] = False
            outcome["error"] = (
                "LXMF propagation stamp generation failed"
                if bool(getattr(message, "stamp_generation_failed", False))
                else "LXMF propagation delivery failed"
            )
            completion.set()

        self.router.set_outbound_propagation_node(bytes.fromhex(node_hash))
        self._reset_propagation_message_for_attempt(message)
        message.register_delivery_callback(succeeded_callback)
        message.register_failed_callback(failed_callback)

        print(
            f"[friendlynode-lxmf:{self.identity_id}] propagation attempt "
            f"id={self._hex_value(getattr(message, 'hash', b''))} "
            f"node={node_hash} stamp_cost={stamp_cost}",
            flush=True,
        )

        try:
            self.router.handle_outbound(message)
        except Exception as exc:
            outcome["succeeded"] = False
            outcome["error"] = f"{type(exc).__name__}: {exc}"
            completion.set()

        completion.wait()
        self._wait_for_propagation_message_release(message)
        return bool(outcome["succeeded"]), str(outcome["error"])

    def _reset_propagation_message_for_attempt(self, message: object) -> None:
        if self.LXMF is None:
            raise RuntimeError("LXMF module is not loaded")

        message.delivery_attempts = 0
        message.progress = 0.0
        message.state = self.LXMF.LXMessage.GENERATING
        message.resource_representation = None
        message.set_delivery_destination(None)

        if hasattr(message, "next_delivery_attempt"):
            delattr(message, "next_delivery_attempt")

    def _wait_for_propagation_message_release(self, message: object) -> None:
        if self.router is None:
            return

        while not self._propagation_stop_event.is_set():
            in_outbound = message in self.router.pending_outbound
            in_deferred = message in self.router.pending_deferred_stamps.values()

            if not in_outbound and not in_deferred:
                return

            self.router.process_outbound()
            time.sleep(PROPAGATION_PENDING_POLL_SECONDS)

    def _emit_propagation_node_failed(
        self,
        job: PropagationSendJob,
        node_hash: str,
        error: str,
    ) -> None:
        payload = self._outbound_event_payload(
            job.message,
            local_message_id=job.local_message_id,
            contact_id=job.contact_id,
            state="node_failed",
            delivery_method=MESSAGE_DELIVERY_PROPAGATION,
            propagation_node_hash=node_hash,
        )
        payload["error"] = error
        self._emit_worker_event("lxmf.propagation_node_failed", payload)
        print(
            f"[friendlynode-lxmf:{self.identity_id}] propagation node failed "
            f"id={payload['message_id']} node={node_hash} error={error}",
            flush=True,
        )

    def _emit_final_propagation_failure(
        self,
        job: PropagationSendJob,
        error: str,
    ) -> None:
        payload = self._outbound_event_payload(
            job.message,
            local_message_id=job.local_message_id,
            contact_id=job.contact_id,
            state="failed",
            delivery_method=MESSAGE_DELIVERY_PROPAGATION,
            propagation_node_hash="",
        )
        payload["error"] = error
        self._emit_worker_event("lxmf.message_failed", payload)
        print(
            f"[friendlynode-lxmf:{self.identity_id}] message failed "
            f"destination={payload['destination_hash']} id={payload['message_id']} "
            f"mode={MESSAGE_DELIVERY_PROPAGATION} error={error}",
            flush=True,
        )
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
        self._propagation_stop_event.set()
        self._propagation_queue.put(PROPAGATION_QUEUE_STOP)

        if (
            self._propagation_thread is not None
            and self._propagation_thread is not threading.current_thread()
        ):
            self._propagation_thread.join(timeout=WORKER_WAIT_INTERVAL_SECONDS)

        self._propagation_thread = None

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
            "transient_id": self._hex_value(getattr(message, "transient_id", b"")),
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
                    raw_propagation_nodes = request.get("propagation_node_hashes")
                    propagation_node_hashes = (
                        [str(value or "") for value in raw_propagation_nodes]
                        if isinstance(raw_propagation_nodes, list)
                        else []
                    )
                    result = runtime.send_message(
                        str(request.get("destination_hash") or ""),
                        str(request.get("content") or ""),
                        title=str(request.get("title") or ""),
                        local_message_id=str(request.get("local_message_id") or ""),
                        contact_id=str(request.get("contact_id") or ""),
                        delivery_method=str(request.get("delivery_method") or MESSAGE_DELIVERY_DIRECT),
                        propagation_node_hashes=propagation_node_hashes,
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
