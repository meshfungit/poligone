# SESSION_HANDOFF.md

## Repository State

- Repository: `E:\proj\git_world\poligone`
- Branch: `main`
- Status before this handoff file: clean
- Latest useful commit: `0dd9268 A security warning has been added if an insecure connection is configured`
- Recent commits:
  - `0dd9268 A security warning has been added if an insecure connection is configured`
  - `02821ad Cool Edirot in basic MVC state`
  - `0305c47 Palette heigth issue has been resolved`
  - `9bcdc8e Editor for Micron - big fixes well done!`
  - `81d9964 Nomad Net - starting development`

## What This App Is

FriendlyNode is a local/server web UI for Reticulum-oriented node operation and lightweight client/chat work. The current implementation is still mostly stub/runtime scaffolding, but the UI already covers transport status, RNS config editing, client accounts, conversations, announces, NomadNet browser/editor placeholders, runtime selection, access settings, and channel security warnings.

## Current Project Structure

- `friendlynode/`: backend/controller/runtime/client/storage code.
- `friendlynode/controller/`: HTTP server, controller app, runtime manager, engine supervisor, network access/security helpers.
- `friendlynode/config/`: app config and RNS config schema/parser/writer.
- `friendlynode/engine/`: in-process stub engine and future RNS/LXMF/NomadNet service modules.
- `friendlynode/storage/`: SQLite repository scaffolding.
- `friendlynode/reticulum_compat/stubs/`: RNS/LXMF stubs used before real runtime wiring.
- `web-ui/`: static browser UI.
- `web-ui/assets/js/`: main app, RNS config editor, Micron renderer/palette/icon pack.
- `web-ui/assets/css/app.css`: responsive UI styling.
- `runtimes/`: runtime manifests; currently only built-in stub manifest exists.
- `scripts/`: local launch/access helper scripts.
- `data/`: local generated config/state, ignored by git.

## How To Run On Windows

From repository root:

```powershell
python -m friendlynode.controller.main
```

Alternative wrapper:

```powershell
python scripts\run_controller.py
```

Default URL:

```text
http://127.0.0.1:8787/
```

Local venv convention: `.venv\` in the repo root, with activation via `.venv\Scripts\Activate.ps1`. At the time of inspection, `.venv` was not present. Do not create or modify it unless the task explicitly requires it.

## URLs And API Endpoints To Test

Static UI/assets:

- `GET /`
- `GET /assets/js/app.js`
- `GET /assets/js/rns_config_editor.js`
- `GET /assets/js/micron_renderer.js`
- `GET /assets/js/micron_palette.js`
- `GET /assets/js/micron_iconpack.js`
- `GET /assets/css/app.css`

Current API routes from `friendlynode/controller/http_server.py`:

- `GET /api/status`
- `GET /api/config`
- `POST /api/config`
- `POST /api/controller/restart`
- `GET /api/access/ssh/status`
- `GET /api/access/security`
- `GET /api/rns-config`
- `POST /api/rns-config`
- `POST /api/reticulum/restart`
- `POST /api/runtime/select`
- `GET /api/announces`
- `GET /api/nomadnet/nodes`
- `GET /api/nomadnet/pages`
- `GET /api/nomadnet/local-page?path=page.mu`
- `POST /api/nomadnet/local-page`
- `GET /api/nomadnet/page?destination_hash=...&path=...`
- `GET /api/clients`
- `POST /api/clients/draft`
- `POST /api/clients`
- `DELETE /api/clients/{client_id}`
- `POST /api/clients/{client_id}/contacts`
- `GET /api/clients/{client_id}/contacts/{contact_id}/export`
- `GET /api/clients/{client_id}/conversations`
- `GET /api/clients/{client_id}/conversations/{contact_id}/messages`
- `POST /api/clients/{client_id}/conversations/{contact_id}/messages`
- `DELETE /api/clients/{client_id}/conversations/{contact_id}/messages`

## Exact Smoke-Test Commands

Syntax checks:

```powershell
python -m py_compile friendlynode\controller\app.py friendlynode\controller\http_server.py friendlynode\controller\access.py friendlynode\controller\runtime_manager.py friendlynode\config\rns_config_editor.py
node --check web-ui\assets\js\app.js
node --check web-ui\assets\js\rns_config_editor.js
node --check web-ui\assets\js\micron_renderer.js
node --check web-ui\assets\js\micron_palette.js
node --check web-ui\assets\js\micron_iconpack.js
```

Manual runtime smoke in one terminal:

```powershell
python -m friendlynode.controller.main
```

Then in another terminal:

```powershell
curl.exe -s http://127.0.0.1:8787/
curl.exe -s http://127.0.0.1:8787/api/status
curl.exe -s http://127.0.0.1:8787/api/config
curl.exe -s http://127.0.0.1:8787/api/access/security
curl.exe -s http://127.0.0.1:8787/api/rns-config
curl.exe -s http://127.0.0.1:8787/api/clients
curl.exe -s http://127.0.0.1:8787/api/clients/default/conversations
curl.exe -s http://127.0.0.1:8787/api/clients/default/conversations/test-contact-9f3a/messages
curl.exe -s http://127.0.0.1:8787/api/nomadnet/pages
```

Message POST smoke:

```powershell
$body = '{"content":"Smoke message"}'
curl.exe -s -X POST http://127.0.0.1:8787/api/clients/default/conversations/test-contact-9f3a/messages -H "Content-Type: application/json" --data-binary $body
```

## Local State Not To Commit

These are intentionally ignored and should remain local/generated:

- `.venv/`, `.venv-*/`, `venv/`
- `data/config/friendlynode.json`
- `data/config/reticulum/`
- `data/db/`
- `data/logs/`
- `data/identities/`
- `data/clients/`
- `data/attachments/`
- `data/nomadnet-pages/`
- `runtimes/*/venv/`
- `runtimes/*/src/`
- `runtimes/*/__pycache__/`

## Frontend Architecture

The UI is static vanilla JS served from `web-ui/`. `index.html` loads `rns_config_editor.js`, `micron_palette.js`, `micron_iconpack.js`, `micron_renderer.js`, then `app.js`.

`app.js` owns the main state/render loop and tab UI: `Client`, `Announces`, `Peers`, `NomadNet`, `Interfaces`, `Transport`, `Logs`, `Settings`. Client and NomadNet editor both use the Micron renderer/palette stack. The chat composer and NomadNet editor can edit with `show unprintable` on or off; palette operations are expected to work in both modes.

`micron_renderer.js` renders current Micron markup and icon modes. `micron_palette.js` defines palette items. `micron_iconpack.js` defines the FriendlyNode color icon pack. `app.css` contains responsive layout, collapsible panels, chat/editor/palette sizing, and insecure-channel warning styling.

## Backend Architecture

The entry point is `friendlynode.controller.main:main`, also exposed through `python -m friendlynode.controller.main`, `friendlynode/__main__.py`, and `scripts/run_controller.py`.

`ControllerHttpServer` serves the static UI and JSON API. `ControllerApp` owns configuration, runtime selection, state cache, client account storage, engine supervisor, RNS config editor, access/security status, and NomadNet local page operations.

The engine is currently supervised in-process through `EngineSupervisor` and `EngineMain`. `EngineMain` starts an IPC bus and `RnsRuntime`. Real RNS/LXMF/NomadNet service files exist under `friendlynode/engine/`, but the active runtime is still the built-in stub unless a real runtime manifest is added and selected.

Client account storage is JSON-file based under `data/clients/`. A default stub client/contact is created lazily, including `test-contact-9f3a` with two messages: `Test` and `Accept Test`.

## RNS Config Editor Behavior

Backend schema lives in `friendlynode/config/rns_config_editor.py`. Interface defaults and presets are backend-owned and returned through `GET /api/rns-config`, so frontend controls should not hardcode Reticulum interface presets. Saving goes through `POST /api/rns-config` and writer helpers in `friendlynode/config/rns_config_writer.py`.

Settings currently include controller host/port, SSH tunnel helper fields, runtime selection, local paths, and RNS config editing. Interface config is conceptually moving toward a dedicated `Interfaces` UI while preserving one backend source of truth.

## Runtime System Behavior

Runtime manifests are read from `runtimes/*/runtime.json`. Current manifest:

- `runtimes/stub/runtime.json`
- name: `stub`
- kind: `stub`
- label: `Built-in Stub Runtime`
- enabled: `true`

`RuntimeManager` also guarantees a stub runtime fallback if no manifests are found. Selecting a runtime updates app config and restarts the in-process engine. External runtime payloads under `runtimes/*/venv/` or `runtimes/*/src/` are local/generated and ignored.

## Access And Security Behavior

The controller always keeps `127.0.0.1` available when binding to a specific non-loopback host. `0.0.0.0` remains wildcard. Security assessment is backend-driven in `friendlynode/controller/access.py`: localhost, HTTPS, Tailscale, WireGuard, and VPN-like adapters are treated as secure; ordinary LAN/public HTTP and wildcard binds are warned as insecure. The frontend displays a red warning and outlines sensitive areas when `/api/status` or `/api/access/security` reports an insecure configured channel.

## What Currently Works

- Static UI loads locally on `127.0.0.1:8787`.
- Settings can show/save app config and scan network interfaces.
- Optional non-loopback bind is supported while preserving localhost access.
- SSH/access helper status API exists; `scripts/access_starter.py` handles local SSH helper checks/install flow outside the web UI.
- Transport status panel is compact and collapsible.
- Client contacts/conversations/messages exist with stub storage.
- Chat supports Micron editing, palette, send button, clear/export actions, and autoscroll-to-bottom behavior.
- NomadNet section has Browser/Bookmarks/Publisher/Editor structure; browser fetch is stubbed, editor can create/open/save local `.mu` pages.
- Micron editor/palette supports show/hide unprintable mode and FriendlyNode/system/text icon rendering modes.
- Announces page exists with filters and compact list/modal concept.

## Next Recommended Small Task

Implement the backend/frontend plumbing for the security assessment to be tied more explicitly to the user-selected configured access interface in Settings. The backend already classifies adapters; the next small step is making the Settings UI show the security classification directly next to each selectable bind address before save, so the user sees whether a choice is local, VPN/tunnel, wildcard, private LAN, or public HTTP.

## Constraints And Things Not To Change

- Do not commit or push automatically.
- Do not create a new branch unless requested.
- Do not run `sudo`, `systemctl`, `service`, reboot/shutdown commands, or destructive deletes.
- Do not edit OS config paths or files outside the repository.
- Do not run remote commands on `mailedge` without separate confirmation.
- Do not touch `.venv` or generated `data/` state unless explicitly asked.
- Do not hardcode RNS interface presets in frontend JS; keep them backend-schema driven.
- Keep changes small and reviewable; avoid broad refactors while the UI/runtime concepts are still evolving.
