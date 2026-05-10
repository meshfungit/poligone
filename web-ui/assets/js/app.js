const tabs = ["Messages", "Peers", "NomadNet", "Interfaces", "Transport", "Logs", "Settings"];

let currentStatus = null;

const rows = {
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

  if (activeTab === "Transport" || activeTab === "Logs" || activeTab === "Settings") {
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

    if (activeTab === "Transport" || activeTab === "Logs" || activeTab === "Settings") {
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
