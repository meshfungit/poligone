# FriendlyNode

Skeleton for a lightweight Reticulum/LXMF/NomadNet web client.

Design goals:

- web UI usable locally or through a browser on a server;
- Reticulum engine is a replaceable runtime, not hard-bundled into the UI;
- the controller can restart the engine without closing the UI;
- user-supplied Reticulum interface modules can be placed in `custom_interfaces/`;
- the current Python files are stubs so the project opens cleanly in PyCharm.

## Layout

- `friendlynode/controller/` — long-running controller, settings, runtime manager.
- `friendlynode/engine/` — Reticulum/LXMF/NomadNet engine boundary.
- `friendlynode/reticulum_compat/stubs/` — fake RNS/LXMF modules used until real Reticulum is added.
- `runtimes/` — place external Reticulum runtime folders here.
- `custom_interfaces/` — place custom interface modules here.
- `web-ui/` — static tabular UI with favicon.
- `data/` — local config, DB, identities, attachments, NomadNet pages, logs.

## Run the skeleton

From the project root:

```bash
python -m friendlynode.controller.main
```
