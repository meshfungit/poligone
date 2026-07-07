"""Optional NomadNet page client runtime."""

from __future__ import annotations

import threading
import time
from typing import Any


NOMADNET_APP_NAME = "nomadnetwork"
NOMADNET_NODE_ASPECT = "node"
NOMADNET_DEFAULT_PATH = "/page/index.mu"

NOMADNET_PATH_REQUEST_TIMEOUT_SEC = 30.0
NOMADNET_LINK_TIMEOUT_SEC = 45.0
NOMADNET_REQUEST_TIMEOUT_SEC = 60.0
NOMADNET_WAIT_STEP_SEC = 0.1


class NomadNetRuntime:
    def __init__(self, rns_runtime: Any) -> None:
        self.rns_runtime = rns_runtime

    def fetch_page(
        self,
        destination_hash: str,
        path: str,
        discovery_hints: dict[str, object] | None = None,
        request_data: dict[str, object] | None = None,
    ) -> dict[str, object]:
        destination = self._normalise_destination_hash(destination_hash)
        page_path = self._normalise_path(path)
        started_at = time.time()

        if (
            self.rns_runtime.RNS is None
            or self.rns_runtime.reticulum is None
        ):
            return self._fetch_error(
                destination,
                page_path,
                "not_running",
                "Reticulum runtime is not running",
            )

        if self.rns_runtime.rns_using_stub:
            return self._fetch_error(
                destination,
                page_path,
                "stub_runtime",
                "Reticulum RNS runtime is running in stub mode",
            )

        try:
            rns = self._require_rns()
            destination_hash_bytes = bytes.fromhex(destination)

            self._wait_for_path(
                destination_hash_bytes,
                discovery_hints or {},
            )

            remote_identity = rns.Identity.recall(destination_hash_bytes)

            if remote_identity is None:
                return self._fetch_error(
                    destination,
                    page_path,
                    "identity_not_found",
                    "Destination identity is not available after path lookup",
                )

            remote_destination = rns.Destination(
                remote_identity,
                rns.Destination.OUT,
                rns.Destination.SINGLE,
                NOMADNET_APP_NAME,
                NOMADNET_NODE_ASPECT,
            )

            if getattr(remote_destination, "hash", None) != destination_hash_bytes:
                return self._fetch_error(
                    destination,
                    page_path,
                    "destination_mismatch",
                    (
                        "Reconstructed nomadnetwork.node destination hash "
                        "does not match requested hash"
                    ),
                )

            link = self._open_link(remote_destination)

            try:
                response = self._request_path(
                    link,
                    page_path,
                    request_data or {},
                )
            finally:
                try:
                    link.teardown()
                except Exception:
                    pass

            source = self._decode_response(response)
            path_interface = self._path_interface_for_destination(
                destination_hash_bytes
            )

            return {
                "status": "ok",
                "destination_hash": destination,
                "path": page_path,
                "source": source,
                "runtime": "reticulum",
                "elapsed_sec": round(time.time() - started_at, 3),
                "interface": (
                    self._interface_display_name(path_interface)
                    if path_interface is not None
                    else ""
                ),
                "last_interface": (
                    self._interface_display_name(path_interface)
                    if path_interface is not None
                    else ""
                ),
                "last_transport": self._transport_hint_for_interface(
                    path_interface
                ),
            }

        except Exception as exc:
            return self._fetch_error(
                destination,
                page_path,
                type(exc).__name__,
                str(exc),
            )

    def _require_rns(self) -> Any:
        rns = self.rns_runtime.RNS

        if rns is None:
            raise RuntimeError("Reticulum module is not loaded")

        return rns

    def _normalise_destination_hash(self, destination_hash: str) -> str:
        destination = destination_hash.strip().lower()

        if len(destination) != 32:
            raise ValueError(
                "NomadNet destination hash must be 32 hex characters"
            )

        if any(char not in "0123456789abcdef" for char in destination):
            raise ValueError(
                "NomadNet destination hash contains non-hex characters"
            )

        return destination

    def _normalise_path(self, path: str) -> str:
        clean_path = path.strip() or NOMADNET_DEFAULT_PATH

        if not clean_path.startswith("/"):
            clean_path = f"/{clean_path}"

        return clean_path

    def _wait_for_path(
        self,
        destination_hash: bytes,
        discovery_hints: dict[str, object] | None = None,
    ) -> None:
        rns = self._require_rns()
        transport = rns.Transport

        if transport.has_path(destination_hash):
            return

        hints = discovery_hints or {}
        deadline = time.time() + NOMADNET_PATH_REQUEST_TIMEOUT_SEC

        for interface in self._path_request_candidate_interfaces(hints):
            self._request_destination_path(destination_hash, interface)

            if self._wait_until_path_available(
                destination_hash,
                min(4.0, max(0.0, deadline - time.time())),
            ):
                return

        self._request_destination_path(destination_hash, None)

        if self._wait_until_path_available(
            destination_hash,
            max(0.0, deadline - time.time()),
        ):
            return

        raise TimeoutError(
            "Timed out waiting for Reticulum path to NomadNet node"
        )

    def _wait_until_path_available(
        self,
        destination_hash: bytes,
        timeout: float,
    ) -> bool:
        rns = self._require_rns()
        transport = rns.Transport
        deadline = time.time() + max(0.0, timeout)

        while time.time() < deadline:
            if transport.has_path(destination_hash):
                return True

            time.sleep(NOMADNET_WAIT_STEP_SEC)

        return transport.has_path(destination_hash)

    def _request_destination_path(
        self,
        destination_hash: bytes,
        interface: object | None,
    ) -> None:
        rns = self._require_rns()
        transport = rns.Transport

        if interface is None:
            transport.request_path(destination_hash)
            return

        try:
            transport.request_path(
                destination_hash,
                on_interface=interface,
            )
        except TypeError:
            transport.request_path(destination_hash)

    def _path_request_candidate_interfaces(
        self,
        hints: dict[str, object],
    ) -> list[object]:
        last_interface = str(
            hints.get("last_interface") or ""
        ).strip()

        if last_interface == "":
            return []

        return [
            interface
            for interface in self._live_interfaces()
            if self._interface_matches(interface, last_interface)
        ]

    def _path_interface_for_destination(
        self,
        destination_hash: bytes,
    ) -> object | None:
        rns = self._require_rns()
        transport = rns.Transport

        for method_name in (
            "next_hop_interface",
            "next_hop_if_name",
        ):
            method = getattr(transport, method_name, None)

            if not callable(method):
                continue

            try:
                return method(destination_hash)
            except Exception:
                continue

        return None

    def _transport_hint_for_interface(
        self,
        interface: object | None,
    ) -> dict[str, object]:
        if interface is None:
            return {}

        return {
            "interface": self._interface_display_name(interface),
            "interface_name": str(getattr(interface, "name", "")),
            "interface_type": type(interface).__name__,
            "target_host": str(
                getattr(interface, "target_host", "")
                or getattr(interface, "target_ip", "")
            ),
            "target_port": str(
                getattr(interface, "target_port", "")
            ),
        }

    def _open_link(self, remote_destination: object) -> object:
        rns = self._require_rns()
        established = threading.Event()
        closed = threading.Event()
        link_holder: dict[str, object] = {}

        def link_established(link: object) -> None:
            link_holder["link"] = link
            established.set()

        def link_closed(link: object) -> None:
            closed.set()

        link = rns.Link(
            remote_destination,
            established_callback=link_established,
            closed_callback=link_closed,
        )

        deadline = time.time() + NOMADNET_LINK_TIMEOUT_SEC

        while time.time() < deadline:
            if established.is_set():
                return link_holder.get("link", link)

            if closed.is_set():
                break

            time.sleep(NOMADNET_WAIT_STEP_SEC)

        try:
            link.teardown()
        except Exception:
            pass

        raise TimeoutError(
            "Timed out establishing link to NomadNet node"
        )

    def _request_path(
        self,
        link: object,
        page_path: str,
        request_data: dict[str, object] | None = None,
    ) -> object:
        completed = threading.Event()
        result: dict[str, object] = {}

        normalised_request_data = self._normalise_request_data(
            request_data
        )

        def got_response(request_receipt: object) -> None:
            result["response"] = getattr(
                request_receipt,
                "response",
                None,
            )
            completed.set()

        def request_failed(request_receipt: object) -> None:
            result["error"] = "NomadNet page request failed"
            completed.set()

        request_receipt = link.request(
            page_path,
            data=normalised_request_data,
            response_callback=got_response,
            failed_callback=request_failed,
            timeout=NOMADNET_REQUEST_TIMEOUT_SEC,
        )

        if request_receipt is False:
            raise RuntimeError(
                "Could not send NomadNet page request"
            )

        if not completed.wait(
            NOMADNET_REQUEST_TIMEOUT_SEC + 5.0
        ):
            raise TimeoutError(
                "Timed out waiting for NomadNet page response"
            )

        if "error" in result:
            raise RuntimeError(str(result["error"]))

        return result.get("response")

    def _normalise_request_data(
        self,
        request_data: dict[str, object] | None,
    ) -> dict[str, str] | None:
        if (
            not isinstance(request_data, dict)
            or len(request_data) == 0
        ):
            return None

        normalised: dict[str, str] = {}

        for raw_key, raw_value in request_data.items():
            key = str(raw_key).strip()

            if key == "":
                continue

            if len(key) > 128:
                key = key[:128]

            if isinstance(raw_value, (list, tuple)):
                value = ",".join(
                    str(item)
                    for item in raw_value
                    if item is not None
                )
            elif isinstance(raw_value, bool):
                value = "true" if raw_value else "false"
            elif raw_value is None:
                value = ""
            else:
                value = str(raw_value)

            if len(value) > 4096:
                value = value[:4096]

            normalised[key] = value

        return normalised or None

    def _decode_response(self, response: object) -> str:
        if response is None:
            return ""

        if isinstance(response, bytes):
            return response.decode(
                "utf-8",
                errors="replace",
            )

        return str(response)

    def _fetch_error(
        self,
        destination_hash: str,
        path: str,
        error: str,
        message: str,
    ) -> dict[str, object]:
        return {
            "status": "error",
            "error": error,
            "message": message,
            "destination_hash": destination_hash,
            "path": path,
            "source": "",
            "runtime": (
                "stub"
                if self.rns_runtime.rns_using_stub
                else "reticulum"
            ),
        }

    def _live_interfaces(self) -> list[object]:
        rns = self._require_rns()
        transport = getattr(rns, "Transport", None)
        interfaces = (
            getattr(transport, "interfaces", [])
            if transport is not None
            else []
        )

        return list(interfaces)

    def _interface_matches(
        self,
        interface: object,
        interface_name: str,
    ) -> bool:
        candidates = {
            str(interface),
            str(getattr(interface, "name", "")),
            self._interface_display_name(interface),
            self._parent_interface_name(interface),
        }

        return interface_name in candidates

    def _interface_display_name(
        self,
        interface: object,
    ) -> str:
        try:
            return str(interface)
        except Exception:
            return str(
                getattr(
                    interface,
                    "name",
                    type(interface).__name__,
                )
            )

    def _parent_interface_name(
        self,
        interface: object,
    ) -> str:
        parent = getattr(interface, "parent_interface", None)

        if parent is None:
            return ""

        return str(getattr(parent, "name", ""))
