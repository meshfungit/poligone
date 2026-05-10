"""Stub Reticulum config writer."""

from pathlib import Path


class RnsConfigWriter:
    def __init__(self, config_dir: Path) -> None:
        self.config_dir = config_dir

    def write_minimal_config(self) -> Path:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        config_path = self.config_dir / "config"
        if not config_path.exists():
            config_path.write_text(
                "[reticulum]\n"
                "enable_transport = no\n"
                "share_instance = no\n\n"
                "[interfaces]\n",
                encoding="utf-8",
            )
        return config_path
