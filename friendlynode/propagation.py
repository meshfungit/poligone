"""Persistent instance-wide LXMF propagation node registry."""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import string
import threading


PROPAGATION_STORE_VERSION = 1
PROPAGATION_DESTINATION_HASH_HEX_LENGTH = 32
PROPAGATION_IDENTITY_HASH_HEX_LENGTH = 32
PROPAGATION_DEFAULT_NAME_PREFIX = "Propagation"


@dataclass(slots=True)
class PropagationNode:
    destination_hash: str
    identity_hash: str = ""
    name: str = ""
    enabled: bool = False

    def to_dict(self) -> dict[str, object]:
        return {
            "destination_hash": self.destination_hash,
            "identity_hash": self.identity_hash,
            "name": self.name,
            "enabled": self.enabled,
        }


class PropagationNodeStore:
    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._lock = threading.RLock()

    def list_nodes(self) -> list[PropagationNode]:
        with self._lock:
            return [PropagationNode(**node.to_dict()) for node in self._load_nodes()]

    def get_node(self, destination_hash: str) -> PropagationNode | None:
        destination = self._normalise_destination_hash(destination_hash)

        with self._lock:
            for node in self._load_nodes():
                if node.destination_hash == destination:
                    return PropagationNode(**node.to_dict())

        return None

    def remember_node(self, payload: dict[str, object]) -> tuple[PropagationNode, bool]:
        destination = self._normalise_destination_hash(
            str(payload.get("destination_hash") or payload.get("lxmf") or "")
        )
        identity = self._normalise_identity_hash(str(payload.get("identity_hash") or ""))
        name = str(payload.get("name") or "").strip()

        with self._lock:
            nodes = self._load_nodes()
            existing = next((node for node in nodes if node.destination_hash == destination), None)
            created = existing is None

            if existing is None:
                existing = PropagationNode(
                    destination_hash=destination,
                    identity_hash=identity,
                    name=name or self._default_name(destination),
                    enabled=False,
                )
                nodes.append(existing)
            else:
                if identity != "":
                    existing.identity_hash = identity
                if name != "":
                    existing.name = name

            self._save_nodes(nodes)
            return PropagationNode(**existing.to_dict()), created

    def set_enabled(self, destination_hash: str, enabled: bool) -> PropagationNode:
        destination = self._normalise_destination_hash(destination_hash)

        with self._lock:
            nodes = self._load_nodes()

            for node in nodes:
                if node.destination_hash != destination:
                    continue

                node.enabled = bool(enabled)
                self._save_nodes(nodes)
                return PropagationNode(**node.to_dict())

        raise ValueError(f"Propagation node does not exist: {destination}")

    def forget_node(self, destination_hash: str) -> PropagationNode:
        destination = self._normalise_destination_hash(destination_hash)

        with self._lock:
            nodes = self._load_nodes()

            for index, node in enumerate(nodes):
                if node.destination_hash != destination:
                    continue

                removed = nodes.pop(index)
                self._save_nodes(nodes)
                return PropagationNode(**removed.to_dict())

        raise ValueError(f"Propagation node does not exist: {destination}")

    def enabled_nodes(self) -> list[PropagationNode]:
        return [node for node in self.list_nodes() if node.enabled]

    def _load_nodes(self) -> list[PropagationNode]:
        if not self.path.exists():
            return []

        raw = json.loads(self.path.read_text(encoding="utf-8"))

        if not isinstance(raw, dict):
            raise ValueError("Propagation node store root must be an object")

        version = int(raw.get("version") or 0)

        if version != PROPAGATION_STORE_VERSION:
            raise ValueError(f"Unsupported propagation node store version: {version}")

        raw_nodes = raw.get("nodes")

        if not isinstance(raw_nodes, list):
            raise ValueError("Propagation node store must contain a nodes list")

        nodes: list[PropagationNode] = []
        seen: set[str] = set()

        for raw_node in raw_nodes:
            if not isinstance(raw_node, dict):
                continue

            destination = self._normalise_destination_hash(
                str(raw_node.get("destination_hash") or "")
            )

            if destination in seen:
                continue

            seen.add(destination)
            nodes.append(
                PropagationNode(
                    destination_hash=destination,
                    identity_hash=self._normalise_identity_hash(
                        str(raw_node.get("identity_hash") or "")
                    ),
                    name=str(raw_node.get("name") or "").strip()
                    or self._default_name(destination),
                    enabled=bool(raw_node.get("enabled")),
                )
            )

        return nodes

    def _save_nodes(self, nodes: list[PropagationNode]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "version": PROPAGATION_STORE_VERSION,
            "nodes": [node.to_dict() for node in nodes],
        }
        temporary_path = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary_path.write_text(
            json.dumps(payload, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        temporary_path.replace(self.path)

    def _normalise_destination_hash(self, value: str) -> str:
        return self._normalise_hash(
            value,
            field_name="Propagation destination hash",
            expected_length=PROPAGATION_DESTINATION_HASH_HEX_LENGTH,
            allow_empty=False,
        )

    def _normalise_identity_hash(self, value: str) -> str:
        return self._normalise_hash(
            value,
            field_name="Propagation identity hash",
            expected_length=PROPAGATION_IDENTITY_HASH_HEX_LENGTH,
            allow_empty=True,
        )

    def _normalise_hash(
        self,
        value: str,
        *,
        field_name: str,
        expected_length: int,
        allow_empty: bool,
    ) -> str:
        clean = value.strip().lower()

        if clean == "" and allow_empty:
            return ""

        if len(clean) != expected_length:
            raise ValueError(f"{field_name} must contain {expected_length} hexadecimal characters")

        if any(character not in string.hexdigits for character in clean):
            raise ValueError(f"{field_name} must be hexadecimal")

        return clean

    def _default_name(self, destination_hash: str) -> str:
        return f"{PROPAGATION_DEFAULT_NAME_PREFIX} {destination_hash[:8]}"
