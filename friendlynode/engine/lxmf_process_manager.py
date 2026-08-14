"""Lifecycle manager for isolated LXMF worker processes."""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from friendlynode.config.app_config import AppConfig
from friendlynode.engine.events import EngineEvent
from friendlynode.local_identities import LocalIdentity, LocalIdentityStore

LXMF_WORKER_MODULE = "friendlynode.engine.lxmf_worker"
LXMF_WORKER_EVENT_PREFIX = "FN_LXMF_EVENT "
LXMF_IDENTITY_GENERATOR_MODULE = "friendlynode.engine.lxmf_identity_generator"
DEFAULT_CONTROL_HOST = "127.0.0.1"
LXMF_WORKER_STOP_COMMAND = b"stop\n"
LXMF_WORKER_STATUS_COMMAND = b"status\n"
LXMF_WORKER_ANNOUNCE_COMMAND = b"announce\n"
LXMF_WORKER_SEND_COMMAND = "send"
LXMF_WORKER_READY_RESPONSE = "ready"
LXMF_WORKER_ANNOUNCED_RESPONSE = "announced"
LXMF_WORKER_CONTROL_CONNECT_TIMEOUT_SECONDS = 0.25
LXMF_WORKER_CONTROL_RETRY_SECONDS = 0.1
LXMF_WORKER_CONTROL_REQUEST_TIMEOUT_SECONDS = 1.0
LXMF_WORKER_SEND_TIMEOUT_SECONDS = 7.0
LXMF_WORKER_CONTROL_RECEIVE_SIZE = 4096
LXMF_WORKER_STOP_TIMEOUT_SECONDS = 5.0
LXMF_WORKER_TERMINATE_TIMEOUT_SECONDS = 2.0
LXMF_IDENTITY_GENERATE_TIMEOUT_SECONDS = 15.0
PROJECT_ROOT = Path(__file__).resolve().parents[2]
LxmfEventSink = Callable[[EngineEvent], None]


@dataclass(slots=True)
class LxmfWorkerProcess:
    identity_id: str
    process: subprocess.Popen[str]
    started_at: float
    control_host: str
    control_port: int
    output_thread: threading.Thread | None = None


class LxmfProcessManager:
    def __init__(self, config: AppConfig, event_sink: LxmfEventSink | None = None) -> None:
        self.config = config
        self.event_sink = event_sink
        self.identity_store = LocalIdentityStore(config.local_identities_dir)
        self._workers: dict[str, LxmfWorkerProcess] = {}

    def start(self, identity_id: str) -> dict[str, object]:
        identity = self._get_identity(identity_id)
        existing = self._workers.get(identity.id)

        if existing is not None and existing.process.poll() is None:
            return self._worker_status(existing)

        if existing is not None:
            self._workers.pop(identity.id, None)

        control_host = DEFAULT_CONTROL_HOST
        control_port = self._allocate_control_port(control_host)
        command = self._build_worker_command(identity.id, control_host, control_port)
        process = subprocess.Popen(
            command,
            cwd=str(PROJECT_ROOT),
            env=self._build_environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
        worker = LxmfWorkerProcess(
            identity_id=identity.id,
            process=process,
            started_at=time.time(),
            control_host=control_host,
            control_port=control_port,
        )
        self._workers[identity.id] = worker
        worker.output_thread = threading.Thread(
            target=self._read_worker_output,
            args=(worker,),
            name=f"friendlynode-lxmf-output-{identity.id}",
            daemon=True,
        )
        worker.output_thread.start()
        return self._worker_status(worker)

    def stop(self, identity_id: str) -> None:
        worker = self._workers.get(identity_id)

        if worker is None:
            return

        process = worker.process

        if process.poll() is None:
            self._request_graceful_stop(worker)

            try:
                process.wait(timeout=LXMF_WORKER_STOP_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                process.terminate()

                try:
                    process.wait(timeout=LXMF_WORKER_TERMINATE_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

        self._workers.pop(identity_id, None)

    def restart(self, identity_id: str) -> dict[str, object]:
        self.stop(identity_id)
        return self.start(identity_id)

    def announce(self, identity_id: str) -> dict[str, object]:
        worker = self._workers.get(identity_id)

        if worker is None or worker.process.poll() is not None:
            raise RuntimeError(f"LXMF worker is not running: {identity_id}")

        response = self._send_control_command(worker, LXMF_WORKER_ANNOUNCE_COMMAND)

        if response != LXMF_WORKER_ANNOUNCED_RESPONSE:
            raise RuntimeError(f"LXMF announce failed for {identity_id}: {response or 'no response'}")

        identity = self._get_identity(identity_id)
        return {
            "identity_id": identity_id,
            "announced": True,
            "destination_hash": identity.lxmf_destination_hash,
        }

    def send_message(
        self,
        identity_id: str,
        destination_hash: str,
        content: str,
        *,
        local_message_id: str,
        contact_id: str,
        title: str = "",
    ) -> dict[str, object]:
        worker = self._workers.get(identity_id)

        if worker is None or worker.process.poll() is not None:
            raise RuntimeError(f"LXMF worker is not running: {identity_id}")

        request = {
            "command": LXMF_WORKER_SEND_COMMAND,
            "destination_hash": destination_hash,
            "content": content,
            "title": title,
            "local_message_id": local_message_id,
            "contact_id": contact_id,
        }
        response = self._send_control_json(worker, request, timeout=LXMF_WORKER_SEND_TIMEOUT_SECONDS)

        if response.get("status") != "queued":
            message = str(response.get("message") or response.get("error") or "unknown LXMF worker error")
            raise RuntimeError(f"LXMF send failed for {identity_id}: {message}")

        return response

    def stop_all(self) -> None:
        for identity_id in list(self._workers):
            self.stop(identity_id)

    def running_identity_ids(self) -> list[str]:
        return [
            identity_id
            for identity_id, worker in self._workers.items()
            if worker.process.poll() is None
        ]

    def status(self) -> list[dict[str, object]]:
        return [
            self._worker_status(worker)
            for worker in self._workers.values()
        ]

    def generate_identity(self, identity_id: str) -> dict[str, object]:
        identity = self._get_identity(identity_id)
        command = self._build_identity_generator_command(identity.id)
        result = subprocess.run(
            command,
            cwd=str(PROJECT_ROOT),
            env=self._build_environment(),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=LXMF_IDENTITY_GENERATE_TIMEOUT_SECONDS,
        )

        if result.returncode != 0:
            stdout = result.stdout.decode("utf-8", errors="replace").strip()
            stderr = result.stderr.decode("utf-8", errors="replace").strip()
            details = stderr or stdout or f"exit code {result.returncode}"
            raise RuntimeError(f"Identity generation failed: {details}")

        return self._get_identity(identity.id).to_dict()

    def _build_worker_command(self, identity_id: str, control_host: str, control_port: int) -> list[str]:
        command = [
            self._runtime_python_path(),
            "-m",
            LXMF_WORKER_MODULE,
            "--identity-id",
            identity_id,
            "--identities-dir",
            str(self.config.local_identities_dir),
            "--rns-config-dir",
            str(self.config.rns_config_dir),
            "--control-host",
            control_host,
            "--control-port",
            str(control_port),
        ]
        self._append_runtime_source_arguments(command)
        return command

    def _build_identity_generator_command(self, identity_id: str) -> list[str]:
        command = [
            self._runtime_python_path(),
            "-m",
            LXMF_IDENTITY_GENERATOR_MODULE,
            "--identity-id",
            identity_id,
            "--identities-dir",
            str(self.config.local_identities_dir),
        ]
        self._append_runtime_source_arguments(command)
        return command

    def _append_runtime_source_arguments(self, command: list[str]) -> None:
        if self.config.runtime_source_path is not None:
            command.extend(["--rns-source-path", str(self.config.runtime_source_path)])

        if self.config.lxmf_source_path is not None:
            command.extend(["--lxmf-source-path", str(self.config.lxmf_source_path)])

    def _runtime_python_path(self) -> str:
        return str(self.config.runtime_python or Path(sys.executable))

    def _build_environment(self) -> dict[str, str]:
        environment = dict(os.environ)
        existing_pythonpath = environment.get("PYTHONPATH", "")
        pythonpath_items = [str(PROJECT_ROOT)]

        if existing_pythonpath != "":
            pythonpath_items.append(existing_pythonpath)

        environment["PYTHONPATH"] = os.pathsep.join(pythonpath_items)
        return environment

    def _get_identity(self, identity_id: str) -> LocalIdentity:
        for identity in self.identity_store.list_identities():
            if identity.id == identity_id:
                return identity

        raise ValueError(f"Local identity does not exist: {identity_id}")

    def _worker_status(self, worker: LxmfWorkerProcess) -> dict[str, object]:
        exit_code = worker.process.poll()
        identity = self._get_identity(worker.identity_id)
        running = exit_code is None
        worker_state = self._query_worker_state(worker) if running else "stopped"
        ready = running and worker_state == LXMF_WORKER_READY_RESPONSE

        return {
            "identity_id": worker.identity_id,
            "pid": worker.process.pid,
            "running": running,
            "ready": ready,
            "state": worker_state,
            "started_at": worker.started_at,
            "exit_code": exit_code,
            "identity_hash": identity.identity_hash,
            "destination_hash": identity.lxmf_destination_hash,
            "last_error": (
                ""
                if running
                else f"LXMF worker exited with code {exit_code}"
            ),
        }

    def _read_worker_output(self, worker: LxmfWorkerProcess) -> None:
        stream = worker.process.stdout

        if stream is None:
            return

        for line in stream:
            if line.startswith(LXMF_WORKER_EVENT_PREFIX):
                self._handle_worker_event(worker, line[len(LXMF_WORKER_EVENT_PREFIX):].strip())
                continue

            print(line, end="", flush=True)

    def _handle_worker_event(self, worker: LxmfWorkerProcess, raw_event: str) -> None:
        if self.event_sink is None:
            return

        try:
            event_data = json.loads(raw_event)
            topic = str(event_data.get("topic") or "").strip()
            payload = event_data.get("payload")

            if topic == "" or not isinstance(payload, dict):
                raise ValueError("Invalid LXMF worker event")

            payload.setdefault("identity_id", worker.identity_id)
            self.event_sink(EngineEvent(topic, payload))
        except Exception as exc:
            print(
                f"[friendlynode-lxmf:{worker.identity_id}] event decode failed: "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )

    def _allocate_control_port(self, control_host: str) -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as server:
            server.bind((control_host, 0))
            return int(server.getsockname()[1])

    def _request_graceful_stop(self, worker: LxmfWorkerProcess) -> None:
        deadline = time.monotonic() + LXMF_WORKER_CONTROL_REQUEST_TIMEOUT_SECONDS

        while worker.process.poll() is None and time.monotonic() < deadline:
            try:
                self._send_control_command(worker, LXMF_WORKER_STOP_COMMAND)
                return
            except OSError:
                time.sleep(LXMF_WORKER_CONTROL_RETRY_SECONDS)

    def _query_worker_state(self, worker: LxmfWorkerProcess) -> str:
        try:
            response = self._send_control_command(worker, LXMF_WORKER_STATUS_COMMAND)
        except OSError:
            return "starting"

        return response or "starting"

    def _send_control_json(
        self,
        worker: LxmfWorkerProcess,
        payload: dict[str, object],
        *,
        timeout: float,
    ) -> dict[str, object]:
        request = (json.dumps(payload, separators=(",", ":")) + "\n").encode("utf-8")

        with socket.create_connection(
            (worker.control_host, worker.control_port),
            timeout=LXMF_WORKER_CONTROL_CONNECT_TIMEOUT_SECONDS,
        ) as connection:
            connection.settimeout(timeout)
            connection.sendall(request)
            response = connection.recv(LXMF_WORKER_CONTROL_RECEIVE_SIZE)

        decoded = json.loads(response.decode("utf-8", errors="strict").strip())

        if not isinstance(decoded, dict):
            raise RuntimeError("LXMF worker returned an invalid response")

        return decoded

    def _send_control_command(self, worker: LxmfWorkerProcess, command: bytes) -> str:
        with socket.create_connection(
            (worker.control_host, worker.control_port),
            timeout=LXMF_WORKER_CONTROL_CONNECT_TIMEOUT_SECONDS,
        ) as connection:
            connection.settimeout(LXMF_WORKER_CONTROL_CONNECT_TIMEOUT_SECONDS)
            connection.sendall(command)
            response = connection.recv(LXMF_WORKER_CONTROL_RECEIVE_SIZE)
            return response.decode("utf-8", errors="replace").strip().lower()
