# SESSION_HANDOFF for poligone

Current date: 2026-05-17

Repository:

`E:\proj\git_world\poligone`

Remote runtime/test target:

`mailedge:/home/adminus/projects/poligone-test`

Remote host currently used:

`adminus@192.168.88.195`

SSH key:

`C:\Users\adminus\.ssh\orange_adminus_ed25519`

## 1. What We Are Building

FriendlyNode is intended to become a user-friendly cross-platform desktop/server kit with a web UI for deploying and managing a Reticulum node as a client, a transport/server, or both.

Current practical state:

- Reticulum transport node integration is now working with managed RNS runtime `1.2.5`.
- Web UI exists for client stubs, announces, NomadNet browser/editor stubs, Reticulum config editor, runtime selection, interface status, logs, and access/security controls.
- The project still has no full real LXMF/FriendlyNode chat client implementation. Client accounts and conversations are mostly storage/UI scaffolding.
- NomadNet page fetch is still stubbed. Micron rendering/editor/palette work exists.
- Reticulum is integrated without patching upstream RNS source.

## 2. Current Architecture

Main layers:

- `friendlynode.controller.main` starts the controller app and HTTP server.
- `friendlynode.controller.http_server.ControllerHttpServer` serves static `web-ui/` and JSON API endpoints.
- `friendlynode.controller.app.ControllerApp` owns config, runtime manager, client account store, state cache and engine supervisor.
- `friendlynode.controller.engine_supervisor.EngineSupervisor` starts/stops/restarts `EngineMain` in-process.
- `friendlynode.engine.engine_main.EngineMain` owns `IpcBus` and `RnsRuntime`.
- `friendlynode.engine.rns_runtime.RnsRuntime` loads real RNS/LXMF modules from managed runtime source path when installed, otherwise falls back to stubs.
- `friendlynode.controller.runtime_manager.RuntimeManager` manages selectable runtimes under `runtimes/`.
- `friendlynode.config.rns_config_editor` parses/renders the Reticulum `config` file for the visual UI editor.
- `web-ui/assets/js/app.js` is the main UI.
- `web-ui/assets/js/rns_config_editor.js` is the Reticulum config editor UI.

Runtime design:

- RNS can be installed as a managed runtime from PyPI source distribution into `runtimes/rns-<version>/src`.
- Active runtime is selected in `data/config/friendlynode.json` via `engine_name`.
- RNS and LXMF module caches are unloaded before switching managed runtimes.
- Real RNS can run while LXMF still falls back to stub LXMF.
- `RNS.Reticulum(configdir=...)` is passed a string path for Windows compatibility.
- RNS signal handlers are suppressed when Reticulum is started from a non-main HTTP worker thread.

Transport design:

- Current Windows Reticulum config uses TCP interfaces, not BackboneInterface.
- BackboneInterface is Linux-only in upstream RNS and fails on Windows.
- Current Windows config in `data/config/reticulum/config` is a transport node with one TCP server gateway bound to Tailscale and five outgoing TCP clients:
  - `rns.uanode.top:42020`
  - `159.69.7.55:9034`
  - `43.229.63.120:4242`
  - `193.26.158.230:4965`
  - `rns.michmesh.net:7822`
- Remote `mailedge` config is similar but uses LAN TCP gateway `0.0.0.0:4242` and controller `127.0.0.1:8787`.

Announce design:

- RNS announce belongs to a `Destination`, not to an interface.
- FriendlyNode does not patch Reticulum for announces.
- Auto/manual transport announce currently reannounces RNS transport management destinations, for example `rnstransport.probe`.
- Announces are sent through live outgoing leaf interfaces.
- `TCPServerInterface` itself does not transmit outbound data; announces to gateway users must be sent through spawned `TCPInterface[Client on ...]` interfaces when clients are connected.
- Client announce endpoint exists but returns unsupported until FriendlyNode owns a real local LXMF destination/identity.

## 3. Important Files

Rules and handoff:

- `AGENTS.md`
- `SESSION_HANDOFF.md`

Controller:

- `friendlynode/controller/main.py`
- `friendlynode/controller/http_server.py`
- `friendlynode/controller/app.py`
- `friendlynode/controller/engine_supervisor.py`
- `friendlynode/controller/runtime_manager.py`
- `friendlynode/controller/access.py`
- `friendlynode/controller/state_cache.py`

Engine:

- `friendlynode/engine/engine_main.py`
- `friendlynode/engine/rns_runtime.py`
- `friendlynode/engine/announce_handlers.py`
- `friendlynode/engine/events.py`
- `friendlynode/engine/ipc.py`

Config:

- `friendlynode/config/app_config.py`
- `friendlynode/config/defaults.py`
- `friendlynode/config/rns_config_editor.py`
- `data/config/friendlynode.json`
- `data/config/reticulum/config`

Client/account storage:

- `friendlynode/client_accounts.py`
- `data/clients/`

UI:

- `web-ui/index.html`
- `web-ui/assets/js/app.js`
- `web-ui/assets/js/rns_config_editor.js`
- `web-ui/assets/js/micron_renderer.js`
- `web-ui/assets/js/micron_palette.js`
- `web-ui/assets/js/micron_iconpack.js`
- `web-ui/assets/css/app.css`

Runtimes:

- `runtimes/rns-1.2.5/runtime.json`
- `runtimes/rns-1.2.5/src/RNS/...`
- `runtimes/stub/`

Remote:

- `/home/adminus/projects/poligone-test`
- `/home/adminus/projects/poligone-test/data/config/friendlynode.json`
- `/home/adminus/projects/poligone-test/data/config/reticulum/config`
- `/home/adminus/projects/poligone-test/data/logs/controller.pid`
- `/home/adminus/projects/poligone-test/data/logs/controller.out`
- `/home/adminus/projects/poligone-test/data/logs/controller.err`

## 4. Files Already Changed In This Workstream

Current handoff was created after user said they already committed/pushed some work. At the time this file was recreated, `git status --short` showed:

```text
D AGENTS_continue.md
D SESSION_HANDOFF.md
```

`SESSION_HANDOFF.md` was missing and is now recreated by this handoff step. Do not assume the `AGENTS_continue.md` deletion was made by the current assistant.

Important implemented changes from the recent workstream include:

- `friendlynode/controller/app.py`
  - Runtime install/select/feature flow.
  - Security/access status improvements.
  - `make_announce()` API bridge.
- `friendlynode/controller/http_server.py`
  - Runtime endpoints.
  - `/api/reticulum/announce`.
  - Forwarded proto/HTTPS security assessment.
- `friendlynode/controller/runtime_manager.py`
  - Managed Reticulum release install.
  - RNS `1.2.5` recommended and `1.2.6` PyPI-only/unverified catalog.
  - Runtime feature handling for `rngit`.
  - Physical removal/restoration of optional `rngit` files from managed runtime source.
- `friendlynode/controller/engine_supervisor.py`
  - `make_announce()` delegation.
- `friendlynode/engine/engine_main.py`
  - `make_announce()` delegation.
- `friendlynode/engine/rns_runtime.py`
  - Real RNS + stub LXMF split loading.
  - Runtime module unload before switch.
  - Windows path fix for `configdir`.
  - Non-main-thread signal suppression.
  - Live interface status.
  - Auto/manual transport announce tracking.
- `friendlynode/engine/announce_handlers.py`
  - Fixed RNS 1.2.5 announce handler signature by accepting `announce_packet_hash` and `is_path_response`.
- `web-ui/assets/js/app.js`
  - Runtime selector and install UI.
  - Runtime feature UI.
  - Interface status integration.
  - Client menu `Make Annonce` placeholder.
- `web-ui/assets/js/rns_config_editor.js`
  - Interface live announce table.
  - `Make Annonce` button.
  - Interface field order adjusted.
- `web-ui/assets/css/app.css`
  - UI styles for announce panel/table.
- `data/config/reticulum/config`
  - Windows test transport config with TCP gateway and outgoing peers.

## 5. Decisions Already Made

- Do not patch upstream Reticulum unless explicitly required. Current integration works through public RNS APIs and managed source installation.
- Use Reticulum `1.2.5` as recommended stable baseline. `1.2.6` exists on PyPI but was treated as unverified/PyPI-only because the user saw GitHub latest as `1.2.5`.
- Runtime installation should be user-friendly: pick release in UI, confirm, files are replaced automatically.
- Managed runtime install removes other managed Reticulum runtimes after installing the selected release.
- Optional `rngit` should be disabled by default and physically removable/restorable. Most users do not need it.
- BackboneInterface is not usable on Windows. Use `TCPServerInterface` as gateway on Windows/Tailscale or LAN.
- For transport reannounce, send local transport management destinations through online outgoing leaf interfaces.
- For a TCP gateway, do not announce to the parent `TCPServerInterface`; announce to spawned connected client interfaces.
- FriendlyNode cannot announce a foreign MeshChat/LXMF client destination. Only the owner of a destination identity can sign a valid announce.
- Client announce will remain unsupported until FriendlyNode creates/loads a real local LXMF destination.
- Keep changes small and reviewable. Avoid broad refactors.

## 6. What Not To Change

Do not:

- Commit automatically.
- Push automatically.
- Use `sudo`.
- Use `systemctl`, `service`, reboot, shutdown.
- Edit `/etc/reticulum`, `/etc/reticulum-rttr`, `/etc/systemd/system`, `/etc/nginx`, sudoers, or OS configs.
- Edit files outside `/home/adminus/projects/poligone-test` on `mailedge`.
- Replace the current controller/engine/runtime architecture without explicit instruction.
- Patch upstream RNS source just to work around FriendlyNode integration bugs.
- Re-enable `rngit` by default.
- Assume BackboneInterface works on Windows.
- Treat current client accounts as real LXMF clients; they are still storage/UI scaffolding.
- Hide limitations by making UI buttons appear successful when the underlying destination does not exist.

## 7. Nearest Next Task

Recommended next engineering task:

Implement real FriendlyNode client identity and LXMF destination lifecycle.

Concrete first slice:

- Load or create persistent RNS identity per enabled client account.
- Create local LXMF delivery destination/router for that client.
- Wire client `Make Annonce` to announce its real LXMF destination.
- Store actual identity/destination hashes from RNS/LXMF, not random placeholder hashes.
- Add receive callback path into `ClientAccountStore` conversations/messages.
- Only after that, wire real outbound LXMF message sending.

Why this is next:

- Transport now works and can see the world.
- Auto/manual transport reannounce exists.
- The remaining gap for user-visible chat reliability is that FriendlyNode does not yet own and announce real client destinations.

## 8. How To Run On Windows

Working directory:

```powershell
cd E:\proj\git_world\poligone
```

Start controller normally:

```powershell
python -m friendlynode.controller.main
```

If using PyCharm, run module:

```text
friendlynode.controller.main
```

Expected URL depends on `data/config/friendlynode.json`. Recent Windows runs used:

```text
http://100.83.143.90:8787/
```

or localhost, depending on controller bind config.

Quick syntax checks:

```powershell
python -m py_compile friendlynode\engine\rns_runtime.py friendlynode\engine\engine_main.py friendlynode\controller\engine_supervisor.py friendlynode\controller\app.py friendlynode\controller\http_server.py
node --check web-ui\assets\js\rns_config_editor.js
node --check web-ui\assets\js\app.js
```

Quick local API smoke with real RNS may need unrestricted network permissions because outbound TCP peers are contacted:

```powershell
python -c "from friendlynode.controller.app import ControllerApp; app=ControllerApp(); app.start(); print(app.engine_supervisor.status()['rns']['announce']); print(app.make_announce({'target':'transport'})); app.stop()"
```

## 9. How To Run And Check On Orange Pi `mailedge`

SSH:

```powershell
ssh -i C:\Users\adminus\.ssh\orange_adminus_ed25519 adminus@192.168.88.195
```

Remote working directory:

```bash
cd /home/adminus/projects/poligone-test
```

Start controller manually:

```bash
cd /home/adminus/projects/poligone-test
mkdir -p data/logs
nohup python3 -m friendlynode.controller.main > data/logs/controller.out 2> data/logs/controller.err < /dev/null &
echo $! > data/logs/controller.pid
```

Stop previous manually started controller:

```bash
cd /home/adminus/projects/poligone-test
kill "$(cat data/logs/controller.pid)"
```

Check remote HTTP status:

```bash
curl http://127.0.0.1:8787/api/status
```

Check Reticulum manual transport announce:

```bash
curl -s -X POST http://127.0.0.1:8787/api/reticulum/announce \
  -H 'Content-Type: application/json' \
  --data-binary '{"target":"transport"}'
```

Check logs:

```bash
wc -c data/logs/controller.err
tail -80 data/logs/controller.err
tail -80 data/logs/controller.out
```

Windows SSH tunnel to browse remote UI:

```powershell
ssh -i C:\Users\adminus\.ssh\orange_adminus_ed25519 -N -L 18787:127.0.0.1:8787 adminus@192.168.88.195
```

Then open:

```text
http://127.0.0.1:18787/
```

Recent remote state before handoff:

- Files were synced to `/home/adminus/projects/poligone-test`.
- Controller was restarted manually.
- PID was `3901` at that time.
- `/api/status` returned `200`.
- `/api/reticulum/announce` returned `status: ok`, `sent: 5`.
- `data/logs/controller.err` was `0` bytes.

If power was lost, assume the manually started process is gone and repeat the start command.

## 10. Known Errors, Limits And Open Questions

Known limitations:

- FriendlyNode client accounts are not real LXMF clients yet.
- `Make Annonce` for client returns unsupported until real local LXMF destination exists.
- Outbound/inbound LXMF message send/receive is not wired into real LXMF.
- NomadNet remote page fetch is still stubbed.
- Local NomadNet publisher is not wired.
- RNS known destinations once logged `InsufficientDataException` while loading local known destinations and said the file would be recreated on exit. Monitor if it repeats.
- Windows cannot use upstream BackboneInterface; use TCP server/client config.
- `TCPServerInterface` parent cannot send outgoing announce packets; spawned client interfaces must be used.
- Remote `mailedge` has no system service/autostart by design. Startup is manual `nohup`.
- Security assessment trusts localhost, HTTPS/forwarded HTTPS from loopback, private LAN, and Tailscale `100.64.0.0/10` logic; review if public browser access is added.
- `announce_interval` in FriendlyNode auto reannounce is currently interpreted as seconds for FriendlyNode throttling. Upstream Reticulum uses `announce_interval` for discoverable interface announcements in minutes with a minimum in that path. This mismatch should be reviewed before exposing it as a final UX concept.

Open questions:

- Should FriendlyNode create one client RNS identity per account, or allow importing an existing LXMF identity/config?
- Should FriendlyNode run isolated client Reticulum instances, or only shared local destinations inside the main transport instance first?
- How should MeshChat/external clients be asked to reannounce after reconnect? Generic Reticulum does not allow FriendlyNode to sign announces for foreign destinations.
- Should transport auto reannounce update RNS `Transport.last_mgmt_announce`, or stay independent from upstream's 2-hour management announce timer?
- Should the UI expose per-interface manual announce, or keep a single all-transport button until there are many interfaces?
- Should remote management be enabled for FriendlyNode transport, and how should management ACL identity be configured?

## 11. Recommended First Prompt For New Session

Use this prompt exactly:

```text
Прочитай AGENTS.md и SESSION_HANDOFF.md в E:\proj\git_world\poligone.
Чат держи на русском, комментарии в коде только на английском.
Не делай git commit и git push.
Не трогай системные конфиги и запрещённые пути из AGENTS.md.
Сначала кратко перескажи текущее состояние FriendlyNode и ближайшую следующую задачу.
Потом сделай минимальный следующий шаг: начать реализацию реального FriendlyNode client identity + LXMF destination lifecycle, чтобы client Make Annonce мог объявлять настоящий LXMF destination, а не возвращать unsupported.
Перед правками перечитай актуальные файлы, не полагайся на память.
Для проверки можно использовать Windows sandbox и mailedge:/home/adminus/projects/poligone-test без отдельного запроса, но не используй sudo/systemctl/service.
```
