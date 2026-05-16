"""Controller-side engine supervisor."""

from __future__ import annotations

from pathlib import Path

from friendlynode.config.app_config import AppConfig
from friendlynode.engine.engine_main import EngineMain


class EngineSupervisor:
    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.engine: EngineMain | None = None

    def start(self) -> None:
        if self.engine is None:
            self.engine = EngineMain(self.config)

        self.engine.start()

    def stop(self) -> None:
        if self.engine is not None:
            self.engine.stop()
            self.engine = None

    def restart(self) -> None:
        self.stop()
        self.start()

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
