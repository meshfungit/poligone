"""Engine process entry point."""

from friendlynode.config.app_config import AppConfig
from friendlynode.engine.ipc import IpcBus
from friendlynode.engine.rns_runtime import RnsRuntime


class EngineMain:
    def __init__(self, config: AppConfig | None = None) -> None:
        self.config = config or AppConfig()
        self.bus = IpcBus()
        self.rns_runtime = RnsRuntime(
            config_dir=self.config.rns_config_dir,
            runtime_source_path=self.config.runtime_source_path,
            bus=self.bus,
        )

    def start(self) -> None:
        self.config.ensure_dirs()
        self.rns_runtime.start()

    def stop(self) -> None:
        self.rns_runtime.stop()

    def make_announce(
        self,
        *,
        target: str = "transport",
        interface_name: str | None = None,
    ) -> dict[str, object]:
        return self.rns_runtime.make_announce(
            target=target,
            interface_name=interface_name,
        )


def main() -> None:
    engine = EngineMain()
    engine.start()
    print("FriendlyNode engine stub started")


if __name__ == "__main__":
    main()
