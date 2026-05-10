"""Reticulum/LXMF module loader with local stubs fallback."""

from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass
from pathlib import Path
from types import ModuleType


@dataclass(slots=True)
class ReticulumModules:
    RNS: ModuleType
    LXMF: ModuleType
    using_stubs: bool


def _import_module_or_stub(module_name: str, stub_module_name: str) -> tuple[ModuleType, bool]:
    try:
        return importlib.import_module(module_name), False
    except ImportError:
        return importlib.import_module(stub_module_name), True


def load_reticulum_modules(runtime_source_path: Path | None = None) -> ReticulumModules:
    if runtime_source_path is not None:
        runtime_path = str(runtime_source_path.resolve())
        if runtime_path not in sys.path:
            sys.path.insert(0, runtime_path)

    rns, rns_stub = _import_module_or_stub("RNS", "friendlynode.reticulum_compat.stubs.rns")
    lxmf, lxmf_stub = _import_module_or_stub("LXMF", "friendlynode.reticulum_compat.stubs.lxmf")
    return ReticulumModules(RNS=rns, LXMF=lxmf, using_stubs=rns_stub or lxmf_stub)
