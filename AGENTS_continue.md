# AGENTS.md — FriendlyNode / Reticulum Desktop Client

## Project

FriendlyNode is an alternative Reticulum desktop/web client.

The goal is not to clone MeshChat. The goal is a lightweight, table/list based client for:

- LXMF chat later
- NomadNet browsing later
- Reticulum runtime management
- visual Reticulum config editing
- local desktop use
- headless/server use through a web UI

Repository:

```text
E:\proj\git_world\poligone
https://github.com/meshfungit/poligone
```

Current known good commit at the time this context was written:

```text
4ae1b00a71e6c5703299df35faf3f1b94d3da4c8
```

If the repository has newer commits, inspect the current `main` and treat this commit as context, not as a rollback target.

Local Python environment:

```text
E:\proj\git_world\poligone\.venv\Scripts\python.exe
Python 3.14.4
```

Run configuration:

```text
Module name: friendlynode.controller.main
Working directory: E:\proj\git_world\poligone
Interpreter: E:\proj\git_world\poligone\.venv\Scripts\python.exe
```

Manual run from cmd:

```cmd
cd /d E:\proj\git_world\poligone
.venv\Scripts\activate.bat
python -m friendlynode.controller.main
```

Expected startup:

```text
FriendlyNode controller listening on http://127.0.0.1:8787/
```

Main UI:

```text
http://127.0.0.1:8787/
```

Useful APIs:

```text
GET  http://127.0.0.1:8787/api/status
GET  http://127.0.0.1:8787/api/config
GET  http://127.0.0.1:8787/api/runtimes
GET  http://127.0.0.1:8787/api/rns-config
POST http://127.0.0.1:8787/api/reticulum/restart
POST http://127.0.0.1:8787/api/runtime/select
POST http://127.0.0.1:8787/api/rns-config
```

## Hard project rules

- Do not use ISPConfig suggestions.
- Do not modify files through `tee`, `echo > file`, heredocs, or shell-generated file rewrites.
- When editing project files, use normal editor-style edits. The user usually edits in PyCharm.
- When giving terminal commands, do not use Linux line continuations with backslash. Put each command on one line.
- Do not create random backup folders. If backup is ever needed, use `/home/user/backup`.
- For this Windows project, do not add `.venv` or generated local data to Git.
- Do not hardcode defaults deep inside functions when they are real defaults. Put defaults at module top or in schema/default objects.
- Avoid circular changes. Before suggesting a change, check whether the same value/change was already tried.
- Do not guess file locations. Use exact paths and exact function/block names.
- When replacing partial code, provide complete functions or clearly bounded blocks.
- Keep changes small and sequential. One logical layer per commit.

## Git state

History was cleaned. Current `main` is the active branch.

Remote branch `fresh-main` was deleted.

GitHub should have:

```text
main
origin/main
```

The local runtime config must not be committed.

Make sure `.gitignore` covers:

```gitignore
.venv/
.venv-*/
venv/

data/config/friendlynode.json
data/config/reticulum/
data/db/
data/logs/
data/identities/
data/attachments/
data/nomadnet-pages/
```

Before committing, check:

```cmd
git status --short
```

Generated local files that should not be committed:

```text
E:\proj\git_world\poligone\data\config\friendlynode.json
E:\proj\git_world\poligone\data\config\reticulum\config
E:\proj\git_world\poligone\.venv\
```

## Architecture

Current architecture:

```text
web-ui
  -> HTTP API
    -> controller
      -> engine supervisor
        -> in-process stub RNS runtime for now
```

Target architecture:

```text
Browser / WebView
  -> Controller API
    -> Engine supervisor
      -> selected Reticulum runtime
```

Important principle:

- UI must stay alive when Reticulum restarts.
- Reticulum runtime must be replaceable without rebuilding UI.
- The controller owns config, runtime selection, logs, and HTTP API.
- The engine is restartable.
- Real Reticulum/LXMF will be added later through runtime manifests.

## Existing directories

```text
friendlynode/
  config/
    app_config.py
    defaults.py
    rns_config_editor.py

  controller/
    app.py
    engine_supervisor.py
    http_server.py
    main.py
    runtime_manager.py
    state_cache.py

  engine/
    announce_handlers.py
    engine_main.py
    events.py
    ipc.py
    lxmf_service.py
    nomadnet_client.py
    nomadnet_host.py
    rns_runtime.py

web-ui/
  index.html
  assets/
    css/app.css
    js/app.js
    js/rns_config_editor.js
    icons/...

runtimes/
  stub/runtime.json

custom_interfaces/
data/
scripts/
```

## Current backend behavior

### Controller

Entry point:

```text
E:\proj\git_world\poligone\friendlynode\controller\main.py
```

Starts:

```text
ControllerApp
ControllerHttpServer
```

HTTP server:

```text
E:\proj\git_world\poligone\friendlynode\controller\http_server.py
```

Known routes:

```text
GET  /api/status
GET  /api/config
GET  /api/runtimes
GET  /api/rns-config
POST /api/reticulum/restart
POST /api/runtime/select
POST /api/rns-config
```

### Runtime manager

File:

```text
E:\proj\git_world\poligone\friendlynode\controller\runtime_manager.py
```

Reads runtime manifests:

```text
E:\proj\git_world\poligone\runtimes\<runtime-name>\runtime.json
```

Current stub runtime:

```text
E:\proj\git_world\poligone\runtimes\stub\runtime.json
```

Expected stub manifest:

```json
{
  "name": "stub",
  "label": "Built-in Stub Runtime",
  "kind": "stub",
  "enabled": true,
  "python": null,
  "source_path": null,
  "description": "Internal placeholder runtime used before real Reticulum is connected."
}
```

### App config

File:

```text
E:\proj\git_world\poligone\friendlynode\config\app_config.py
```

Persistent local config is generated at:

```text
E:\proj\git_world\poligone\data\config\friendlynode.json
```

This file is local state and must not be committed.

### RNS config editor backend

File:

```text
E:\proj\git_world\poligone\friendlynode\config\rns_config_editor.py
```

Responsibilities:

- load visual model from `data/config/reticulum/config`
- save Reticulum config
- expose schema for UI
- expose supported interface types
- expose presets for interface creation

Current supported interface types:

```text
AutoInterface
BackboneInterface
TCPClientInterface
TCPServerInterface
UDPInterface
I2PInterface
PipeInterface
CustomInterface
```

Intentionally not implemented in UI for now:

```text
KISSInterface
AX25KISSInterface
RNodeInterface
RNodeMultiInterface
SerialInterface
```

Those may exist in real Reticulum, but this client is intentionally scoped down.

### RNS runtime

File:

```text
E:\proj\git_world\poligone\friendlynode\engine\rns_runtime.py
```

Must contain:

```python
class RnsRuntime:
```

This file must not contain config defaults. There was already one accidental file swap between `defaults.py` and `rns_runtime.py`. Do not repeat it.

Current behavior:

- loads real RNS/LXMF only if `runtime_source_path` exists and imports work
- otherwise uses stubs
- publishes engine events
- returns status with:

```text
running
using_stubs
config_dir
runtime_source_path
rns_version
lxmf_version
```

Stub versions:

```text
stub-rns
stub-lxmf
```

## Current frontend behavior

Main JS:

```text
E:\proj\git_world\poligone\web-ui\assets\js\app.js
```

RNS config editor JS:

```text
E:\proj\git_world\poligone\web-ui\assets\js\rns_config_editor.js
```

CSS:

```text
E:\proj\git_world\poligone\web-ui\assets\css\app.css
```

HTML:

```text
E:\proj\git_world\poligone\web-ui\index.html
```

`index.html` uses relative paths:

```html
<script src="assets/js/rns_config_editor.js"></script>
<script src="assets/js/app.js"></script>
```

Do not replace them with absolute `/assets/...` unless the whole static path policy is intentionally changed.

### UI sections

Left sidebar:

```text
Messages
Peers
NomadNet
Interfaces
Transport
Logs
Settings
```

Below Settings:

```text
engine: running/stopped
Restart Reticulum
```

### Settings currently contains

Runtime block:

```text
Runtime
[select runtime] [Apply runtime]
```

Reticulum config editor:

```text
Reticulum config
Config dir
Config file

[reticulum]
fields

[interfaces]
new interface type selector
Outgoing checkbox
Add interface button

interface cards
Save Reticulum config
Reload from disk
```

Settings summary table below.

### RNS config editor UI rules

The editor must remain mobile-friendly.

Do not use multi-column grids for fields. Keep fields stacked vertically.

Boolean fields should be:

```text
Label                         [checkbox]
```

Text/select/integer fields should be:

```text
Label
[input/select]
```

Interface card order should remain:

```text
[[InterfaceName]]
Enabled [checkbox]

Remove

Common fields
Section name
[input]

Interface type
[select]

Mode
[select]

Outgoing [checkbox]

...
```

Do not go back to dense row layout like:

```text
Section name [input] Interface type [select] Enabled [checkbox]
```

That layout was rejected.

### Add interface behavior

The add interface panel should contain:

```text
New interface type
[select]

Outgoing [checkbox]

Add interface
```

Default add type:

```text
BackboneInterface
```

New interface default values are now expected to come from backend schema:

```text
schema.interface_presets
```

Do not hardcode presets in JS again.

Expected Backbone preset:

```json
{
  "mode": "boundary",
  "bitrate": 128000,
  "announce_interval": 15,
  "outgoing": true
}
```

New interface name format:

```text
OutgoingBackboneInterfaceNew
IncomingBackboneInterfaceNew
```

If duplicate, append a number:

```text
OutgoingBackboneInterfaceNew2
```

After adding an interface, UI should scroll to the newly added card.

## Known working checks

Start server:

```cmd
cd /d E:\proj\git_world\poligone
.venv\Scripts\activate.bat
python -m friendlynode.controller.main
```

Open:

```text
http://127.0.0.1:8787/
```

Check runtime API:

```text
http://127.0.0.1:8787/api/runtimes
```

Check app config API:

```text
http://127.0.0.1:8787/api/config
```

Check RNS config API:

```text
http://127.0.0.1:8787/api/rns-config
```

Restart Reticulum:

```cmd
curl -X POST http://127.0.0.1:8787/api/reticulum/restart
```

Select stub runtime:

```cmd
curl -X POST http://127.0.0.1:8787/api/runtime/select -H "Content-Type: application/json" -d "{\"name\":\"stub\"}"
```

Save RNS config test:

```cmd
curl -X POST http://127.0.0.1:8787/api/rns-config -H "Content-Type: application/json" -d "{\"reticulum\":{\"enable_transport\":false,\"discover_interfaces\":true},\"interfaces\":[{\"name\":\"Local Auto\",\"type\":\"AutoInterface\",\"enabled\":true,\"group_id\":\"friendlynode\"}]}"
```

Expected generated file:

```text
E:\proj\git_world\poligone\data\config\reticulum\config
```

The generated Reticulum config may be somewhat verbose. That is acceptable for now. Do not spend time over-optimizing config prettiness unless requested.

## Immediate next tasks

### Task A: verify backend presets are really in schema

Check:

```text
GET /api/rns-config
```

Must contain:

```text
schema.interface_presets
```

If missing, update:

```text
E:\proj\git_world\poligone\friendlynode\config\rns_config_editor.py
```

Do not put `PRESET_DEFAULTS` back into JS.

### Task B: Save & Restart button

Add next to:

```text
Save Reticulum config
Reload from disk
```

New button:

```text
Save & Restart Reticulum
```

Behavior:

1. POST `/api/rns-config`
2. then POST `/api/reticulum/restart`
3. refresh `/api/status`
4. keep user on Settings
5. show errors in the existing UI log mechanism

Do not automatically restart on plain Save.

### Task C: prepare real Reticulum runtime manifest

Later create a new runtime directory such as:

```text
E:\proj\git_world\poligone\runtimes\rns-local\
```

Manifest shape:

```json
{
  "name": "rns-local",
  "label": "Local Reticulum checkout",
  "kind": "external",
  "enabled": true,
  "python": null,
  "source_path": "src",
  "description": "Local Reticulum/LXMF source checkout."
}
```

The real source layout must be checked before implementation.

Do not assume whether `source_path` should point to a parent folder, `Reticulum`, or a folder containing `RNS`. Verify by imports.

### Task D: no real RNS startup yet unless requested

Before enabling real Reticulum, inspect expected import layout and config requirements. Current stub mode must remain stable.

## Design direction

UI should be flat, list/table based, no animated graph, no moving visualizer.

No heavy network visualizer like MeshChat.

Main priority:

- readable diagnostics
- stable lifecycle
- restartable Reticulum engine
- compact but detailed tables
- mobile-compatible Settings editor
- replaceable RNS runtime
- future NomadNet browser

## Avoid

Do not add audio calls.

Do not add animated network graph.

Do not add all Reticulum interface types at once.

Do not pull RNS/LXMF from pip into project requirements yet.

Do not pin `rns>=...` in `requirements.txt`.

Do not add `.venv` or local config/state to Git.

Do not rewrite the project into a framework.

Do not introduce React/Vue unless explicitly requested. Current UI is plain HTML/CSS/JS.

Do not add Electron now. Desktop shell/tray comes later.

## Good commit style

Small commits, example messages:

```text
Add RNS config editor API
Add mobile RNS config editor
Move interface presets into backend schema
Add save and restart config action
Add runtime manifest validation
```

Before each commit:

```cmd
git status --short
```

Run basic smoke test:

```cmd
python -m friendlynode.controller.main
```

Then test in browser:

```text
http://127.0.0.1:8787/
```

## Suggested first Codex prompt

```text
Прочитай AGENTS.md в корне проекта. Не меняй архитектуру крупными кусками. Сначала проверь текущее состояние, затем предложи один маленький следующий diff. Текущая цель: добавить Save & Restart Reticulum в Settings без поломки plain Save.
```
