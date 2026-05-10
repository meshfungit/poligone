"""Custom Reticulum interface module discovery."""

from dataclasses import dataclass
from pathlib import Path

from friendlynode.config.defaults import CUSTOM_INTERFACES_DIR


@dataclass(slots=True)
class CustomInterfaceModule:
    name: str
    path: Path


class InterfaceModuleLoader:
    def __init__(self, modules_dir: Path = CUSTOM_INTERFACES_DIR) -> None:
        self.modules_dir = modules_dir

    def list_modules(self) -> list[CustomInterfaceModule]:
        self.modules_dir.mkdir(parents=True, exist_ok=True)
        return [
            CustomInterfaceModule(name=path.stem, path=path)
            for path in sorted(self.modules_dir.glob("*.py"))
            if not path.name.startswith("_")
        ]
