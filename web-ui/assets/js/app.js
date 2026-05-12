const tabs = ["Client", "Peers", "NomadNet", "Interfaces", "Transport", "Logs", "Settings"];

let currentStatus = null;
let clientEditorState = null;
let activeClientId = "";
let activeContactId = "";
let contactMenuState = null;
let contactModalState = null;
let clearMessagesState = null;
const expandedClientDetails = new Set();
let messageDraft = "";

const rows = {
  Client: [
    ["Name", "Identity", "LXMF destination", "Runtime", "Enabled"],
    ["Default Client", "-", "-", "shared", "no"],
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

  const accountList = document.createElement("div");
  accountList.className = "client-accounts-list";

  if (clients.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No client accounts loaded";
    accountList.appendChild(empty);
  }

  for (const client of clients) {
    const card = document.createElement("div");
    card.className = "client-account-card";

    const actions = document.createElement("div");
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

    card.appendChild(actions);

    const summary = document.createElement("div");
    summary.className = "client-account-summary";
    summary.appendChild(renderClientAccountField("Name", client.display_name || client.id || "-"));
    card.appendChild(summary);

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "client-details-toggle";
    detailsButton.textContent = expandedClientDetails.has(client.id) ? "Hide details" : "Show details";
    detailsButton.onclick = () => {
      if (expandedClientDetails.has(client.id)) {
        expandedClientDetails.delete(client.id);
      } else {
        expandedClientDetails.add(client.id);
      }

      render("Client");
    };
    card.appendChild(detailsButton);

    if (expandedClientDetails.has(client.id)) {
      const fields = document.createElement("div");
      fields.className = "client-account-fields";

      for (const [label, value] of [
      ["Identity", client.identity_hash || "-"],
      ["LXMF destination", client.lxmf_destination_hash || "-"],
      ["Runtime", client.runtime_mode || "-"],
      ["Enabled", client.enabled ? "yes" : "no"],
      ]) {
        fields.appendChild(renderClientAccountField(label, value));
      }

      card.appendChild(fields);
    }

    accountList.appendChild(card);
  }

  block.appendChild(accountList);
  wrapper.appendChild(block);
  wrapper.appendChild(renderClientChat(clients));

  if (clientEditorState !== null) {
    wrapper.appendChild(renderClientEditor());
  }

  if (contactMenuState !== null) {
    wrapper.appendChild(renderContactMenu());
  }

  if (contactModalState !== null) {
    wrapper.appendChild(renderContactModal());
  }

  if (clearMessagesState !== null) {
    wrapper.appendChild(renderClearMessagesModal());
  }

  return wrapper;
}

function renderClientAccountField(label, value) {
  const field = document.createElement("div");
  field.className = "client-account-field";

  const fieldLabel = document.createElement("div");
  fieldLabel.className = "client-account-label";
  fieldLabel.textContent = label;
  field.appendChild(fieldLabel);

  const fieldValue = document.createElement("div");
  fieldValue.className = "client-account-value";
  fieldValue.textContent = value;
  field.appendChild(fieldValue);

  return field;
}

function renderClientChat(clients) {
  const section = document.createElement("section");
  section.className = "settings-block client-chat-section";

  const title = document.createElement("h2");
  title.textContent = "Conversations";
  section.appendChild(title);

  if (clients.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "Create a client account to load conversations.";
    section.appendChild(empty);
    return section;
  }

  const activeClient = selectActiveClient(clients);
  const conversations = Array.isArray(activeClient.conversations)
    ? activeClient.conversations
    : [];
  const activeConversation = selectActiveConversation(conversations);
  const activeContact = activeConversation?.contact || null;
  const messages = Array.isArray(activeConversation?.messages)
    ? activeConversation.messages
    : [];

  const accountRow = document.createElement("div");
  accountRow.className = "settings-row client-chat-account-row";

  const accountSelect = document.createElement("select");

  for (const client of clients) {
    const option = document.createElement("option");
    option.value = client.id;
    option.textContent = client.display_name || client.id;

    if (client.id === activeClient.id) {
      option.selected = true;
    }

    accountSelect.appendChild(option);
  }

  accountSelect.onchange = () => {
    activeClientId = accountSelect.value;
    activeContactId = "";
    render("Client");
  };
  accountRow.appendChild(accountSelect);
  section.appendChild(accountRow);

  const layout = document.createElement("div");
  layout.className = "client-chat";
  layout.appendChild(renderMessageThread(activeContact, messages));
  section.appendChild(layout);
  return section;
}

function renderMessageThread(contact, messages) {
  const panel = document.createElement("div");
  panel.className = "client-thread-panel";

  if (contact === null) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "Select a contact";
    panel.appendChild(empty);
    return panel;
  }

  const header = document.createElement("div");
  header.className = "client-thread-header";

  const nameButton = document.createElement("button");
  nameButton.type = "button";
  nameButton.className = "chat-contact-name";
  nameButton.textContent = contact.name || contact.id || "-";
  nameButton.onclick = () => {
    contactModalState = contact;
    render("Client");
  };
  header.appendChild(nameButton);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear messages";
  clearButton.onclick = () => {
    clearMessagesState = contact;
    render("Client");
  };
  header.appendChild(clearButton);
  panel.appendChild(header);

  const list = document.createElement("div");
  list.className = "message-list";

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No messages";
    list.appendChild(empty);
  }

  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = message.direction === "outbound" ? "message-bubble outbound" : "message-bubble inbound";
    bubble.textContent = message.content || "";
    list.appendChild(bubble);
  }

  panel.appendChild(list);
  panel.appendChild(renderMessageComposer(contact));
  return panel;
}

function renderMessageComposer(contact) {
  const composer = document.createElement("form");
  composer.className = "message-composer";
  composer.onsubmit = (event) => {
    event.preventDefault();
    sendMessage(contact);
  };

  const input = document.createElement("textarea");
  input.rows = 1;
  input.placeholder = "Message";
  input.value = messageDraft;
  input.oninput = () => {
    messageDraft = input.value;
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(contact);
    }
  };
  composer.appendChild(input);

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "send-message-button";
  button.title = "Send";
  button.setAttribute("aria-label", "Send message");
  button.innerHTML = '<span aria-hidden="true">➤</span>';
  composer.appendChild(button);

  return composer;
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

function render(tab = "Client") {
  if (tab !== "Client") {
    contactMenuState = null;
  }

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
  return document.querySelector("nav button.active")?.textContent || "Client";
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

function selectActiveClient(clients) {
  if (activeClientId === "" || !clients.some((client) => client.id === activeClientId)) {
    activeClientId = clients[0].id || "";
  }

  return clients.find((client) => client.id === activeClientId) || clients[0];
}

function selectActiveConversation(conversations) {
  if (conversations.length === 0) {
    activeContactId = "";
    return null;
  }

  if (
    activeContactId === ""
    || !conversations.some((conversation) => conversation.contact?.id === activeContactId)
  ) {
    activeContactId = conversations[0].contact?.id || "";
  }

  return conversations.find((conversation) => conversation.contact?.id === activeContactId) || conversations[0];
}

function openContactMenu(contact, x, y) {
  contactMenuState = {
    contact,
    x,
    y,
  };
  render("Client");
}

function renderContactMenu() {
  const overlay = document.createElement("div");
  overlay.className = "contact-menu-dismiss";
  overlay.onclick = () => {
    contactMenuState = null;
    render("Client");
  };

  const menu = document.createElement("div");
  menu.className = "contact-menu";
  menu.style.left = `${contactMenuState.x}px`;
  menu.style.top = `${contactMenuState.y}px`;
  menu.onclick = (event) => {
    event.stopPropagation();
  };

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export";
  exportButton.onclick = () => exportContact(contactMenuState.contact);
  menu.appendChild(exportButton);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear messages";
  clearButton.onclick = () => {
    clearMessagesState = contactMenuState.contact;
    contactMenuState = null;
    render("Client");
  };
  menu.appendChild(clearButton);

  overlay.appendChild(menu);
  return overlay;
}

function renderContactModal() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor contact-modal";

  const title = document.createElement("h2");
  title.textContent = contactModalState.name || contactModalState.id || "Contact";
  dialog.appendChild(title);

  for (const [label, key] of [
    ["Name", "name"],
    ["Destination hash", "destination_hash"],
    ["Identity hash", "identity_hash"],
    ["LXMF address", "lxmf_address"],
    ["Last announce", "last_announce"],
    ["Hops", "hops"],
    ["Path status", "path_status"],
  ]) {
    const row = document.createElement("div");
    row.className = "contact-detail-row";

    const rowLabel = document.createElement("div");
    rowLabel.className = "contact-detail-label";
    rowLabel.textContent = label;
    row.appendChild(rowLabel);

    const rowValue = document.createElement("div");
    rowValue.className = "contact-detail-value";
    rowValue.textContent = String(contactModalState[key] ?? "-");
    row.appendChild(rowValue);
    dialog.appendChild(row);
  }

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export";
  exportButton.onclick = () => exportContact(contactModalState);
  actions.appendChild(exportButton);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.onclick = () => {
    contactModalState = null;
    render("Client");
  };
  actions.appendChild(closeButton);

  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  return overlay;
}

function renderClearMessagesModal() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor clear-messages-modal";

  const title = document.createElement("h2");
  title.textContent = "Clear messages";
  dialog.appendChild(title);

  const name = document.createElement("div");
  name.className = "clear-contact-name";
  name.textContent = clearMessagesState.name || clearMessagesState.id || "-";
  dialog.appendChild(name);

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "Clear";
  clearButton.onclick = clearMessagesForContact;
  actions.appendChild(clearButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.onclick = () => {
    clearMessagesState = null;
    render("Client");
  };
  actions.appendChild(cancelButton);

  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  return overlay;
}

async function clearMessagesForContact() {
  if (clearMessagesState === null || activeClientId === "") {
    return;
  }

  try {
    const response = await fetch(
      `/api/clients/${encodeURIComponent(activeClientId)}/conversations/${encodeURIComponent(clearMessagesState.id)}/messages`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Clear messages failed: HTTP ${response.status}`);
    }

    clearMessagesState = null;
    await fetchStatus();
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

async function exportContact(contact) {
  if (activeClientId === "" || contact === null) {
    return;
  }

  try {
    const response = await fetch(
      `/api/clients/${encodeURIComponent(activeClientId)}/contacts/${encodeURIComponent(contact.id)}/export`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Contact export failed: HTTP ${response.status}`);
    }

    const payload = await response.json();
    contactModalState = payload.contact || contact;
    contactMenuState = null;
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

async function sendMessage(contact) {
  if (activeClientId === "" || contact === null) {
    return;
  }

  const content = messageDraft.trim();

  if (content === "") {
    return;
  }

  try {
    const response = await fetch(
      `/api/clients/${encodeURIComponent(activeClientId)}/conversations/${encodeURIComponent(contact.id)}/messages`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Send message failed: HTTP ${response.status}`);
    }

    messageDraft = "";
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

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (contactMenuState !== null) {
    contactMenuState = null;
    render("Client");
  }
});
window.render = render;
