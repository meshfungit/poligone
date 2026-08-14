"""Lifecycle manager for isolated LXMF worker processes."""

from __future__ import annotations

import os
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path

from friendlynode.config.app_config import AppConfig
from friendlynode.local_identities import LocalIdentity, LocalIdentityStore

LXMF_WORKER_MODULE = "friendlynode.engine.lxmf_worker"
LXMF_WORKER_STOP_COMMAND = "stop\n"
LXMF_WORKER_STOP_TIMEOUT_SECONDS = 5.0
LXMF_WORKER_TERMINATE_TIMEOUT_SECONDS = 2.0
PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(slots=True)
class LxmfWorkerProcess:
    identity_id: str
    process: subprocess.Popen[str]
    started_at: float


class LxmfProcessManager:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.identity_store = LocalIdentityStore(config.local_identities_dir)
        self._workers: dict[str, LxmfWorkerProcess] = {}

    def start(self, identity_id: str) -> dict[str, object]:
        identity = self._get_identity(identity_id)
        existing = self._workers.get(identity.id)

        if existing is not None and existing.process.poll() is None:
            return self._worker_status(existing)

        if existing is not None:
            self._workers.pop(identity.id, None)

        command = self._build_command(identity.id)
        process = subprocess.Popen(
            command,
            cwd=str(PROJECT_ROOT),
            env=self._build_environment(),
            stdin=subprocess.PIPE,
            text=True,
            encoding="utf-8",
        )
        worker = LxmfWorkerProcess(
            identity_id=identity.id,
            process=process,
            started_at=time.time(),
        )
        self._workers[identity.id] = worker

        return self._worker_status(worker)

    def stop(self, identity_id: str) -> None:
        worker = self._workers.get(identity_id)

        if worker is None:
            return

        process = worker.process

        if process.poll() is None:
            self._request_graceful_stop(process)

            try:
                process.wait(timeout=LXMF_WORKER_STOP_TIMEOUT_SECONDS)
            except subprocess.TimeoutExpired:
                process.terminate()

                try:
                    process.wait(timeout=LXMF_WORKER_TERMINATE_TIMEOUT_SECONDS)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()

        self._close_stdin(process)
        self._workers.pop(identity_id, None)

    def restart(self, identity_id: str) -> dict[str, object]:
        self.stop(identity_id)
        return self.start(identity_id)

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

    def _build_command(self, identity_id: str) -> list[str]:
        python_path = str(self.config.runtime_python or Path(sys.executable))
        command = [
            python_path,
            "-m",
            LXMF_WORKER_MODULE,
            "--identity-id",
            identity_id,
            "--identities-dir",
            str(self.config.local_identities_dir),
            "--rns-config-dir",
            str(self.config.rns_config_dir),
        ]

        if self.config.runtime_source_path is not None:
            command.extend(["--rns-source-path", str(self.config.runtime_source_path)])

        if self.config.lxmf_source_path is not None:
            command.extend(["--lxmf-source-path", str(self.config.lxmf_source_path)])

        return command

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
        ready = (
            running
            and identity.identity_hash != ""
            and identity.lxmf_destination_hash != ""
        )

        return {
            "identity_id": worker.identity_id,
            "pid": worker.process.pid,
            "running": running,
            "ready": ready,
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

    def _request_graceful_stop(self, process: subprocess.Popen[str]) -> None:
        if process.stdin is None:
            return

        try:
            process.stdin.write(LXMF_WORKER_STOP_COMMAND)
            process.stdin.flush()
        except (BrokenPipeError, OSError, ValueError):
            return

    def _close_stdin(self, process: subprocess.Popen[str]) -> None:
        if process.stdin is None:
            return

        try:
            process.stdin.close()
        except (OSError, ValueError):
            return
