"""One-shot cryptographic identity generator for a local LXMF account."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from friendlynode.local_identities import LocalIdentity, LocalIdentityStore

DEFAULT_SOURCE_PATH = ""
LXMF_DELIVERY_ASPECT = "delivery"


def main() -> None:
    args = _parse_args()
    _configure_module_paths(
        _optional_path(args.rns_source_path),
        _optional_path(args.lxmf_source_path),
    )

    import RNS
    import LXMF

    store = LocalIdentityStore(Path(args.identities_dir))
    local_identity = _get_identity(store, args.identity_id)
    identity_path = store.rns_identity_path(local_identity.id)
    identity_path.parent.mkdir(parents=True, exist_ok=True)

    if identity_path.exists():
        rns_identity = RNS.Identity.from_file(str(identity_path))

        if rns_identity is None:
            raise RuntimeError(f"Could not load RNS identity from {identity_path}")
    else:
        if local_identity.identity_hash != "" or local_identity.lxmf_destination_hash != "":
            raise RuntimeError(
                f"RNS identity key file is missing for {local_identity.id}; "
                "refusing to replace an existing network identity"
            )

        rns_identity = RNS.Identity()

        if not rns_identity.to_file(str(identity_path)):
            raise RuntimeError(f"Could not save RNS identity to {identity_path}")

    identity_hash = _hex_value(getattr(rns_identity, "hash", b""))
    destination_hash = _hex_value(
        RNS.Destination.hash(rns_identity, LXMF.APP_NAME, LXMF_DELIVERY_ASPECT)
    )

    if identity_hash == "":
        raise RuntimeError("Could not determine local identity hash")
    if destination_hash == "":
        raise RuntimeError("Could not determine LXMF delivery destination hash")

    if local_identity.identity_hash not in ("", identity_hash):
        raise RuntimeError(
            f"Stored identity hash does not match the RNS identity key for {local_identity.id}"
        )

    if local_identity.lxmf_destination_hash not in ("", destination_hash):
        raise RuntimeError(
            f"Stored LXMF destination hash does not match the RNS identity key for {local_identity.id}"
        )

    store.update_network_identity(local_identity.id, identity_hash, destination_hash)

    print(
        f"[friendlynode-identity:{local_identity.id}] ready "
        f"identity={identity_hash} destination={destination_hash}",
        flush=True,
    )


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate or load a FriendlyNode local identity")
    parser.add_argument("--identity-id", required=True)
    parser.add_argument("--identities-dir", required=True)
    parser.add_argument("--rns-source-path", default=DEFAULT_SOURCE_PATH)
    parser.add_argument("--lxmf-source-path", default=DEFAULT_SOURCE_PATH)
    return parser.parse_args()


def _configure_module_paths(rns_source_path: Path | None, lxmf_source_path: Path | None) -> None:
    for path in (lxmf_source_path, rns_source_path):
        if path is None:
            continue

        resolved = str(path.resolve())

        if resolved in sys.path:
            sys.path.remove(resolved)

        sys.path.insert(0, resolved)


def _get_identity(store: LocalIdentityStore, identity_id: str) -> LocalIdentity:
    for identity in store.list_identities():
        if identity.id == identity_id:
            return identity

    raise ValueError(f"Local identity does not exist: {identity_id}")


def _hex_value(value: object) -> str:
    if isinstance(value, bytes):
        return value.hex()

    if isinstance(value, bytearray):
        return bytes(value).hex()

    return str(value or "").strip().lower()


def _optional_path(value: str) -> Path | None:
    cleaned = value.strip()
    return Path(cleaned) if cleaned != "" else None


if __name__ == "__main__":
    main()
