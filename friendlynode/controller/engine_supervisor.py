"""Controller-side engine supervisor."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

from friendlynode.config.app_config import AppConfig
from friendlynode.engine.engine_main import EngineMain
from friendlynode.engine.events import EngineEvent


EngineEventSink = Callable[[EngineEvent], None]


class EngineSupervisor:
    def __init__(self, config: AppConfig, event_sink: EngineEventSink | None = None) -> None:
        self.config = config
        self.event_sink = event_sink
        self.engine: EngineMain | None = None

    def start(self) -> None:
        if self.engine is None:
            self.engine = EngineMain(self.config)

            if self.event_sink is not None:
                self.engine.bus.subscribe(self.event_sink)

        self.engine.start()

    def stop(self) -> None:
        if self.engine is not None:
            self.engine.stop()
            self.engine = None

    def restart(self) -> None:
        self.stop()
        self.start()

    def restart_reticulum(self) -> None:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        running_identity_ids = self.engine.running_lxmf_identity_ids()
        self.engine.stop()
        self.engine = EngineMain(self.config)

        if self.event_sink is not None:
            self.engine.bus.subscribe(self.event_sink)

        self.engine.start(start_lxmf_workers=False)

        for identity_id in running_identity_ids:
            self.engine.start_lxmf_worker(identity_id)

    def start_lxmf_worker(self, identity_id: str) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.start_lxmf_worker(identity_id)

    def generate_lxmf_identity(self, identity_id: str) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.generate_lxmf_identity(identity_id)

    def stop_lxmf_worker(self, identity_id: str) -> None:
        if self.engine is None:
            return

        self.engine.stop_lxmf_worker(identity_id)

    def restart_lxmf_worker(self, identity_id: str) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.restart_lxmf_worker(identity_id)

    def announce_lxmf_worker(self, identity_id: str) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.announce_lxmf_worker(identity_id)

    def send_lxmf_message(
        self,
        identity_id: str,
        destination_hash: str,
        content: str,
        *,
        local_message_id: str,
        contact_id: str,
        title: str = "",
    ) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.send_lxmf_message(
            identity_id,
            destination_hash,
            content,
            local_message_id=local_message_id,
            contact_id=contact_id,
            title=title,
        )


    def make_announce(
        self,
        *,
        target: str = "transport",
        interface_name: str | None = None,
    ) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.make_announce(
            target=target,
            interface_name=interface_name,
        )

    def fetch_nomadnet_page(
        self,
        destination_hash: str,
        path: str,
        discovery_hints: dict[str, object] | None = None,
        request_data: dict[str, object] | None = None,
    ) -> dict[str, object]:
        if self.engine is None:
            raise RuntimeError("Engine is not running")

        return self.engine.fetch_nomadnet_page(
            destination_hash,
            path,
            discovery_hints=discovery_hints or {},
            request_data=request_data or {},
        )

    def status(self) -> dict[str, object]:
        runtime_status = self._runtime_status()

        if self.engine is None:
            return {
                "running": False,
                "runtime": runtime_status,
            }

        return {
            "running": True,
            "runtime": runtime_status,
            "rns": self.engine.rns_runtime.status(),
            "nomadnet": self.engine.nomadnet_status(),
            "lxmf_client": self.engine.lxmf_client_status(),
        }

    def _runtime_status(self) -> dict[str, object]:
        return {
            "name": self.config.engine_name,
            "python_path": self._path_to_string(self.config.runtime_python),
            "source_path": self._path_to_string(self.config.runtime_source_path),
        }

    def _path_to_string(self, path: Path | None) -> str | None:
        if path is None:
            return None

        return str(path)
