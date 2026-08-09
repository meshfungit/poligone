"""Reticulum runtime boundary."""

from __future__ import annotations

import sys
import signal
import threading
import time
from contextlib import contextmanager
from pathlib import Path
from types import ModuleType
from typing import Any

from friendlynode.config.rns_config_editor import load_rns_config
from friendlynode.engine.announce_handlers import DEFAULT_ANNOUNCE_ASPECTS, GenericAnnounceHandler
from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


STUB_RNS_VERSION = "stub-rns"
STUB_LXMF_VERSION = "stub-lxmf"
ANNOUNCE_MONITOR_INTERVAL_SECONDS = 2.0
DEFAULT_ANNOUNCE_MIN_INTERVAL_SECONDS = 15
MIN_ANNOUNCE_MIN_INTERVAL_SECONDS = 5

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
        lxmf_enabled: bool = False,
        lxmf_source_path: Path | None = None,
    ) -> None:
        self.config_dir = config_dir
        self.runtime_source_path = runtime_source_path
        self.bus = bus
        self.lxmf_enabled = lxmf_enabled
        self.lxmf_source_path = lxmf_source_path

        self.RNS: ModuleType | type[StubRnsModule] | None = None
        self.LXMF: ModuleType | type[StubLxmfModule] | None = None
        self.reticulum: Any | None = None
        self.using_stubs = True
        self.rns_using_stub = True
        self.lxmf_using_stub = True
        self._announce_stop = threading.Event()
        self._announce_thread: threading.Thread | None = None
        self._interface_signatures: dict[str, tuple[object, ...]] = {}
        self._interface_announce_last: dict[str, float] = {}
        self._interface_announce_reason: dict[str, str] = {}
        self._last_announce_reason = ""
        self._last_announce_at: float | None = None

    def start(self) -> None:
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self._announce_stop = threading.Event()
        self._interface_signatures = {}
        self._interface_announce_last = {}
        self._interface_announce_reason = {}

        self.RNS, self.LXMF, self.using_stubs = self._load_modules()

        with self._reticulum_signal_context():
            self.reticulum = self.RNS.Reticulum(configdir=str(self.config_dir))

        for aspect in DEFAULT_ANNOUNCE_ASPECTS:
            handler = GenericAnnounceHandler(aspect, self.bus)
            self.RNS.Transport.register_announce_handler(handler)

        self.RNS.Transport.register_announce_handler(GenericAnnounceHandler(None, self.bus))

        self.bus.publish(
            EngineEvent(
                "rns.started",
                {
                    "using_stubs": self.using_stubs,
                    "rns_using_stub": self.rns_using_stub,
                    "lxmf_using_stub": self.lxmf_using_stub,
                    "config_dir": str(self.config_dir),
                    "runtime_source_path": (
                        str(self.runtime_source_path)
                        if self.runtime_source_path is not None
                        else None
                    ),
                    "lxmf_source_path": (
                        str(self.lxmf_source_path)
                        if self.lxmf_source_path is not None
                        else None
                    ),
                },
            )
        )
        self._start_announce_monitor()

    def stop(self) -> None:
        self._stop_announce_monitor()

        if self.RNS is not None and getattr(self.RNS, "__version__", None) != STUB_RNS_VERSION:
            transport = getattr(self.RNS, "Transport", None)

            detach_interfaces = getattr(transport, "detach_interfaces", None)
            if callable(detach_interfaces):
                try:
                    detach_interfaces()
                    print("[friendlynode] Reticulum stop: interfaces detached", flush=True)
                except Exception as exc:
                    print(
                        f"[friendlynode] Reticulum stop: detach_interfaces failed: {type(exc).__name__}: {exc}",
                        flush=True,
                    )

            reticulum_class = getattr(self.RNS, "Reticulum", None)
            exit_handler = getattr(reticulum_class, "exit_handler", None)
            if callable(exit_handler):
                try:
                    exit_handler()
                    print("[friendlynode] Reticulum stop: exit_handler completed", flush=True)
                except Exception as exc:
                    print(
                        f"[friendlynode] Reticulum stop: exit_handler failed: {type(exc).__name__}: {exc}",
                        flush=True,
                    )

        self.reticulum = None
        self.RNS = None
        self.LXMF = None
        self.using_stubs = True
        self.rns_using_stub = True
        self.lxmf_using_stub = True

        self._unload_runtime_modules()
        self.bus.publish(EngineEvent("rns.stopped", {}))

    def status(self) -> dict[str, object]:
        return {
            "running": self.reticulum is not None,
            "using_stubs": self.using_stubs,
            "config_dir": str(self.config_dir),
            "runtime_source_path": (
                str(self.runtime_source_path) if self.runtime_source_path is not None else None
            ),
            "lxmf_source_path": (
                str(self.lxmf_source_path) if self.lxmf_source_path is not None else None
            ),
            "rns_version": getattr(self.RNS, "__version__", None) if self.RNS is not None else None,
            "lxmf_enabled": self.lxmf_enabled,
            "lxmf_loaded": self.LXMF is not None and not self.lxmf_using_stub,
            "lxmf_version": getattr(self.LXMF, "__version__", None) if self.LXMF is not None else None,
            "interfaces": self._interface_status(),
            "announce": self.announce_status(),
        }

    def make_announce(
        self,
        *,
        target: str = "transport",
        interface_name: str | None = None,
    ) -> dict[str, object]:
        if target == "client":
            return {
                "status": "unsupported",
                "target": target,
                "message": "Client announce requires a real local LXMF destination; it is not wired yet.",
            }

        if target not in ("transport", "all"):
            raise ValueError(f"Unsupported announce target: {target}")

        destinations = self._transport_announce_destinations()
        interfaces = self._select_announce_interfaces(interface_name)
        now = time.time()
        sent = 0
        errors = []

        for interface in interfaces:
            interface_sent = 0

            for destination in destinations:
                try:
                    destination.announce(attached_interface=interface)
                    sent += 1
                    interface_sent += 1
                except Exception as exc:
                    errors.append(
                        {
                            "interface": self._interface_display_name(interface),
                            "destination": str(destination),
                            "error": str(exc),
                        }
                    )

            if interface_sent > 0:
                self._record_interface_announce(interface, now, "manual")

        if sent > 0:
            self._last_announce_at = now
            self._last_announce_reason = "manual"

        return {
            "status": "ok" if len(errors) == 0 else "partial",
            "target": target,
            "interface_filter": interface_name or "",
            "interfaces": [self._interface_display_name(interface) for interface in interfaces],
            "destination_count": len(destinations),
            "sent": sent,
            "errors": errors,
            "announced_at": now if sent > 0 else None,
        }

    def announce_status(self) -> dict[str, object]:
        destinations = self._transport_announce_destinations()
        return {
            "transport_destination_count": len(destinations),
            "last_announce_at": self._last_announce_at,
            "last_announce_reason": self._last_announce_reason,
            "interfaces": self._configured_interface_announce_status(),
            "client_supported": False,
        }

    def _load_modules(
        self,
    ) -> tuple[
        ModuleType | type[StubRnsModule],
        ModuleType | type[StubLxmfModule] | None,
        bool,
    ]:
        self._unload_runtime_modules()

        if self.runtime_source_path is not None and self.runtime_source_path.exists():
            runtime_source = str(self.runtime_source_path)
            if runtime_source not in sys.path:
                sys.path.insert(0, runtime_source)

        try:
            import RNS

            rns_module: ModuleType | type[StubRnsModule] = RNS
            rns_stub = False
        except ImportError:
            rns_module = StubRnsModule
            rns_stub = True

        if not self.lxmf_enabled:
            self.rns_using_stub = rns_stub
            self.lxmf_using_stub = False
            return rns_module, None, rns_stub

        if self.lxmf_source_path is None or not self.lxmf_source_path.exists():
            self.rns_using_stub = rns_stub
            self.lxmf_using_stub = True
            return rns_module, StubLxmfModule, True

        lxmf_source = str(self.lxmf_source_path)

        if lxmf_source not in sys.path:
            sys.path.insert(0, lxmf_source)

        try:
            import LXMF

            lxmf_module: ModuleType | type[StubLxmfModule] = LXMF
            lxmf_stub = False
        except ImportError:
            lxmf_module = StubLxmfModule
            lxmf_stub = True

        self.rns_using_stub = rns_stub
        self.lxmf_using_stub = lxmf_stub
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
                    "display_name": self._interface_display_name(interface),
                    "parent_name": self._parent_interface_name(interface),
                    "type": type(interface).__name__,
                    "online": bool(getattr(interface, "online", False)),
                    "in": bool(getattr(interface, "IN", False)),
                    "out": bool(getattr(interface, "OUT", False)),
                    "mode": int(getattr(interface, "mode", 0) or 0),
                    "bind_ip": str(getattr(interface, "bind_ip", "")),
                    "bind_port": str(getattr(interface, "bind_port", "")),
                    "target_host": str(getattr(interface, "target_ip", "")),
                    "target_port": str(getattr(interface, "target_port", "")),
                    "clients": self._interface_client_count(interface),
                    "last_announce_at": self._interface_last_announce_at(interface),
                }
            )

        return result

    def _start_announce_monitor(self) -> None:
        if self.RNS is None or getattr(self.RNS, "__version__", None) == STUB_RNS_VERSION:
            return

        self._announce_thread = threading.Thread(
            target=self._announce_monitor_loop,
            name="friendlynode-announce-monitor",
            daemon=True,
        )
        self._announce_thread.start()

    def _stop_announce_monitor(self) -> None:
        self._announce_stop.set()

        if self._announce_thread is not None and self._announce_thread.is_alive():
            self._announce_thread.join(timeout=2)

        self._announce_thread = None

    def _announce_monitor_loop(self) -> None:
        while not self._announce_stop.is_set():
            try:
                self._announce_changed_interfaces()
            except Exception as exc:
                self.bus.publish(
                    EngineEvent(
                        "announce.auto_error",
                        {
                            "exception": type(exc).__name__,
                            "message": str(exc),
                        },
                    )
                )

            self._announce_stop.wait(ANNOUNCE_MONITOR_INTERVAL_SECONDS)

    def _announce_changed_interfaces(self) -> None:
        destinations = self._transport_announce_destinations()

        if len(destinations) == 0:
            return

        now = time.time()

        for interface in self._select_announce_interfaces(None):
            key = self._interface_key(interface)
            signature = self._interface_connection_signature(interface)
            previous = self._interface_signatures.get(key)
            self._interface_signatures[key] = signature

            if previous is not None and previous == signature:
                continue

            interval = self._announce_interval_for_interface(interface)
            last_announce = self._interface_announce_last.get(key, 0)

            if now - last_announce < interval:
                continue

            sent = 0

            for destination in destinations:
                destination.announce(attached_interface=interface)
                sent += 1

            if sent > 0:
                reason = "connection_changed" if previous is not None else "start"
                self._record_interface_announce(interface, now, reason)
                self._last_announce_at = now
                self._last_announce_reason = reason
                self.bus.publish(
                    EngineEvent(
                        "announce.auto",
                        {
                            "interface": self._interface_display_name(interface),
                            "reason": reason,
                            "destination_count": sent,
                        },
                    )
                )

    def _transport_announce_destinations(self) -> list[Any]:
        transport = getattr(self.RNS, "Transport", None) if self.RNS is not None else None

        if transport is None:
            return []

        destinations = getattr(transport, "mgmt_destinations", [])

        if not isinstance(destinations, list):
            return []

        return [destination for destination in destinations if hasattr(destination, "announce")]

    def _select_announce_interfaces(self, interface_name: str | None) -> list[Any]:
        transport = getattr(self.RNS, "Transport", None) if self.RNS is not None else None
        interfaces = getattr(transport, "interfaces", []) if transport is not None else []
        selected = []

        for interface in interfaces:
            if not self._interface_can_send_announce(interface):
                continue

            if interface_name is None or self._interface_matches(interface, interface_name):
                selected.append(interface)

        return selected

    def _interface_can_send_announce(self, interface: Any) -> bool:
        if not bool(getattr(interface, "online", False)):
            return False

        if not bool(getattr(interface, "OUT", False)):
            return False

        if type(interface).__name__ == "TCPServerInterface":
            return False

        return True

    def _interface_matches(self, interface: Any, interface_name: str) -> bool:
        candidates = {
            str(interface),
            str(getattr(interface, "name", "")),
            self._interface_display_name(interface),
            self._parent_interface_name(interface),
        }
        return interface_name in candidates

    def _configured_interface_announce_status(self) -> list[dict[str, object]]:
        now = time.time()
        configured = self._configured_enabled_interfaces()
        live_interfaces = self._live_interfaces()
        result = []

        for item in configured:
            name = str(item.get("name") or "")
            matching = [
                interface
                for interface in live_interfaces
                if str(getattr(interface, "name", "")) == name
                or self._parent_interface_name(interface) == name
            ]
            leafs = [
                interface
                for interface in matching
                if self._interface_can_send_announce(interface)
            ]
            online = any(bool(getattr(interface, "online", False)) for interface in matching)
            last_announce = self._recorded_configured_announce_at(name, leafs)
            interval = self._normalise_announce_interval(item.get("announce_interval"))
            age = None if last_announce is None else max(now - last_announce, 0)
            next_announce = self._next_announce_in(
                age=age,
                interval=interval,
                target_count=len(leafs),
            )

            result.append(
                {
                    "name": name,
                    "type": str(item.get("type") or ""),
                    "enabled": True,
                    "online": online,
                    "status": "Up" if online else "Down",
                    "announce_interval": interval,
                    "last_announce_at": last_announce,
                    "last_announce_age": age,
                    "next_announce_in": next_announce,
                    "last_announce_reason": self._recorded_configured_announce_reason(name, leafs),
                    "announce_targets": len(leafs),
                    "clients": sum(self._interface_client_count(interface) for interface in matching),
                }
            )

        return result

    def _configured_enabled_interfaces(self) -> list[dict[str, object]]:
        try:
            config = load_rns_config(self.config_dir)
        except Exception:
            return []

        return [
            interface
            for interface in config.interfaces
            if bool(interface.get("enabled"))
        ]

    def _live_interfaces(self) -> list[Any]:
        transport = getattr(self.RNS, "Transport", None) if self.RNS is not None else None
        interfaces = getattr(transport, "interfaces", []) if transport is not None else []
        return list(interfaces)

    def _announce_interval_for_interface(self, interface: Any) -> int:
        configured_name = self._parent_interface_name(interface) or str(getattr(interface, "name", ""))

        for item in self._configured_enabled_interfaces():
            if item.get("name") == configured_name:
                return self._normalise_announce_interval(item.get("announce_interval"))

        return DEFAULT_ANNOUNCE_MIN_INTERVAL_SECONDS

    def _normalise_announce_interval(self, value: object) -> int:
        try:
            interval = int(value)
        except (TypeError, ValueError):
            interval = DEFAULT_ANNOUNCE_MIN_INTERVAL_SECONDS

        return max(interval, MIN_ANNOUNCE_MIN_INTERVAL_SECONDS)

    def _next_announce_in(
        self,
        *,
        age: float | None,
        interval: int,
        target_count: int,
    ) -> float | None:
        if target_count <= 0:
            return None

        if age is None:
            return 0

        return max(interval - age, 0)

    def _interface_connection_signature(self, interface: Any) -> tuple[object, ...]:
        socket_info = self._socket_info(interface)
        parent = getattr(interface, "parent_interface", None)
        return (
            type(interface).__name__,
            str(getattr(interface, "name", "")),
            self._parent_interface_name(interface),
            bool(getattr(interface, "online", False)),
            bool(getattr(interface, "IN", False)),
            bool(getattr(interface, "OUT", False)),
            str(getattr(interface, "bind_ip", "")),
            str(getattr(interface, "bind_port", "")),
            str(getattr(interface, "target_ip", "")),
            str(getattr(interface, "target_port", "")),
            self._interface_client_count(parent) if parent is not None else self._interface_client_count(interface),
            socket_info,
        )

    def _socket_info(self, interface: Any) -> tuple[str, str]:
        socket_object = getattr(interface, "socket", None)

        if socket_object is None:
            return ("", "")

        try:
            local = socket_object.getsockname()
        except OSError:
            local = ""

        try:
            peer = socket_object.getpeername()
        except OSError:
            peer = ""

        return (str(local), str(peer))

    def _interface_key(self, interface: Any) -> str:
        return self._interface_display_name(interface)

    def _interface_display_name(self, interface: Any) -> str:
        try:
            return str(interface)
        except Exception:
            return str(getattr(interface, "name", type(interface).__name__))

    def _parent_interface_name(self, interface: Any) -> str:
        parent = getattr(interface, "parent_interface", None)

        if parent is None:
            return ""

        return str(getattr(parent, "name", ""))

    def _interface_client_count(self, interface: Any) -> int:
        if interface is None:
            return 0

        clients = getattr(interface, "clients", None)

        if isinstance(clients, int):
            return clients

        if callable(clients):
            try:
                return int(clients())
            except (TypeError, ValueError):
                return 0

        return 0

    def _interface_last_announce_at(self, interface: Any) -> float | None:
        deque = getattr(interface, "oa_freq_deque", None)

        if deque is None or len(deque) == 0:
            return None

        try:
            return float(deque[-1])
        except (TypeError, ValueError):
            return None

    def _max_last_announce_at(self, interfaces: list[Any]) -> float | None:
        timestamps = [
            timestamp
            for timestamp in (self._interface_last_announce_at(interface) for interface in interfaces)
            if timestamp is not None
        ]

        if len(timestamps) == 0:
            return None

        return max(timestamps)

    def _record_interface_announce(self, interface: Any, timestamp: float, reason: str) -> None:
        for key in self._interface_announce_keys(interface):
            self._interface_announce_last[key] = timestamp
            self._interface_announce_reason[key] = reason

    def _recorded_interface_announce_at(self, interface: Any) -> float | None:
        return self._max_recorded_announce_for_keys(self._interface_announce_keys(interface))

    def _interface_announce_keys(self, interface: Any) -> set[str]:
        keys = {
            self._interface_key(interface),
            str(getattr(interface, "name", "")),
            self._parent_interface_name(interface),
        }
        return {key for key in keys if key != ""}

    def _max_recorded_announce_at(self, interfaces: list[Any]) -> float | None:
        timestamps = [
            timestamp
            for timestamp in (self._recorded_interface_announce_at(interface) for interface in interfaces)
            if timestamp is not None
        ]

        if len(timestamps) == 0:
            return None

        return max(timestamps)

    def _latest_recorded_announce_reason(self, interfaces: list[Any]) -> str:
        latest_interface = None
        latest_timestamp = None

        for interface in interfaces:
            timestamp = self._recorded_interface_announce_at(interface)

            if timestamp is None:
                continue

            if latest_timestamp is None or timestamp > latest_timestamp:
                latest_interface = interface
                latest_timestamp = timestamp

        if latest_interface is None:
            return ""

        return self._interface_announce_reason.get(self._interface_key(latest_interface), "")

    def _recorded_configured_announce_at(
        self,
        configured_name: str,
        interfaces: list[Any],
    ) -> float | None:
        keys = {configured_name} if configured_name != "" else set()

        for interface in interfaces:
            keys.update(self._interface_announce_keys(interface))

        return self._max_recorded_announce_for_keys(keys)

    def _recorded_configured_announce_reason(
        self,
        configured_name: str,
        interfaces: list[Any],
    ) -> str:
        keys = {configured_name} if configured_name != "" else set()

        for interface in interfaces:
            keys.update(self._interface_announce_keys(interface))

        latest_key = ""
        latest_timestamp = None

        for key in keys:
            timestamp = self._interface_announce_last.get(key)

            if timestamp is None:
                continue

            if latest_timestamp is None or timestamp > latest_timestamp:
                latest_key = key
                latest_timestamp = timestamp

        if latest_key == "":
            return ""

        return self._interface_announce_reason.get(latest_key, "")

    def _max_recorded_announce_for_keys(self, keys: set[str]) -> float | None:
        timestamps = [
            timestamp
            for timestamp in (self._interface_announce_last.get(key) for key in keys)
            if timestamp is not None
        ]

        if len(timestamps) == 0:
            return None

        return max(timestamps)

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
