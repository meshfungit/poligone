"""Reticulum announce handlers."""

from dataclasses import dataclass
from typing import Any

from friendlynode.engine.events import EngineEvent
from friendlynode.engine.ipc import IpcBus


KNOWN_ANNOUNCE_ASPECTS = (
    "lxmf.delivery",
    "lxmf.propagation",
    "lxmf.propagation.control",
    "nomadnetwork.node",
    "call.audio",
    "rnstransport.discovery.interface",
    "rnstransport.probe",
    "rncp.receive",
    "rnx.execute",
    "rserver.web",
    "retibbs.bbs",
    "styrene.tui.operator",
    "anonmesh.beacon",
    "anonmesh.beacon.v1",
    "anonmesh.relay",
    "anonmesh.node",
    "lxst.telephony",
)

DEFAULT_ANNOUNCE_ASPECTS = KNOWN_ANNOUNCE_ASPECTS


@dataclass(slots=True)
class AnnounceRecord:
    aspect: str
    destination_hash: str
    display_name: str = ""
    hops: int | None = None
    raw: dict[str, Any] | None = None


class GenericAnnounceHandler:
    def __init__(self, aspect_filter: str | None, bus: IpcBus) -> None:
        self.aspect_filter = aspect_filter
        self.bus = bus

    def received_announce(
        self,
        destination_hash: bytes,
        announced_identity: Any,
        app_data: bytes,
        announce_packet_hash: bytes | None = None,
        is_path_response: bool = False,
    ) -> None:
        aspect = self.aspect_filter or _infer_known_aspect(destination_hash, announced_identity)
        path_info = _path_info(destination_hash)

        self.bus.publish(
            EngineEvent(
                "announce.received",
                {
                    "aspect": aspect,
                    "handler_aspect": self.aspect_filter or "",
                    "destination_hash": destination_hash.hex(),
                    "identity_hash": (
                        announced_identity.hash.hex()
                        if isinstance(getattr(announced_identity, "hash", None), bytes)
                        else ""
                    ),
                    "app_data_hex": app_data.hex() if isinstance(app_data, bytes) else "",
                    "app_data_preview": _app_data_preview(app_data),
                    "announce_packet_hash": (
                        announce_packet_hash.hex()
                        if isinstance(announce_packet_hash, bytes)
                        else ""
                    ),
                    "is_path_response": is_path_response,
                    "hops": path_info["hops"],
                    "interface": path_info["interface"],
                },
            )
        )


def _infer_known_aspect(destination_hash: bytes, announced_identity: Any) -> str:
    if not isinstance(destination_hash, bytes):
        return ""

    for aspect in KNOWN_ANNOUNCE_ASPECTS:
        if _destination_hash_matches_aspect(destination_hash, announced_identity, aspect):
            return aspect

    return ""


def _destination_hash_matches_aspect(
    destination_hash: bytes,
    announced_identity: Any,
    aspect: str,
) -> bool:
    parts = aspect.split(".")
    if len(parts) < 2:
        return False

    app_name = parts[0]
    aspects = parts[1:]

    try:
        import RNS

        destination = RNS.Destination(
            announced_identity,
            RNS.Destination.OUT,
            RNS.Destination.SINGLE,
            app_name,
            *aspects,
        )
    except Exception:
        return False

    return getattr(destination, "hash", None) == destination_hash


def _app_data_preview(app_data: object) -> str:
    if not isinstance(app_data, bytes) or app_data == b"":
        return ""

    unpacked = _unpack_app_data(app_data)
    if unpacked != "":
        return unpacked[:120]

    try:
        text = app_data.decode("utf-8")
    except Exception:
        return app_data[:64].hex()

    if not _is_printable_text(text):
        return app_data[:64].hex()

    return text[:120]


def _path_info(destination_hash: bytes) -> dict[str, object]:
    try:
        import RNS

        transport = getattr(RNS, "Transport", None)
        path_table = getattr(transport, "path_table", {})
        path_table_lock = getattr(transport, "path_table_lock", None)
    except Exception:
        return {"hops": None, "interface": ""}

    def read_entry() -> object:
        if destination_hash not in path_table:
            return None
        return path_table[destination_hash]

    try:
        if path_table_lock is not None:
            with path_table_lock:
                entry = read_entry()
        else:
            entry = read_entry()
    except Exception:
        return {"hops": None, "interface": ""}

    if not isinstance(entry, list) or len(entry) < 6:
        return {"hops": None, "interface": ""}

    return {
        "hops": entry[2],
        "interface": str(entry[5]) if entry[5] is not None else "",
    }


def _unpack_app_data(app_data: bytes) -> str:
    try:
        from RNS.vendor import umsgpack

        value = umsgpack.unpackb(app_data)
    except Exception:
        return ""

    return _extract_text(value)


def _extract_text(value: object) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, bytes):
        try:
            text = value.decode("utf-8")
        except UnicodeDecodeError:
            return ""

        return text.strip() if _is_printable_text(text) else ""

    if isinstance(value, dict):
        preferred_keys = ("name", "display_name", "nickname", "node_name")
        for key in preferred_keys:
            if key in value:
                text = _extract_text(value[key])
                if text != "":
                    return text

        for item in value.values():
            text = _extract_text(item)
            if text != "":
                return text

    if isinstance(value, (list, tuple)):
        for item in value:
            text = _extract_text(item)
            if text != "":
                return text

    return ""


def _is_printable_text(text: str) -> bool:
    if text == "":
        return False

    printable = sum(1 for char in text if char.isprintable() or char in "\r\n\t")
    return printable / len(text) > 0.85