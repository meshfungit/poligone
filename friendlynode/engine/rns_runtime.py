"""Reticulum runtime boundary."""

from __future__ import annotations

import sys
import signal
import threading
from contextlib import contextmanager
from pathlib import Path
from types import ModuleType
from typing import Any

from friendlynode.engine.announce_handlers import DEFAULT_ANNOUNCE_ASPECTS, GenericAnnounceHandler
from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


STUB_RNS_VERSION = "stub-rns"
STUB_LXMF_VERSION = "stub-lxmf"


class StubIdentity:
    pass


class StubReticulum:
    def __init__(self, configdir: str | Path | None = None) -> None:
        self.configdir = configdir


class StubTransport:
    announce_handlers: list[Any] = []

    @classmethod
    def register_announce_handler(cls, handler: Any) -> None:
        cls.announce_handlers.append(handler)

    @classmethod
    def request_path(cls, destination_hash: bytes) -> None:
        return None


class StubRnsModule:
    __version__ = STUB_RNS_VERSION
    Identity = StubIdentity
    Reticulum = StubReticulum
    Transport = StubTransport


class StubLxmRouter:
    def __init__(self, identity: Any | None = None, storagepath: str | Path | None = None) -> None:
        self.identity = identity
        self.storagepath = storagepath
        self.delivery_callbacks: list[Any] = []

    def register_delivery_callback(self, callback: Any) -> None:
        self.delivery_callbacks.append(callback)


class StubLxMessage:
    def __init__(
        self,
        destination_hash: bytes,
        source_hash: bytes,
        content: str,
    ) -> None:
        self.destination_hash = destination_hash
        self.source_hash = source_hash
        self.content = content


class StubLxmfModule:
    __version__ = STUB_LXMF_VERSION
    LXMRouter = StubLxmRouter
    LXMessage = StubLxMessage


class RnsRuntime:
    def __init__(
        self,
        config_dir: Path,
        runtime_source_path: Path | None,
        bus: IpcBus,
    ) -> None:
        self.config_dir = config_dir
        self.runtime_source_path = runtime_source_path
        self.bus = bus

        self.RNS: ModuleType | type[StubRnsModule] | None = None
        self.LXMF: ModuleType | type[StubLxmfModule] | None = None
        self.reticulum: Any | None = None
        self.using_stubs = True

    def start(self) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)

        self.RNS, self.LXMF, self.using_stubs = self._load_modules()

        with self._reticulum_signal_context():
            self.reticulum = self.RNS.Reticulum(configdir=str(self.config_dir))

        for aspect in DEFAULT_ANNOUNCE_ASPECTS:
            handler = GenericAnnounceHandler(aspect, self.bus)
            self.RNS.Transport.register_announce_handler(handler)

        self.bus.publish(
            EngineEvent(
                "rns.started",
                {
                    "using_stubs": self.using_stubs,
                    "config_dir": str(self.config_dir),
                    "runtime_source_path": (
                        str(self.runtime_source_path)
                        if self.runtime_source_path is not None
                        else None
                    ),
                },
            )
        )

    def stop(self) -> None:
        self.reticulum = None
        self.bus.publish(EngineEvent("rns.stopped", {}))

    def status(self) -> dict[str, object]:
        return {
            "running": self.reticulum is not None,
            "using_stubs": self.using_stubs,
            "config_dir": str(self.config_dir),
            "runtime_source_path": (
                str(self.runtime_source_path) if self.runtime_source_path is not None else None
            ),
            "rns_version": getattr(self.RNS, "__version__", None) if self.RNS is not None else None,
            "lxmf_version": getattr(self.LXMF, "__version__", None) if self.LXMF is not None else None,
            "interfaces": self._interface_status(),
        }

    def _load_modules(
        self,
    ) -> tuple[ModuleType | type[StubRnsModule], ModuleType | type[StubLxmfModule], bool]:
        if self.runtime_source_path is not None and self.runtime_source_path.exists():
            sys.path.insert(0, str(self.runtime_source_path))
            self._unload_runtime_modules()

        try:
            import RNS

            rns_module: ModuleType | type[StubRnsModule] = RNS
            rns_stub = False
        except ImportError:
            rns_module = StubRnsModule
            rns_stub = True

        try:
            import LXMF

            lxmf_module: ModuleType | type[StubLxmfModule] = LXMF
            lxmf_stub = False
        except ImportError:
            lxmf_module = StubLxmfModule
            lxmf_stub = True

        return rns_module, lxmf_module, rns_stub or lxmf_stub

    def _unload_runtime_modules(self) -> None:
        for module_name in list(sys.modules):
            if module_name == "RNS" or module_name.startswith("RNS."):
                del sys.modules[module_name]

            if module_name == "LXMF" or module_name.startswith("LXMF."):
                del sys.modules[module_name]

    def _interface_status(self) -> list[dict[str, object]]:
        transport = getattr(self.RNS, "Transport", None) if self.RNS is not None else None
        interfaces = getattr(transport, "interfaces", []) if transport is not None else []
        result = []

        for interface in interfaces:
            result.append(
                {
                    "name": str(getattr(interface, "name", type(interface).__name__)),
                    "type": type(interface).__name__,
                    "online": bool(getattr(interface, "online", False)),
                    "in": bool(getattr(interface, "IN", False)),
                    "out": bool(getattr(interface, "OUT", False)),
                    "mode": int(getattr(interface, "mode", 0) or 0),
                    "bind_ip": str(getattr(interface, "bind_ip", "")),
                    "bind_port": str(getattr(interface, "bind_port", "")),
                    "target_host": str(getattr(interface, "target_ip", "")),
                    "target_port": str(getattr(interface, "target_port", "")),
                }
            )

        return result

    @contextmanager
    def _reticulum_signal_context(self):
        if threading.current_thread() is threading.main_thread():
            yield
            return

        original_signal = signal.signal

        def ignore_thread_signal(signalnum, handler):
            return None

        signal.signal = ignore_thread_signal

        try:
            yield
        finally:
            signal.signal = original_signal
