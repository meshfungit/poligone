const tabs = ["Client", "Messages", "Peers", "NomadNet", "Interfaces", "Transport", "Logs", "Settings"];

let currentStatus = null;
let clientEditorState = null;

const rows = {
  Client: [
    ["Name", "Identity", "LXMF destination", "Runtime", "Enabled"],
    ["Default Client", "-", "-", "shared", "no"],
  ],
  Messages: [
    ["Peer", "Hash", "Last message", "Unread", "Hops", "Status"],
    ["stub-peer", "001122...", "No messages yet", "0", "-", "offline"],
  ],
  Peers: [
    ["Name", "Destination", "Aspect", "Hops", "Last announce"],
    ["stub-peer", "001122...", "lxmf.delivery", "-", "never"],
  ],
  NomadNet: [
    ["Node", "Hash", "Hops", "Last seen", "Action"],
    ["local stub", "aabbcc...", "-", "never", "Open"],
  ],
  Interfaces: [
    ["Name", "Type", "Enabled", "Mode", "RX", "TX", "Error"],
    ["Local Auto", "AutoInterface", "no", "stub", "0", "0", ""],
  ],
  Transport: [
    ["Field", "Value"],
    ["Runtime", "stub"],
    ["RNS", "stub-rns"],
    ["LXMF", "stub-lxmf"],
    ["Engine", "not connected"],
  ],
  Logs: [
    ["Time", "Level", "Source", "Message"],
    ["-", "info", "ui", "FriendlyNode UI loaded"],
  ],
  Settings: [
    ["Setting", "Value"],
    ["Runtime selection", "stub"],
    ["Custom interfaces", "custom_interfaces/"],
  ],
};

function renderNav(active) {
  const nav = document.querySelector("nav");
  nav.innerHTML = "";

  for (const tab of tabs) {
    const button = document.createElement("button");
    button.textContent = tab;
    button.className = tab === active ? "active" : "";
    button.onclick = () => render(tab);
    nav.appendChild(button);
  }
}

function renderTable(tab) {
  const data = rows[tab];
  const [header, ...bodyRows] = data;

  const table = document.createElement("table");

  const thead = document.createElement("thead");
  const tr = document.createElement("tr");

  for (const cell of header) {
    const th = document.createElement("th");
    th.textContent = cell;
    tr.appendChild(th);
  }

  thead.appendChild(tr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  for (const row of bodyRows) {
    const bodyTr = document.createElement("tr");

    for (const cell of row) {
      const td = document.createElement("td");
      td.textContent = cell;
      bodyTr.appendChild(td);
    }

    tbody.appendChild(bodyTr);
  }

  table.appendChild(tbody);
  return table;
}

function renderClient() {
  const wrapper = document.createElement("div");
  const block = document.createElement("section");
  block.className = "settings-block";

  const title = document.createElement("h2");
  title.textContent = "Client";
  block.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "Client accounts are separate from transport settings. LXMF startup is not wired yet.";
  block.appendChild(hint);

  const clientsData = currentStatus?.clients || {};
  const clients = Array.isArray(clientsData.clients) ? clientsData.clients : [];

  const actionRow = document.createElement("div");
  actionRow.className = "settings-row client-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "AddClient";
  addButton.onclick = openNewClientEditor;
  actionRow.appendChild(addButton);
  block.appendChild(actionRow);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  for (const heading of ["Name", "Identity", "LXMF destination", "Runtime", "Enabled", "Actions"]) {
    const th = document.createElement("th");
    th.textContent = heading;
    headerRow.appendChild(th);
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  if (clients.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.textContent = "No client accounts loaded";
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  for (const client of clients) {
    const row = document.createElement("tr");

    for (const value of [
      client.display_name || client.id || "-",
      client.identity_hash || "-",
      client.lxmf_destination_hash || "-",
      client.runtime_mode || "-",
      client.enabled ? "yes" : "no",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    const actions = document.createElement("td");
    actions.className = "client-row-actions";

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.onclick = () => openClientEditor(client);
    actions.appendChild(editButton);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => removeClient(client);
    actions.appendChild(removeButton);

    row.appendChild(actions);
    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  block.appendChild(table);
  wrapper.appendChild(block);

  if (clientEditorState !== null) {
    wrapper.appendChild(renderClientEditor());
  }

  return wrapper;
}

function renderSettings() {
  const wrapper = document.createElement("div");

  const runtimeBlock = document.createElement("section");
  runtimeBlock.className = "settings-block";

  const title = document.createElement("h2");
  title.textContent = "Runtime";
  runtimeBlock.appendChild(title);

  const runtime = currentStatus?.runtime || {};
  const activeRuntime = runtime.active || "stub";
  const availableRuntimes = Array.isArray(runtime.available) ? runtime.available : [];

  const row = document.createElement("div");
  row.className = "settings-row";

  const select = document.createElement("select");
  select.id = "runtime-select";

  for (const item of availableRuntimes) {
    const option = document.createElement("option");
    option.value = item.name;
    option.textContent = `${item.name} — ${item.label || item.kind || "runtime"}`;

    if (item.name === activeRuntime) {
      option.selected = true;
    }

    select.appendChild(option);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.id = "select-runtime";
  button.textContent = "Apply runtime";
  button.onclick = selectRuntimeFromUi;

  row.appendChild(select);
  row.appendChild(button);
  runtimeBlock.appendChild(row);

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "Changing runtime saves controller config and restarts the Reticulum engine.";
  runtimeBlock.appendChild(hint);

  wrapper.appendChild(runtimeBlock);

  if (window.FriendlyNodeRnsConfigEditor !== undefined) {
  wrapper.appendChild(window.FriendlyNodeRnsConfigEditor.render());
    }

  wrapper.appendChild(renderTable("Settings"));
  return wrapper;
}

function render(tab = "Messages") {
  renderNav(tab);

  document.querySelector("h1").textContent = tab;

  const content = document.querySelector("#content");
  content.innerHTML = "";

  if (tab === "Settings") {
    content.appendChild(renderSettings());
    return;
  }

  if (tab === "Client") {
    content.appendChild(renderClient());
    return;
  }

  content.appendChild(renderTable(tab));
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element !== null) {
    element.textContent = value;
  }
}

function updateSummaryCards(status) {
  const engine = status.engine || {};
  const rns = engine.rns || {};
  const engineRuntime = engine.runtime || {};
  const logs = Array.isArray(status.logs) ? status.logs : [];
  const runtime = status.runtime || {};
  const availableRuntimes = Array.isArray(runtime.available) ? runtime.available : [];

  setText("#engine-status", engine.running ? "engine: running" : "engine: stopped");

  const cards = document.querySelectorAll(".card .value");

  if (cards.length >= 4) {
    cards[0].textContent = rns.using_stubs ? "stub runtime" : "native runtime";
    cards[1].textContent = rns.running ? "running" : "stopped";
    cards[2].textContent = "0";
    cards[3].textContent = "0";
  }

  rows.Transport = [
    ["Field", "Value"],
    ["Controller", status.controller?.running ? "running" : "stopped"],
    ["Engine", engine.running ? "running" : "stopped"],
    ["RNS", rns.running ? "running" : "stopped"],
    ["Using stubs", String(Boolean(rns.using_stubs))],
    ["Active runtime", runtime.active || "-"],
    ["Runtime count", String(availableRuntimes.length)],
    ["Engine runtime name", engineRuntime.name || "-"],
    ["Engine runtime python", engineRuntime.python_path || "-"],
    ["Engine runtime source", engineRuntime.source_path || "-"],
    ["RNS version", rns.rns_version || "-"],
    ["LXMF version", rns.lxmf_version || "-"],
    ["Config dir", rns.config_dir || "-"],
    ["Web root", status.controller?.web_root || "-"],
  ];

  rows.Settings = [
    ["Setting", "Value"],
    ["Active runtime", runtime.active || "-"],
    ["Runtime count", String(availableRuntimes.length)],
    ...availableRuntimes.map((item) => [
      item.name || "-",
      `${item.label || "-"} | kind=${item.kind || "-"} | enabled=${String(Boolean(item.enabled))} | python=${item.python_path || "-"}`,
    ]),
  ];

  const clients = Array.isArray(status.clients?.clients) ? status.clients.clients : [];
  rows.Client = [
    ["Name", "Identity", "LXMF destination", "Runtime", "Enabled"],
    ...clients.map((client) => [
      client.display_name || client.id || "-",
      client.identity_hash || "-",
      client.lxmf_destination_hash || "-",
      client.runtime_mode || "-",
      client.enabled ? "yes" : "no",
    ]),
  ];

  rows.Logs = [
    ["Time", "Level", "Source", "Message"],
    ...logs
      .slice()
      .reverse()
      .map((record) => [
        record.time || "-",
        record.level || "-",
        record.source || "-",
        record.message || "-",
      ]),
  ];
}

function getActiveTab() {
  return document.querySelector("nav button.active")?.textContent || "Messages";
}

async function fetchStatus() {
  const response = await fetch("/api/status", {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Status request failed: HTTP ${response.status}`);
  }

  currentStatus = await response.json();
  updateSummaryCards(currentStatus);

  const activeTab = getActiveTab();

  if (activeTab === "Client" || activeTab === "Transport" || activeTab === "Logs" || activeTab === "Settings") {
    render(activeTab);
  }
}

async function restartReticulum() {
  const button = document.querySelector("#restart-reticulum");

  if (button !== null) {
    button.disabled = true;
    button.textContent = "Restarting...";
  }

  try {
    const response = await fetch("/api/reticulum/restart", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Restart request failed: HTTP ${response.status}`);
    }

    currentStatus = await response.json();
    updateSummaryCards(currentStatus);

    const activeTab = getActiveTab();

    if (activeTab === "Client" || activeTab === "Transport" || activeTab === "Logs" || activeTab === "Settings") {
      render(activeTab);
    }
  } catch (error) {
    appendUiError(error);
    render("Logs");
  } finally {
    if (button !== null) {
      button.disabled = false;
      button.textContent = "Restart Reticulum";
    }
  }
}

async function selectRuntimeFromUi() {
  const select = document.querySelector("#runtime-select");
  const button = document.querySelector("#select-runtime");

  if (select === null) {
    return;
  }

  if (button !== null) {
    button.disabled = true;
    button.textContent = "Applying...";
  }

  try {
    const response = await fetch("/api/runtime/select", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: select.value,
      }),
    });

    if (!response.ok) {
      throw new Error(`Runtime selection failed: HTTP ${response.status}`);
    }

    currentStatus = await response.json();
    updateSummaryCards(currentStatus);
    render("Settings");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  } finally {
    if (button !== null) {
      button.disabled = false;
      button.textContent = "Apply runtime";
    }
  }
}

async function openNewClientEditor() {
  try {
    const response = await fetch("/api/clients/draft", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Client draft request failed: HTTP ${response.status}`);
    }

    clientEditorState = await response.json();
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

function openClientEditor(client) {
  clientEditorState = { ...client };
  render("Client");
}

async function saveClientFromEditor() {
  if (clientEditorState === null) {
    return;
  }

  try {
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(clientEditorState),
    });

    if (!response.ok) {
      throw new Error(`Client save failed: HTTP ${response.status}`);
    }

    clientEditorState = null;
    await fetchStatus();
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

async function removeClient(client) {
  const clientId = client.id || "";

  if (clientId === "" || !window.confirm(`Remove client ${client.display_name || clientId}?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Client remove failed: HTTP ${response.status}`);
    }

    await fetchStatus();
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

function renderClientEditor() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor";

  const title = document.createElement("h2");
  title.textContent = "Client editor";
  dialog.appendChild(title);

  dialog.appendChild(
    renderClientEditorField("Display name", "display_name", "text")
  );
  dialog.appendChild(
    renderClientEditorField("Client id", "id", "text", true)
  );
  dialog.appendChild(
    renderClientEditorField("Identity hash", "identity_hash", "text", true)
  );
  dialog.appendChild(
    renderClientEditorField("LXMF destination hash", "lxmf_destination_hash", "text", true)
  );

  const runtimeField = document.createElement("label");
  runtimeField.className = "rns-field";

  const runtimeLabel = document.createElement("span");
  runtimeLabel.textContent = "Runtime mode";
  runtimeField.appendChild(runtimeLabel);

  const runtimeSelect = document.createElement("select");
  const runtimeModes = currentStatus?.clients?.schema?.runtime_modes || ["shared", "isolated"];

  for (const mode of runtimeModes) {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode;

    if (clientEditorState.runtime_mode === mode) {
      option.selected = true;
    }

    runtimeSelect.appendChild(option);
  }

  runtimeSelect.onchange = () => {
    clientEditorState.runtime_mode = runtimeSelect.value;
  };
  runtimeField.appendChild(runtimeSelect);
  dialog.appendChild(runtimeField);

  const enabledField = document.createElement("label");
  enabledField.className = "rns-boolean-line";

  const enabledLabel = document.createElement("span");
  enabledLabel.textContent = "Enable client";
  enabledField.appendChild(enabledLabel);

  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  enabledInput.checked = Boolean(clientEditorState.enabled);
  enabledInput.onchange = () => {
    clientEditorState.enabled = enabledInput.checked;
  };
  enabledField.appendChild(enabledInput);
  dialog.appendChild(enabledField);

  dialog.appendChild(
    renderClientEditorField("External config path", "config_path", "text")
  );

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.onclick = saveClientFromEditor;
  actions.appendChild(saveButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.onclick = () => {
    clientEditorState = null;
    render("Client");
  };
  actions.appendChild(cancelButton);

  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  return overlay;
}

function renderClientEditorField(labelText, key, type = "text", readonly = false) {
  const field = document.createElement("label");
  field.className = "rns-field";

  const label = document.createElement("span");
  label.textContent = labelText;
  field.appendChild(label);

  const input = document.createElement("input");
  input.type = type;
  input.value = clientEditorState?.[key] === undefined || clientEditorState?.[key] === null
    ? ""
    : String(clientEditorState[key]);
  input.readOnly = readonly;
  input.oninput = () => {
    clientEditorState[key] = input.value;
  };
  field.appendChild(input);
  return field;
}

function appendUiError(error) {
  rows.Logs.unshift([
    new Date().toISOString(),
    "error",
    "ui",
    error instanceof Error ? error.message : String(error),
  ]);
}

document.addEventListener("DOMContentLoaded", () => {
  render();

  const restartButton = document.querySelector("#restart-reticulum");

  if (restartButton !== null) {
    restartButton.addEventListener("click", restartReticulum);
  }

  fetchStatus().catch((error) => {
    appendUiError(error);
    render("Logs");
  });
});
window.render = render;
