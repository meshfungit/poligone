const tabs = ["Client", "Announces", "Peers", "NomadNet", "Interfaces", "Transport", "Logs", "Settings"];

let currentStatus = null;
let clientEditorState = null;
let activeClientId = "";
let activeContactId = "";
let contactMenuState = null;
let clientAccountMenuState = null;
let contactModalState = null;
let announceModalState = null;
let clearMessagesState = null;
let transientConversation = null;
let nomadnetBrowserState = null;
let micronSymbolStyle = "system";
let activeNomadNetSection = "Browser";
let nomadnetEditorDraft = "`cFriendlyNode local page\n\nWelcome to a local NomadNet page draft.\n\nSymbols: \u2714 \u26A0 \u267B \u2696 \u2604\n";
let nomadnetEditorPath = "index.mu";
let nomadnetEditorPages = [];
let nomadnetEditorStatus = "";
let nomadnetEditorFileDialog = null;
let nomadnetEditorDialogPath = "";
let nomadnetEditorPaletteOpen = false;
let nomadnetEditorSelection = null;
let nomadnetEditorLinePoints = null;
let nomadnetEditorRawSelection = null;
let showNomadNetEditorUnprintable = false;
const nomadnetBookmarks = new Set();
const collapsedPanels = {
  toolbox: false,
  clientSummary: false,
  clientAccounts: false,
  conversations: false,
  announces: false,
  transportStatus: true,
  settingsAccess: true,
  settingsRuntime: true,
  settingsPaths: true,
  nomadnetBrowserSettings: true,
};
const expandedClientDetails = new Set();
let messageDraft = "";
let symbolPaletteOpen = false;
let symbolPaletteSpacerHeight = 0;
let messageEditorSelection = null;
let showMessageUnprintable = false;
const announceFilters = {
  type: "all",
  name: "",
  identity: "",
  lxmf: "",
  hops: 0,
};

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
  renderToolboxState();
  renderSidebarContacts(active);

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

function renderToolboxState() {
  const aside = document.querySelector("aside");

  if (aside === null) {
    return;
  }

  let button = aside.querySelector(".toolbox-toggle");

  if (button === null) {
    button = document.createElement("button");
    button.type = "button";
    button.className = "toolbox-toggle";
    button.onclick = () => {
      collapsedPanels.toolbox = !collapsedPanels.toolbox;
      renderToolboxState();
    };
    aside.insertBefore(button, aside.firstChild);
  }

  aside.classList.toggle("toolbox-collapsed", collapsedPanels.toolbox);
  button.textContent = collapsedPanels.toolbox ? "Show toolbox" : "Hide toolbox";
}

function renderClientSummaryState(active) {
  const topbar = document.querySelector(".topbar");
  const title = document.querySelector("h1");
  const actions = document.querySelector(".topbar .actions");
  const summary = document.querySelector(".grid");

  if (topbar === null || title === null || actions === null) {
    return;
  }

  actions.innerHTML = "";
  topbar.classList.remove("client-summary-toggle");
  if (summary !== null) {
    summary.classList.toggle("client-summary-collapsed", active === "Client" && collapsedPanels.clientSummary);
  }
  topbar.onclick = null;
  topbar.onkeydown = null;
  topbar.removeAttribute("role");
  topbar.removeAttribute("tabindex");
  title.textContent = active;
}

function renderSidebarContacts(active) {
  const aside = document.querySelector("aside");

  if (aside === null) {
    return;
  }

  const existing = aside.querySelector(".sidebar-client-contacts");

  if (existing !== null) {
    existing.remove();
  }

  if (active !== "Client") {
    return;
  }

  const clientsData = currentStatus?.clients || {};
  const clients = Array.isArray(clientsData.clients) ? clientsData.clients : [];
  const panel = renderClientContactsPanel(clients);
  panel.classList.add("sidebar-client-contacts");

  const engine = aside.querySelector(".sidebar-engine");

  if (engine !== null) {
    engine.insertAdjacentElement("afterend", panel);
    return;
  }

  aside.appendChild(panel);
}

function renderCollapsibleSection(key, titleText) {
  const section = document.createElement("details");
  section.className = "settings-block collapsible-section";
  section.open = !collapsedPanels[key];

  const summary = document.createElement("summary");
  summary.className = "collapsible-header";

  const title = document.createElement("h2");
  const updateTitle = () => {
    title.textContent = `${section.open ? "Hide" : "Show"} ${titleText}`;
  };

  updateTitle();
  summary.appendChild(title);
  section.appendChild(summary);
  section.ontoggle = () => {
    collapsedPanels[key] = !section.open;
    updateTitle();
  };

  return section;
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
  const clientsData = currentStatus?.clients || {};
  const clients = Array.isArray(clientsData.clients) ? clientsData.clients : [];

  const mobileContacts = renderClientContactsPanel(clients);
  mobileContacts.classList.add("mobile-client-contacts");
  wrapper.appendChild(mobileContacts);
  wrapper.appendChild(renderClientChat(clients));

  if (clientEditorState !== null) {
    wrapper.appendChild(renderClientEditor());
  }

  if (contactMenuState !== null) {
    wrapper.appendChild(renderContactMenu());
  }

  if (clientAccountMenuState !== null) {
    wrapper.appendChild(renderClientAccountMenu());
  }

  if (contactModalState !== null) {
    wrapper.appendChild(renderContactModal());
  }

  if (clearMessagesState !== null) {
    wrapper.appendChild(renderClearMessagesModal());
  }

  return wrapper;
}

function renderAnnounces() {
  const wrapper = document.createElement("div");
  const section = renderCollapsibleSection("announces", "Announces");
  section.classList.add("announces-section");
  const announces = Array.isArray(currentStatus?.announces) ? currentStatus.announces : [];
  const count = document.createElement("div");
  count.className = "settings-hint";
  const list = document.createElement("div");
  list.className = "announce-list";
  const refresh = () => renderAnnounceResults(announces, count, list);

  const filters = document.createElement("div");
  filters.className = "announce-filters";

  filters.appendChild(renderAnnounceTypeFilter(refresh));
  filters.appendChild(renderAnnounceTextFilter("Name", "name", refresh));
  filters.appendChild(renderAnnounceTextFilter("Identity", "identity", refresh));
  filters.appendChild(renderAnnounceTextFilter("LXMF", "lxmf", refresh));
  filters.appendChild(renderAnnounceHopsFilter(refresh));
  section.appendChild(filters);
  section.appendChild(count);
  refresh();
  section.appendChild(list);
  wrapper.appendChild(section);

  if (announceModalState !== null) {
    wrapper.appendChild(renderAnnounceModal());
  }

  return wrapper;
}

function renderNomadNet() {
  const wrapper = document.createElement("div");
  wrapper.appendChild(renderNomadNetTabs());

  if (activeNomadNetSection === "Bookmarks") {
    wrapper.appendChild(renderNomadNetBookmarks());
    return wrapper;
  }

  if (activeNomadNetSection === "Publisher") {
    wrapper.appendChild(renderNomadNetPublisher());
    return wrapper;
  }

  if (activeNomadNetSection === "Editor") {
    wrapper.appendChild(renderNomadNetEditor());
    return wrapper;
  }

  wrapper.appendChild(renderNomadNetBrowser());
  return wrapper;
}

function renderNomadNetTabs() {
  const tabs = document.createElement("div");
  tabs.className = "nomadnet-tabs";

  for (const tab of ["Browser", "Bookmarks", "Publisher", "Editor"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = tab === activeNomadNetSection ? "active" : "";
    button.textContent = tab;
    button.onclick = () => {
      activeNomadNetSection = tab;
      render("NomadNet");
    };
    tabs.appendChild(button);
  }

  return tabs;
}

function renderNomadNetBrowser() {
  const block = document.createElement("section");
  block.className = "settings-block nomadnet-browser";

  const title = document.createElement("h2");
  title.textContent = "Browser";
  block.appendChild(title);

  const current = getNomadNetBrowserState();
  const controls = document.createElement("div");
  controls.className = "nomadnet-address-row";

  const destinationField = renderAccessTextInput(
    "Destination hash",
    current.destination_hash || "",
    "NomadNet destination hash",
    (value) => {
      current.destination_hash = value;
    }
  );
  const destinationInput = destinationField.querySelector("input");
  controls.appendChild(destinationField);

  const pathField = renderAccessTextInput("Path", current.path || "/page/index.mu", "/page/index.mu", (value) => {
    current.path = value;
  });
  const pathInput = pathField.querySelector("input");
  controls.appendChild(pathField);
  block.appendChild(controls);

  const actions = document.createElement("div");
  actions.className = "settings-row nomadnet-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.onclick = () => openNomadNetPageFromFields(destinationInput, pathInput, current);
  actions.appendChild(openButton);

  const bookmarkButton = document.createElement("button");
  bookmarkButton.type = "button";
  bookmarkButton.textContent = "Bookmark";
  bookmarkButton.onclick = () => {
    const destination = String(destinationInput?.value || current.destination_hash || "").trim();
    if (destination !== "") {
      nomadnetBookmarks.add(destination);
      render("NomadNet");
    }
  };
  actions.appendChild(bookmarkButton);
  block.appendChild(actions);
  block.appendChild(renderNomadNetBrowserSettings());

  const details = document.createElement("div");
  details.className = "settings-compact-grid";

  for (const [label, value] of [
    ["Name", current.name || "-"],
    ["Destination", current.destination_hash || "-"],
    ["Identity", current.identity_hash || "-"],
    ["Hops", current.hops ?? "-"],
    ["Runtime", current.runtime || "stub"],
    ["Path", current.path || "/page/index.mu"],
  ]) {
    details.appendChild(renderCompactSetting(label, value));
  }

  block.appendChild(details);

  if (current.loading) {
    const loading = document.createElement("div");
    loading.className = "settings-hint";
    loading.textContent = "Loading NomadNet page...";
    block.appendChild(loading);
  } else if (current.error) {
    const error = document.createElement("div");
    error.className = "settings-error";
    error.textContent = current.error;
    block.appendChild(error);
  } else if (current.source) {
    const page = document.createElement("div");
    page.className = "nomadnet-page";
    page.appendChild(renderMicronContent(current.source));
    block.appendChild(page);
  } else {
    const hint = document.createElement("div");
    hint.className = "settings-hint";
    hint.textContent = "Select a NomadNet announce or enter a destination hash. Real page retrieval is still backed by a stub endpoint.";
    block.appendChild(hint);
  }

  return block;
}

function renderNomadNetBrowserSettings() {
  const section = renderCollapsibleSection("nomadnetBrowserSettings", "Settings");
  section.classList.add("nomadnet-browser-settings");

  const grid = document.createElement("div");
  grid.className = "settings-compact-grid";

  const field = document.createElement("label");
  field.className = "settings-field";
  field.textContent = "Symbols";

  const select = document.createElement("select");

  for (const [value, label] of [
    ["system", "System"],
    ["friendlynode", "FriendlyNode"],
    ["text", "Text"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === micronSymbolStyle;
    select.appendChild(option);
  }

  select.onchange = () => {
    micronSymbolStyle = select.value;
    render("NomadNet");
  };

  field.appendChild(select);
  grid.appendChild(field);
  section.appendChild(grid);

  return section;
}

function renderNomadNetBookmarks() {
  const block = document.createElement("section");
  block.className = "settings-block";

  const title = document.createElement("h2");
  title.textContent = "Bookmarks";
  block.appendChild(title);

  const bookmarks = Array.from(nomadnetBookmarks);

  if (bookmarks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No NomadNet bookmarks yet.";
    block.appendChild(empty);
    return block;
  }

  const list = document.createElement("div");
  list.className = "nomadnet-bookmark-list";

  for (const destination of bookmarks) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = destination;
    button.onclick = () => {
      activeNomadNetSection = "Browser";
      nomadnetBrowserState = {
        name: "Bookmarked node",
        destination_hash: destination,
        path: "/page/index.mu",
        loading: true,
      };
      render("NomadNet");
      fetchNomadNetPage(destination, "/page/index.mu");
    };
    list.appendChild(button);
  }

  block.appendChild(list);
  return block;
}

function renderNomadNetPublisher() {
  const block = document.createElement("section");
  block.className = "settings-block";

  const title = document.createElement("h2");
  title.textContent = "Publisher";
  block.appendChild(title);

  const config = currentStatus?.config || {};
  const details = document.createElement("div");
  details.className = "settings-compact-grid";
  details.appendChild(renderCompactSetting("Status", "not wired"));
  details.appendChild(renderCompactSetting("Pages dir", config.nomadnet_pages_dir || "-"));
  details.appendChild(renderCompactSetting("Node identity", "-"));
  details.appendChild(renderCompactSetting("Announce", "manual later"));
  block.appendChild(details);

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "This will control local NomadNet publication: enable node, choose identity, pages directory and reannounce.";
  block.appendChild(hint);
  return block;
}

function renderNomadNetEditor() {
  const block = document.createElement("section");
  block.className = "settings-block nomadnet-editor";

  const title = document.createElement("h2");
  title.textContent = "Editor";
  block.appendChild(title);

  block.appendChild(renderNomadNetEditorFilePanel());

  if (nomadnetEditorStatus !== "") {
    const status = document.createElement("div");
    status.className = nomadnetEditorStatus.startsWith("Error:") ? "settings-error" : "settings-hint";
    status.textContent = nomadnetEditorStatus;
    block.appendChild(status);
  }

  const editor = document.createElement("div");
  editor.className = "message-editor nomadnet-micron-editor";

  const editorTools = document.createElement("label");
  editorTools.className = "message-editor-toggle";

  const unprintableToggle = document.createElement("input");
  unprintableToggle.type = "checkbox";
  unprintableToggle.checked = showNomadNetEditorUnprintable;
  editorTools.appendChild(unprintableToggle);
  editorTools.appendChild(document.createTextNode("show unprintable"));

  const selectionStatus = document.createElement("span");
  selectionStatus.className = "message-editor-selection";
  editorTools.appendChild(selectionStatus);
  editor.appendChild(editorTools);

  let input = null;

  unprintableToggle.onchange = () => {
    if (input instanceof HTMLTextAreaElement) {
      nomadnetEditorDraft = input.value;
      rememberNomadNetEditorSelection(input);
    } else if (input !== null) {
      nomadnetEditorDraft = serializeMessageEditor(input);
      rememberNomadNetEditorSelection(input);
    }

    showNomadNetEditorUnprintable = unprintableToggle.checked;
    nomadnetEditorPaletteOpen = false;
    render("NomadNet");
  };

  if (showNomadNetEditorUnprintable) {
    input = document.createElement("textarea");
    input.className = "nomadnet-source-input nomadnet-rich-input";
    input.setAttribute("role", "textbox");
    input.setAttribute("aria-label", "NomadNet Micron source");
    input.placeholder = "NomadNet Micron page";
    input.dataset.editor = "nomadnet";
    input.dataset.raw = "true";
    input.value = nomadnetEditorDraft;
    window.setTimeout(() => {
      resizeNomadNetEditorInput(input);
      restoreNomadNetTextareaSelection(input, nomadnetEditorPaletteOpen);
      updateNomadNetEditorSelectionStatus(selectionStatus);
    }, 0);

    input.oninput = () => {
      nomadnetEditorDraft = input.value;
      rememberNomadNetEditorSelection(input);
      updateNomadNetEditorSelectionStatus(selectionStatus);
      resizeNomadNetEditorInput(input);
    };
    input.onkeyup = () => {
      rememberNomadNetEditorSelection(input);
      updateNomadNetEditorSelectionStatus(selectionStatus);
    };
    input.onmouseup = () => {
      rememberNomadNetEditorSelection(input);
      updateNomadNetEditorSelectionStatus(selectionStatus);
    };
    input.onblur = () => {
      rememberNomadNetEditorSelection(input);
      updateNomadNetEditorSelectionStatus(selectionStatus);
    };
    input.onkeydown = (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      insertNomadNetText(input, "\n", input.scrollTop, getNomadNetRawSelection(input));
      nomadnetEditorDraft = input.value;
      rememberNomadNetEditorSelection(input);
      updateNomadNetEditorSelectionStatus(selectionStatus);
      resizeNomadNetEditorInput(input);
    };

    editor.appendChild(input);
  } else {
    const renderedInput = document.createElement("div");
    renderedInput.className = "nomadnet-rendered-input nomadnet-rich-input";
    renderedInput.setAttribute("role", "textbox");
    renderedInput.setAttribute("aria-label", "NomadNet Micron preview");
    renderedInput.contentEditable = "true";
    renderedInput.spellcheck = false;
    renderedInput.tabIndex = 0;
    renderedInput.dataset.editor = "nomadnet";
    renderedInput.dataset.raw = "false";
    renderedInput.appendChild(renderMicronContent(nomadnetEditorDraft));
    renderedInput.oninput = () => {
      nomadnetEditorDraft = serializeMessageEditor(renderedInput);
      rememberNomadNetEditorSelection(renderedInput);
      resizeNomadNetEditorInput(renderedInput);
    };
    renderedInput.onmouseup = () => rememberNomadNetEditorSelection(renderedInput);
    renderedInput.onkeyup = () => rememberNomadNetEditorSelection(renderedInput);
    renderedInput.onblur = () => {
      nomadnetEditorDraft = serializeMessageEditor(renderedInput);
      rememberNomadNetEditorSelection(renderedInput);
    };
    renderedInput.onpaste = (event) => {
      event.preventDefault();
      const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
      nomadnetEditorDraft = serializeMessageEditor(renderedInput);
      insertNomadNetText(renderedInput, text, renderedInput.scrollTop, getNomadNetRawSelection(renderedInput));
      resizeNomadNetEditorInput(renderedInput);
    };
    renderedInput.onkeydown = (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      nomadnetEditorDraft = serializeMessageEditor(renderedInput);
      insertNomadNetText(renderedInput, "\n", renderedInput.scrollTop, getNomadNetRawSelection(renderedInput));
      resizeNomadNetEditorInput(renderedInput);
    };
    window.setTimeout(() => {
      restoreNomadNetRenderedSelection(renderedInput, nomadnetEditorPaletteOpen);
      resizeNomadNetEditorInput(renderedInput);
    }, 0);
    editor.appendChild(renderedInput);
    input = renderedInput;
  }

  updateNomadNetEditorSelectionStatus(selectionStatus);

  const editorActions = document.createElement("div");
  editorActions.className = "nomadnet-editor-actions";

  const paletteButton = document.createElement("button");
  paletteButton.type = "button";
  paletteButton.className = "message-symbol-button";
  paletteButton.title = "Symbols";
  paletteButton.setAttribute("aria-label", "Open symbol palette");
  paletteButton.textContent = "\u263A";
  paletteButton.onmousedown = (event) => {
    event.preventDefault();
  };
  paletteButton.onclick = () => {
    if (input instanceof HTMLTextAreaElement) {
      rememberNomadNetEditorSelection(input);
    } else if (input !== null) {
      rememberNomadNetEditorSelection(input);
    }

    nomadnetEditorPaletteOpen = !nomadnetEditorPaletteOpen;
    render("NomadNet");
  };
  editorActions.appendChild(paletteButton);
  editor.appendChild(editorActions);

  if (input !== null && nomadnetEditorPaletteOpen) {
    editor.appendChild(renderMessageSymbolPalette(input, "nomadnet"));
  }

  block.appendChild(editor);

  if (nomadnetEditorPaletteOpen && symbolPaletteSpacerHeight > 0) {
    block.appendChild(renderPaletteSpacer());
  }

  if (nomadnetEditorFileDialog !== null) {
    block.appendChild(renderNomadNetFileDialog());
  }

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "Source editing follows Micron Composer semantics: formatting wraps the selected raw text directly. Publish is not wired yet.";
  block.appendChild(hint);

  return block;
}

function renderNomadNetEditorFilePanel() {
  const section = renderCollapsibleSection("nomadnetEditorFile", "File");
  section.classList.add("nomadnet-editor-file-section");

  const summary = document.createElement("div");
  summary.className = "nomadnet-editor-current-file";
  summary.appendChild(renderCompactSetting("Current", nomadnetEditorPath));
  section.appendChild(summary);

  const actions = document.createElement("div");
  actions.className = "nomadnet-editor-file-buttons";

  const newButton = document.createElement("button");
  newButton.type = "button";
  newButton.textContent = "New";
  newButton.onclick = () => {
    nomadnetEditorPath = "index.mu";
    nomadnetEditorDraft = "";
    nomadnetEditorSelection = null;
    nomadnetEditorLinePoints = null;
    nomadnetEditorRawSelection = null;
    nomadnetEditorStatus = "New page draft.";
    render("NomadNet");
  };
  actions.appendChild(newButton);

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.onclick = () => openNomadNetFileDialog("open");
  actions.appendChild(openButton);

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.onclick = () => openNomadNetFileDialog("save");
  actions.appendChild(saveButton);

  section.appendChild(actions);
  return section;
}

function openNomadNetFileDialog(mode) {
  nomadnetEditorFileDialog = mode;
  nomadnetEditorDialogPath = nomadnetEditorPath;

  if (mode === "open") {
    refreshNomadNetEditorPages();
  }

  render("NomadNet");
}

function renderNomadNetFileDialog() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor nomadnet-file-dialog";
  dialog.onclick = (event) => event.stopPropagation();

  const title = document.createElement("h2");
  title.textContent = nomadnetEditorFileDialog === "open" ? "Open Micron page" : "Save Micron page";
  dialog.appendChild(title);

  const pathField = renderAccessTextInput("Page path", nomadnetEditorDialogPath, "index.mu", (value) => {
    nomadnetEditorDialogPath = normaliseNomadNetEditorPath(value);
  });
  const pathInput = pathField.querySelector("input");
  pathInput.oninput = () => {
    nomadnetEditorDialogPath = normaliseNomadNetEditorPath(pathInput.value);
  };
  dialog.appendChild(pathField);

  if (nomadnetEditorFileDialog === "open") {
    dialog.appendChild(renderNomadNetOpenFileList(pathInput));
  }

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  if (nomadnetEditorFileDialog === "open") {
    const refreshButton = document.createElement("button");
    refreshButton.type = "button";
    refreshButton.textContent = "Refresh";
    refreshButton.onclick = refreshNomadNetEditorPages;
    actions.appendChild(refreshButton);

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open";
    openButton.onclick = () => {
      nomadnetEditorFileDialog = null;
      loadNomadNetEditorPage(nomadnetEditorDialogPath);
    };
    actions.appendChild(openButton);
  } else {
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save";
    saveButton.onclick = () => {
      nomadnetEditorPath = normaliseNomadNetEditorPath(nomadnetEditorDialogPath);
      nomadnetEditorFileDialog = null;
      saveNomadNetEditorPage();
    };
    actions.appendChild(saveButton);
  }

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.onclick = () => {
    nomadnetEditorFileDialog = null;
    render("NomadNet");
  };
  actions.appendChild(cancelButton);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  overlay.onclick = () => {
    nomadnetEditorFileDialog = null;
    render("NomadNet");
  };
  return overlay;
}

function renderNomadNetOpenFileList(pathInput) {
  const list = document.createElement("div");
  list.className = "nomadnet-file-list";

  if (nomadnetEditorPages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No saved .mu pages loaded.";
    list.appendChild(empty);
    return list;
  }

  for (const page of nomadnetEditorPages) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = page.path;
    button.onclick = () => {
      nomadnetEditorDialogPath = page.path;
      pathInput.value = page.path;
    };
    list.appendChild(button);
  }

  return list;
}

function normaliseNomadNetEditorPath(path) {
  const clean = String(path || "").trim().replaceAll("\\", "/").replace(/^\/+/, "");
  return clean === "" ? "index.mu" : clean;
}

async function refreshNomadNetEditorPages() {
  try {
    const response = await fetch("/api/nomadnet/pages", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`NomadNet page list failed: HTTP ${response.status}`);
    }

    const payload = await response.json();
    nomadnetEditorPages = Array.isArray(payload.pages) ? payload.pages : [];
    nomadnetEditorStatus = `Loaded ${nomadnetEditorPages.length} page records.`;
  } catch (error) {
    nomadnetEditorStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (getActiveTab() === "NomadNet" && activeNomadNetSection === "Editor") {
    render("NomadNet");
  }
}

async function loadNomadNetEditorPage(path) {
  const pagePath = normaliseNomadNetEditorPath(path);

  try {
    const query = new URLSearchParams({
      path: pagePath,
    });
    const response = await fetch(`/api/nomadnet/local-page?${query.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`NomadNet page load failed: HTTP ${response.status}`);
    }

    const payload = await response.json();
    nomadnetEditorPath = payload.path || pagePath;
    nomadnetEditorDraft = payload.source || "";
    nomadnetEditorSelection = null;
    nomadnetEditorLinePoints = null;
    nomadnetEditorRawSelection = null;
    nomadnetEditorStatus = `Loaded ${nomadnetEditorPath}.`;
  } catch (error) {
    nomadnetEditorStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (getActiveTab() === "NomadNet" && activeNomadNetSection === "Editor") {
    render("NomadNet");
  }
}

async function saveNomadNetEditorPage() {
  const pagePath = normaliseNomadNetEditorPath(nomadnetEditorPath);

  try {
    const response = await fetch("/api/nomadnet/local-page", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: pagePath,
        source: nomadnetEditorDraft,
      }),
    });

    if (!response.ok) {
      throw new Error(`NomadNet page save failed: HTTP ${response.status}`);
    }

    const payload = await response.json();
    nomadnetEditorPath = payload.path || pagePath;
    nomadnetEditorStatus = `Saved ${nomadnetEditorPath}.`;
    await refreshNomadNetEditorPages();
  } catch (error) {
    nomadnetEditorStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
    if (getActiveTab() === "NomadNet" && activeNomadNetSection === "Editor") {
      render("NomadNet");
    }
  }
}

function getNomadNetBrowserState() {
  if (nomadnetBrowserState !== null) {
    return nomadnetBrowserState;
  }

  const announces = Array.isArray(currentStatus?.announces) ? currentStatus.announces : [];
  const announce = announces.find((item) => item.type === "nomadnet" || item.aspect === "nomadnetwork.node");

  if (announce === undefined) {
    return {
      name: "",
      destination_hash: "",
      identity_hash: "",
      hops: "",
      path: "/page/index.mu",
      source: "",
      runtime: "stub",
    };
  }

  return {
    name: announce.name || "NomadNet node",
    destination_hash: announce.destination_hash || "",
    identity_hash: announce.identity_hash || "",
    hops: announce.hops,
    path: "/page/index.mu",
    source: "",
    runtime: "stub",
  };
}

function openNomadNetPageFromFields(destinationInput, pathInput, current) {
  const destination = String(destinationInput?.value || current.destination_hash || "").trim();
  const path = String(pathInput?.value || current.path || "/page/index.mu").trim() || "/page/index.mu";

  nomadnetBrowserState = {
    ...current,
    destination_hash: destination,
    path,
    loading: true,
    error: "",
  };
  render("NomadNet");
  fetchNomadNetPage(destination, path);
}

async function fetchNomadNetPage(destinationHash, path) {
  try {
    const query = new URLSearchParams({
      destination_hash: destinationHash,
      path,
    });
    const response = await fetch(`/api/nomadnet/page?${query.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`NomadNet page request failed: HTTP ${response.status}`);
    }

    const page = await response.json();
    nomadnetBrowserState = {
      ...(nomadnetBrowserState || {}),
      destination_hash: page.destination_hash || destinationHash,
      path: page.path || path,
      source: page.source || "",
      runtime: page.runtime || "stub",
      loading: false,
      error: "",
    };
  } catch (error) {
    nomadnetBrowserState = {
      ...(nomadnetBrowserState || {}),
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (getActiveTab() === "NomadNet") {
    render("NomadNet");
  }
}

function renderAnnounceResults(announces, count, list) {
  const filtered = filterAnnounces(announces);
  count.textContent = `${filtered.length} of ${announces.length} announces`;
  list.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No announces match current filters.";
    list.appendChild(empty);
    return;
  }

  for (const announce of filtered) {
    list.appendChild(renderAnnounceRow(announce));
  }

  window.setTimeout(() => {
    list.scrollTop = list.scrollHeight;
  }, 0);
}

function renderAnnounceTypeFilter(onChange) {
  const field = document.createElement("label");
  field.className = "announce-filter-field";

  const label = document.createElement("span");
  label.textContent = "Type";
  field.appendChild(label);

  const select = document.createElement("select");

  for (const [value, text] of [
    ["all", "All"],
    ["identity", "Identity"],
    ["nomadnet", "NomadNet"],
    ["transport", "Transport"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = announceFilters.type === value;
    select.appendChild(option);
  }

  select.onchange = () => {
    announceFilters.type = select.value;
    onChange();
  };
  field.appendChild(select);
  return field;
}

function renderAnnounceTextFilter(labelText, key, onChange) {
  const field = document.createElement("label");
  field.className = "announce-filter-field";

  const label = document.createElement("span");
  label.textContent = labelText;
  field.appendChild(label);

  const input = document.createElement("input");
  input.type = "search";
  input.value = announceFilters[key] || "";
  input.oninput = () => {
    announceFilters[key] = input.value;
    onChange();
  };
  field.appendChild(input);
  return field;
}

function renderAnnounceHopsFilter(onChange) {
  const field = document.createElement("label");
  field.className = "announce-filter-field announce-hops-filter";

  const label = document.createElement("span");
  label.textContent = "Hops";
  field.appendChild(label);

  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.value = String(announceFilters.hops || 0);
  input.oninput = () => {
    announceFilters.hops = Math.max(0, Number(input.value) || 0);
    onChange();
  };
  field.appendChild(input);
  return field;
}

function filterAnnounces(announces) {
  const type = announceFilters.type;
  const name = announceFilters.name.trim().toLowerCase();
  const identity = announceFilters.identity.trim().toLowerCase();
  const lxmf = announceFilters.lxmf.trim().toLowerCase();
  const hops = Number(announceFilters.hops) || 0;

  return announces.filter((announce) => {
    if (type !== "all" && announce.type !== type) {
      return false;
    }

    if (name !== "" && !String(announce.name || "").toLowerCase().includes(name)) {
      return false;
    }

    if (identity !== "" && !String(announce.identity_hash || "").toLowerCase().includes(identity)) {
      return false;
    }

    if (lxmf !== "" && !String(announce.lxmf || "").toLowerCase().includes(lxmf)) {
      return false;
    }

    if (hops > 0 && Number(announce.hops) > hops) {
      return false;
    }

    return true;
  });
}

function renderAnnounceRow(announce) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "announce-row";
  row.onclick = () => {
    announceModalState = announce;
    render("Announces");
  };

  const type = document.createElement("span");
  type.className = `announce-row-type announce-type-${announce.type || "unknown"}`;
  type.textContent = getAnnounceTypeLabel(announce.type);
  row.appendChild(type);

  const name = document.createElement("span");
  name.className = "announce-row-name";
  name.textContent = announce.name || announce.destination_hash || "-";
  row.appendChild(name);

  const lxmf = document.createElement("span");
  lxmf.className = "announce-row-lxmf";
  lxmf.textContent = announce.lxmf || announce.destination_hash || "-";
  row.appendChild(lxmf);

  const hops = document.createElement("span");
  hops.className = "announce-row-hops";
  hops.textContent = `${announce.hops ?? "-"}h`;
  row.appendChild(hops);

  return row;
}

function renderAnnounceDetailCard(announce) {
  const card = document.createElement("article");
  card.className = "announce-detail-card";

  const header = document.createElement("div");
  header.className = "announce-card-header";

  const title = document.createElement("div");
  title.className = "announce-card-title";
  title.textContent = announce.name || announce.destination_hash || "-";
  header.appendChild(title);

  const badge = document.createElement("div");
  badge.className = `announce-type announce-type-${announce.type || "unknown"}`;
  badge.textContent = getAnnounceTypeLabel(announce.type);
  header.appendChild(badge);
  card.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "announce-card-meta";

  for (const [label, value] of [
    ["Aspect", announce.aspect],
    ["Identity", announce.identity_hash],
    ["LXMF", announce.lxmf],
    ["Destination", announce.destination_hash],
    ["Interface", announce.interface],
    ["Hops", announce.hops],
    ["Time", announce.time],
  ]) {
    const row = document.createElement("div");
    row.className = "announce-meta-row";

    const rowLabel = document.createElement("span");
    rowLabel.textContent = label;
    row.appendChild(rowLabel);

    const rowValue = document.createElement("strong");
    rowValue.textContent = value === undefined || value === null || value === "" ? "-" : String(value);
    row.appendChild(rowValue);
    meta.appendChild(row);
  }

  card.appendChild(meta);
  return card;
}

function renderAnnounceModal() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor announce-modal";

  const title = document.createElement("h2");
  title.textContent = announceModalState.name || announceModalState.destination_hash || "Announce";
  dialog.appendChild(title);
  dialog.appendChild(renderAnnounceDetailCard(announceModalState));

  const actions = document.createElement("div");
  actions.className = "client-editor-actions announce-modal-actions";

  const addContactButton = document.createElement("button");
  addContactButton.type = "button";
  addContactButton.textContent = "Add contact";
  addContactButton.onclick = () => addAnnounceContact(announceModalState);
  actions.appendChild(addContactButton);

  const bookmarkButton = document.createElement("button");
  bookmarkButton.type = "button";
  bookmarkButton.textContent = nomadnetBookmarks.has(getAnnounceBookmarkId(announceModalState))
    ? "Bookmarked"
    : "Bookmark";
  bookmarkButton.disabled = announceModalState.type !== "nomadnet";
  bookmarkButton.onclick = () => bookmarkAnnounceNode(announceModalState);
  actions.appendChild(bookmarkButton);

  const chatButton = document.createElement("button");
  chatButton.type = "button";
  chatButton.textContent = "Open chat";
  chatButton.disabled = !announceCanOpenChat(announceModalState);
  chatButton.onclick = () => openAnnounceChat(announceModalState);
  actions.appendChild(chatButton);

  const pageButton = document.createElement("button");
  pageButton.type = "button";
  pageButton.textContent = "Open page";
  pageButton.disabled = announceModalState.type !== "nomadnet";
  pageButton.onclick = () => openAnnounceNomadnetPage(announceModalState);
  actions.appendChild(pageButton);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.onclick = () => {
    announceModalState = null;
    render("Announces");
  };
  actions.appendChild(closeButton);

  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  overlay.onclick = (event) => {
    if (event.target !== overlay) {
      return;
    }

    announceModalState = null;
    render("Announces");
  };
  return overlay;
}

function getAnnounceTypeLabel(type) {
  if (type === "identity") {
    return "Identity";
  }

  if (type === "nomadnet") {
    return "NomadNet";
  }

  if (type === "transport") {
    return "Transport";
  }

  return "Unknown";
}

function announceCanOpenChat(announce) {
  return String(announce.lxmf || announce.destination_hash || "") !== "";
}

function announceToContact(announce) {
  const destination = String(announce.lxmf || announce.destination_hash || "");
  return {
    id: `announce-${destination.slice(0, 12) || announce.id || "contact"}`,
    name: announce.name || getAnnounceTypeLabel(announce.type),
    destination_hash: announce.destination_hash || destination,
    identity_hash: announce.identity_hash || "",
    lxmf_address: announce.lxmf ? `lxmf://${announce.lxmf}` : "",
    last_announce: announce.time || "",
    hops: announce.hops,
    path_status: "announced",
  };
}

function getAnnounceBookmarkId(announce) {
  return String(announce.destination_hash || announce.lxmf || announce.id || "");
}

async function addAnnounceContact(announce) {
  const clients = Array.isArray(currentStatus?.clients?.clients) ? currentStatus.clients.clients : [];

  if (clients.length === 0) {
    return;
  }

  const client = selectActiveClient(clients);
  const contact = announceToContact(announce);

  try {
    const response = await fetch(`/api/clients/${encodeURIComponent(client.id)}/contacts`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contact),
    });

    if (!response.ok) {
      throw new Error(`Add contact failed: HTTP ${response.status}`);
    }

    announceModalState = null;
    await fetchStatus();
    activeClientId = client.id;
    activeContactId = contact.id;
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

function bookmarkAnnounceNode(announce) {
  if (announce.type !== "nomadnet") {
    return;
  }

  nomadnetBookmarks.add(getAnnounceBookmarkId(announce));
  render("Announces");
}

function openAnnounceChat(announce) {
  const clients = Array.isArray(currentStatus?.clients?.clients) ? currentStatus.clients.clients : [];

  if (clients.length === 0 || !announceCanOpenChat(announce)) {
    return;
  }

  const client = selectActiveClient(clients);
  const contact = announceToContact(announce);
  activeClientId = client.id;
  activeContactId = contact.id;
  transientConversation = {
    client_id: client.id,
    contact,
    last_message: "",
    unread: 0,
    message_count: 0,
    messages: [],
  };
  announceModalState = null;
  render("Client");
}

function openAnnounceNomadnetPage(announce) {
  if (announce.type !== "nomadnet") {
    return;
  }

  nomadnetBrowserState = {
    name: announce.name || "NomadNet node",
    destination_hash: announce.destination_hash || "",
    identity_hash: announce.identity_hash || "",
    hops: announce.hops,
    path: "/page/index.mu",
    loading: true,
  };
  activeNomadNetSection = "Browser";
  announceModalState = null;
  render("NomadNet");
  fetchNomadNetPage(nomadnetBrowserState.destination_hash, nomadnetBrowserState.path);
}

function renderClientContactsPanel(clients) {
  const block = renderCollapsibleSection("clientAccounts", "Contacts");

  const actionRow = document.createElement("div");
  actionRow.className = "settings-row client-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add Contact";
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
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.onclick = () => openClientConversations(client);
    card.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openClientConversations(client);
    };

    const summary = document.createElement("div");
    summary.className = "client-account-summary";

    const summaryText = document.createElement("div");
    summaryText.className = "client-account-summary-text";

    const accountName = document.createElement("div");
    accountName.className = "client-account-name";
    accountName.textContent = client.display_name || client.id || "-";
    summaryText.appendChild(accountName);

    const accountLxmf = document.createElement("div");
    accountLxmf.className = "client-account-lxmf";
    accountLxmf.textContent = client.lxmf_destination_hash || "LXMF destination not created";
    summaryText.appendChild(accountLxmf);
    summary.appendChild(summaryText);

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "client-account-menu-button";
    menuButton.title = "Contact actions";
    menuButton.setAttribute("aria-label", "Contact actions");
    menuButton.textContent = "...";
    menuButton.onclick = (event) => {
      const rect = menuButton.getBoundingClientRect();
      clientAccountMenuState = {
        client,
        x: rect.left,
        y: rect.bottom + 6,
      };
      event.stopPropagation();
      render("Client");
    };
    summary.appendChild(menuButton);
    card.appendChild(summary);

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
  return block;
}

function openClientConversations(client) {
  activeClientId = client.id || "";
  activeContactId = "";
  clientAccountMenuState = null;
  collapsedPanels.conversations = false;
  render("Client");
}

function renderClientAccountMenu() {
  const overlay = document.createElement("div");
  overlay.className = "contact-menu-dismiss";
  overlay.onclick = () => {
    clientAccountMenuState = null;
    render("Client");
  };

  const menu = document.createElement("div");
  menu.className = "contact-menu client-account-menu";
  menu.style.left = `${clientAccountMenuState.x}px`;
  menu.style.top = `${clientAccountMenuState.y}px`;
  menu.onclick = (event) => {
    event.stopPropagation();
  };

  const client = clientAccountMenuState.client;

  for (const [label, action] of [
    ["Edit", () => {
      clientAccountMenuState = null;
      openClientEditor(client);
    }],
    ["Remove", () => {
      clientAccountMenuState = null;
      removeClient(client);
    }],
    [expandedClientDetails.has(client.id) ? "Hide details" : "Show details", () => {
      if (expandedClientDetails.has(client.id)) {
        expandedClientDetails.delete(client.id);
      } else {
        expandedClientDetails.add(client.id);
      }

      clientAccountMenuState = null;
      render("Client");
    }],
    ["Share", () => shareClientAccount(client)],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.onclick = action;
    menu.appendChild(button);
  }

  overlay.appendChild(menu);
  return overlay;
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
  const section = renderCollapsibleSection("conversations", "Conversations");
  section.classList.add("client-chat-section");

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "Client accounts are separate from transport settings. LXMF startup is not wired yet.";
  section.appendChild(hint);

  if (clients.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "Create a client account to load conversations.";
    section.appendChild(empty);
    return section;
  }

  const activeClient = selectActiveClient(clients);
  let conversations = Array.isArray(activeClient.conversations)
    ? activeClient.conversations
    : [];

  if (transientConversation !== null && transientConversation.client_id === activeClient.id) {
    const hasContact = conversations.some(
      (conversation) => conversation.contact?.id === transientConversation.contact.id
    );

    if (!hasContact) {
      conversations = [...conversations, transientConversation];
    }
  }

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
    bubble.appendChild(renderMicronContent(message.content || ""));
    list.appendChild(bubble);
  }

  panel.appendChild(list);
  panel.appendChild(renderMessageComposer(contact));

  if (symbolPaletteOpen && symbolPaletteSpacerHeight > 0) {
    panel.appendChild(renderPaletteSpacer());
  }

  scrollMessageListToBottom(list);
  return panel;
}

function scrollMessageListToBottom(list) {
  window.setTimeout(() => {
    list.scrollTop = list.scrollHeight;
  }, 0);
}

function renderMessageComposer(contact) {
  const composer = document.createElement("form");
  composer.className = "message-composer";
  composer.onsubmit = (event) => {
    event.preventDefault();
    sendMessage(contact);
  };

  const editor = document.createElement("div");
  editor.className = "message-editor";

  const editorTools = document.createElement("label");
  editorTools.className = "message-editor-toggle";

  const unprintableToggle = document.createElement("input");
  unprintableToggle.type = "checkbox";
  unprintableToggle.checked = showMessageUnprintable;
  editorTools.appendChild(unprintableToggle);
  editorTools.appendChild(document.createTextNode("show unprintable"));
  const selectionStatus = document.createElement("span");
  selectionStatus.className = "message-editor-selection";
  editorTools.appendChild(selectionStatus);
  editor.appendChild(editorTools);

  const input = document.createElement("div");
  input.className = "message-rich-input";
  input.contentEditable = "true";
  input.setAttribute("role", "textbox");
  input.setAttribute("aria-label", "Message");
  input.dataset.placeholder = "Message";
  input.dataset.editor = "message";
  input.dataset.raw = showMessageUnprintable ? "true" : "false";
  renderMessageEditorContent(input, messageDraft);
  unprintableToggle.onchange = () => {
    messageDraft = serializeMessageEditor(input);
    showMessageUnprintable = unprintableToggle.checked;
    input.dataset.raw = showMessageUnprintable ? "true" : "false";
    renderMessageEditorContent(input, messageDraft);
    input.focus();
    updateMessageEditorSelectionStatus(selectionStatus);
    resizeMessageInput(input);
  };
  window.setTimeout(() => resizeMessageInput(input), 0);
  input.oninput = () => {
    messageDraft = serializeMessageEditor(input);
    rememberMessageEditorSelection(input);
    updateMessageEditorSelectionStatus(selectionStatus);
    resizeMessageInput(input);
  };
  input.onkeyup = () => {
    rememberMessageEditorSelection(input);
    updateMessageEditorSelectionStatus(selectionStatus);
  };
  input.onmouseup = () => {
    rememberMessageEditorSelection(input);
    updateMessageEditorSelectionStatus(selectionStatus);
  };
  input.onblur = () => {
    rememberMessageEditorSelection(input);
    updateMessageEditorSelectionStatus(selectionStatus);
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey) {
      event.preventDefault();
      sendMessage(contact);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      insertMessageText(input, "\n");
      rememberMessageEditorSelection(input);
      updateMessageEditorSelectionStatus(selectionStatus);
      resizeMessageInput(input);
    }
  };
  updateMessageEditorSelectionStatus(selectionStatus);
  editor.appendChild(input);
  composer.appendChild(editor);

  const paletteButton = document.createElement("button");
  paletteButton.type = "button";
  paletteButton.className = "message-symbol-button";
  paletteButton.title = "Symbols";
  paletteButton.setAttribute("aria-label", "Open symbol palette");
  paletteButton.textContent = "\u263A";
  paletteButton.onclick = () => {
    symbolPaletteOpen = !symbolPaletteOpen;
    render("Client");
  };
  composer.appendChild(paletteButton);

  const newlineButton = document.createElement("button");
  newlineButton.type = "button";
  newlineButton.className = "message-newline-button";
  newlineButton.title = "New line";
  newlineButton.setAttribute("aria-label", "Insert new line");
  newlineButton.textContent = "\u21B5";
  newlineButton.onclick = () => {
    insertMessageText(input, "\n");
    rememberMessageEditorSelection(input);
    updateMessageEditorSelectionStatus(selectionStatus);
    resizeMessageInput(input);
  };
  composer.appendChild(newlineButton);

  const button = document.createElement("button");
  button.type = "submit";
  button.className = "send-message-button";
  button.title = "Send";
  button.setAttribute("aria-label", "Send message");
  button.textContent = "\u27A4";
  composer.appendChild(button);

  if (symbolPaletteOpen) {
    composer.appendChild(renderMessageSymbolPalette(input));
  }

  return composer;
}

function renderMessageSymbolPalette(input, editorKind = "message") {
  const palette = document.createElement("div");
  palette.className = "message-symbol-palette";
  window.setTimeout(() => positionMessageSymbolPalette(palette, input), 0);
  palette.onmousedown = (event) => {
    event.preventDefault();
  };

  const header = document.createElement("div");
  header.className = "message-symbol-palette-header";
  const heading = document.createElement("div");
  heading.className = "message-symbol-palette-title";
  heading.textContent = "Micron";
  header.appendChild(heading);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "message-symbol-palette-close";
  closeButton.title = "Close palette";
  closeButton.setAttribute("aria-label", "Close symbol palette");
  closeButton.textContent = "\u00D7";
  closeButton.onmousedown = (event) => {
    event.preventDefault();
  };
  closeButton.onclick = () => closeMessageSymbolPalette(editorKind);
  header.appendChild(closeButton);
  palette.appendChild(header);

  const micron = window.FriendlyNodeMicron;
  const groups = micron && Array.isArray(micron.symbolGroups) ? micron.symbolGroups : [];

  for (const group of groups) {
    const groupBlock = document.createElement("div");
    groupBlock.className = "message-symbol-group";

    const title = document.createElement("div");
    title.className = "message-symbol-group-title";
    title.textContent = group.name;
    groupBlock.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "message-symbol-grid";

    for (const symbol of group.symbols) {
      const symbolInsert = getMessageSymbolInsert(symbol);
      const symbolLabel = typeof symbol === "string" ? symbol : symbol.label;
      const symbolTitle = typeof symbol === "string" ? symbol : symbol.title || symbolInsert;
      const item = document.createElement("button");
      item.type = "button";
      item.tabIndex = -1;
      item.className = symbolInsert.length > 3 ? "wide" : "";
      item.title = symbolTitle;

      const iconPack = window.FriendlyNodeMicronIconPack;

      if (shouldUsePaletteIcon(symbol, symbolLabel, iconPack)) {
        item.appendChild(iconPack.createIcon(symbolLabel));
      } else {
        item.textContent = symbolLabel;
      }

      if (typeof symbol !== "string") {
        if (symbol.color) {
          item.style.color = symbol.color;
        }

        if (symbol.background) {
          item.style.backgroundColor = symbol.background;
        }
      }

      item.onmousedown = (event) => {
        event.preventDefault();
      };
      item.onclick = () => {
        if (editorKind === "nomadnet") {
          applyNomadNetSymbol(input, symbol);
          return;
        }

        restoreMessageEditorSelection(input);
        applyMessageSymbol(input, symbol);
      };
      grid.appendChild(item);
    }

    groupBlock.appendChild(grid);
    palette.appendChild(groupBlock);
  }

  return palette;
}

function closeMessageSymbolPalette(editorKind) {
  if (editorKind === "nomadnet") {
    nomadnetEditorPaletteOpen = false;
    render("NomadNet");
    return;
  }

  symbolPaletteOpen = false;
  render("Client");
}

function renderPaletteSpacer() {
  const spacer = document.createElement("div");
  spacer.className = "symbol-palette-spacer";
  spacer.style.height = `${symbolPaletteSpacerHeight}px`;
  return spacer;
}

function shouldUsePaletteIcon(symbol, label, iconPack) {
  if (!iconPack || typeof iconPack.createIcon !== "function" || typeof iconPack.supports !== "function") {
    return false;
  }

  if (typeof label !== "string" || !iconPack.supports(label)) {
    return false;
  }

  if (typeof symbol === "string") {
    return true;
  }

  return Boolean(symbol && (typeof symbol.block === "string" || typeof symbol.insert === "string"));
}

function positionMessageSymbolPalette(palette, input) {
  const margin = 12;
  const gap = 8;
  const anchor = getEditorAnchorRect(input);
  const width = palette.offsetWidth || 360;
  const height = palette.offsetHeight || 260;
  const compactHeight = Math.min(220, Math.max(128, Math.floor(window.innerHeight * 0.38)));

  palette.classList.remove("compact");
  palette.style.maxHeight = "";

  if (window.innerHeight < 640 || height > window.innerHeight * 0.56) {
    const compactWidth = Math.min(520, window.innerWidth - (margin * 2));
    palette.classList.add("compact");
    palette.style.maxHeight = `${compactHeight}px`;
    palette.style.left = `${Math.round(Math.max(margin, (window.innerWidth - compactWidth) / 2))}px`;
    palette.style.top = `${Math.round(window.innerHeight - compactHeight - margin)}px`;
    palette.style.width = `${Math.round(compactWidth)}px`;
    setSymbolPaletteSpacerHeight(Math.ceil(palette.getBoundingClientRect().height) + margin + 8);
    return;
  }

  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  let left = anchor.left;
  let top = anchor.bottom + gap;

  if (top + height > window.innerHeight - margin) {
    top = anchor.top - height - gap;
  }

  if (top < margin) {
    top = Math.min(Math.max(anchor.top, margin), maxTop);
  }

  left = Math.min(Math.max(left, margin), maxLeft);
  palette.style.left = `${Math.round(left)}px`;
  palette.style.top = `${Math.round(top)}px`;
  palette.style.width = "";
  setSymbolPaletteSpacerHeight(0);
}

function setSymbolPaletteSpacerHeight(height) {
  if (symbolPaletteSpacerHeight === height) {
    return;
  }

  symbolPaletteSpacerHeight = height;

  if (getActiveTab() === "NomadNet" && activeNomadNetSection === "Editor" && nomadnetEditorPaletteOpen) {
    window.setTimeout(() => render("NomadNet"), 0);
    return;
  }

  if (getActiveTab() === "Client" && symbolPaletteOpen) {
    window.setTimeout(() => render("Client"), 0);
  }
}

function getEditorAnchorRect(input) {
  const selection = window.getSelection();

  if (!(input instanceof HTMLTextAreaElement) && selection !== null && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);

    if (input.contains(range.startContainer) && input.contains(range.endContainer)) {
      const rect = getRangeViewportRect(range);

      if (rect !== null) {
        return rect;
      }
    }
  }

  const inputRect = input.getBoundingClientRect();
  const top = Math.min(Math.max(inputRect.top, 0), Math.max(0, window.innerHeight - 1));
  const bottom = Math.min(Math.max(inputRect.bottom, top), window.innerHeight);

  return {
    left: inputRect.left,
    right: inputRect.right,
    top,
    bottom,
    width: inputRect.width,
    height: Math.max(1, bottom - top),
  };
}

function getRangeViewportRect(range) {
  const rect = range.getBoundingClientRect();

  if (rect.width > 0 || rect.height > 0) {
    return rect;
  }

  const rects = range.getClientRects();

  if (rects.length > 0) {
    return rects[0];
  }

  return null;
}

function getMessageSymbolInsert(symbol) {
  if (typeof symbol === "string") {
    return symbol;
  }

  return symbol.insert || symbol.block || symbol.linePrefix || symbol.style || `${symbol.before || ""}${symbol.after || ""}`;
}

function applyMessageSymbol(input, symbol) {
  if (typeof symbol === "string") {
    insertMessageText(input, symbol);
    return;
  }

  if (symbol.style) {
    applyMessageStyle(input, symbol);
    return;
  }

  if (symbol.linePrefix) {
    prefixMessageLine(input, symbol.linePrefix, symbol.placeholder || "");
    return;
  }

  if (symbol.block) {
    insertMessageBlock(input, symbol.block);
    return;
  }

  insertMessageText(input, symbol.insert || "");
}

function applyNomadNetSymbol(input, symbol) {
  const savedScrollTop = input.scrollTop;
  const rawSelection = getNomadNetRawSelection(input) || nomadnetEditorRawSelection;

  if (typeof symbol === "string") {
    insertNomadNetText(input, symbol, savedScrollTop, rawSelection);
    return;
  }

  if (symbol.style) {
    applyNomadNetStyle(input, symbol, savedScrollTop, rawSelection);
    return;
  }

  if (symbol.linePrefix) {
    applyNomadNetLinePrefix(input, symbol.linePrefix, symbol.placeholder || "", savedScrollTop, rawSelection);
    return;
  }

  if (symbol.block) {
    insertNomadNetBlock(input, symbol.block, savedScrollTop, rawSelection);
    return;
  }

  insertNomadNetText(input, symbol.insert || "", savedScrollTop, rawSelection);
}

function getNomadNetRawSelection(input) {
  if (input instanceof HTMLTextAreaElement) {
    return {
      start: input.selectionStart,
      end: input.selectionEnd,
    };
  }

  const selection = getEditorSelectionOffsets(input);

  if (selection === null) {
    return nomadnetEditorRawSelection;
  }

  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);

  if (input.dataset.raw === "true") {
    return { start, end };
  }

  return editorSelectionToRawRange(input, nomadnetEditorDraft)
    || documentVisibleSelectionToRawRange(nomadnetEditorDraft, start, end);
}

function setNomadNetEditorCursor(input, rawOffset, scrollTop) {
  if (input instanceof HTMLTextAreaElement) {
    input.value = nomadnetEditorDraft;
    input.focus();
    input.setSelectionRange(rawOffset, rawOffset);
    nomadnetEditorSelection = { start: rawOffset, end: rawOffset };
    nomadnetEditorRawSelection = { start: rawOffset, end: rawOffset };
    resizeNomadNetEditorInput(input);
    input.scrollTop = Math.min(scrollTop, input.scrollHeight);
    return;
  }

  renderMessageEditorContent(input, nomadnetEditorDraft);
  input.focus();

  if (input.dataset.raw === "true") {
    setEditorSelectionOffsets(input, rawOffset, rawOffset);
    nomadnetEditorSelection = { start: rawOffset, end: rawOffset };
  } else {
    const point = rawOffsetToEditorLinePoint(nomadnetEditorDraft, rawOffset);
    setEditorLinePointSelection(input, point.lineIndex, point.offset);
    nomadnetEditorSelection = getEditorSelectionOffsets(input);
  }

  nomadnetEditorLinePoints = getEditorSelectionLinePoints(input);
  nomadnetEditorRawSelection = { start: rawOffset, end: rawOffset };
  resizeNomadNetEditorInput(input);
  input.scrollTop = Math.min(scrollTop, input.scrollHeight);
}

function insertNomadNetText(input, text, scrollTop, rawSelection = null) {
  const selection = rawSelection || getNomadNetRawSelection(input);
  const start = selection === null ? nomadnetEditorDraft.length : Math.min(selection.start, selection.end);
  const end = selection === null ? start : Math.max(selection.start, selection.end);
  nomadnetEditorDraft = `${nomadnetEditorDraft.slice(0, start)}${text}${nomadnetEditorDraft.slice(end)}`;
  setNomadNetEditorCursor(input, start + text.length, scrollTop);
}

function insertNomadNetBlock(input, block, scrollTop, rawSelection = null) {
  const selection = rawSelection || getNomadNetRawSelection(input);
  const start = selection === null ? nomadnetEditorDraft.length : Math.min(selection.start, selection.end);
  const end = selection === null ? start : Math.max(selection.start, selection.end);
  const before = nomadnetEditorDraft.slice(0, start);
  const after = nomadnetEditorDraft.slice(end);
  const prefix = before === "" || before.endsWith("\n") ? "" : "\n";
  const suffix = after === "" ? "\n" : after.startsWith("\n") ? "" : "\n";
  const text = `${prefix}${block}${suffix}`;
  nomadnetEditorDraft = `${before}${text}${after}`;
  setNomadNetEditorCursor(input, start + text.length, scrollTop);
}

function applyNomadNetStyle(input, symbol, scrollTop, rawSelection = null) {
  const selection = rawSelection || getNomadNetRawSelection(input);

  if (selection === null || selection.start === selection.end) {
    input.focus();
    return;
  }

  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const transformed = applyNomadNetStyleTransform(nomadnetEditorDraft, start, end, symbol);
  nomadnetEditorDraft = transformed.text;
  setNomadNetEditorCursor(input, transformed.selectionEnd, scrollTop);
}

function applyNomadNetStyleTransform(source, start, end, symbol) {
  if (symbol.style === "reset") {
    return resetNomadNetStyle(source, start, end);
  }

  return applyStyleTransform(source, start, end, symbol);
}

function applyNomadNetLinePrefix(input, prefix, placeholder, scrollTop, rawSelection = null) {
  if (prefix === ">") {
    applyNomadNetHeading(input, placeholder, scrollTop, rawSelection);
    return;
  }

  const range = getNomadNetRawLineRange(nomadnetEditorDraft, rawSelection || getNomadNetRawSelection(input));
  const selectedBlock = nomadnetEditorDraft.slice(range.start, range.end);
  const block = selectedBlock || placeholder;
  const prefixed = block
    .split("\n")
    .map((line) => applyLinePrefix(line, prefix))
    .join("\n");
  nomadnetEditorDraft = `${nomadnetEditorDraft.slice(0, range.start)}${prefixed}${nomadnetEditorDraft.slice(range.end)}`;
  setNomadNetEditorCursor(input, range.start + prefixed.length, scrollTop);
}

function applyNomadNetHeading(input, placeholder, scrollTop, rawSelection = null) {
  const range = getNomadNetRawLineRange(nomadnetEditorDraft, rawSelection || getNomadNetRawSelection(input));
  const selectedBlock = nomadnetEditorDraft.slice(range.start, range.end);
  const block = selectedBlock || placeholder;
  const toggled = block
    .split("\n")
    .map(toggleHeadingPrefix)
    .join("\n");
  nomadnetEditorDraft = `${nomadnetEditorDraft.slice(0, range.start)}${toggled}${nomadnetEditorDraft.slice(range.end)}`;
  setNomadNetEditorCursor(input, range.start + toggled.length, scrollTop);
}

function getNomadNetRawLineRange(source, selection) {
  if (selection === null) {
    return {
      start: source.length,
      end: source.length,
    };
  }

  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);
  const lineStart = source.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const endProbe = end > start ? end - 1 : end;
  const lineEndIndex = source.indexOf("\n", Math.max(0, endProbe));

  return {
    start: lineStart,
    end: lineEndIndex === -1 ? source.length : lineEndIndex,
  };
}

function insertMessageText(input, text) {
  const source = serializeMessageEditor(input);
  const selection = getMessageRawSelection(input, source);
  const start = selection === null ? source.length : Math.min(selection.start, selection.end);
  const end = selection === null ? start : Math.max(selection.start, selection.end);

  messageDraft = `${source.slice(0, start)}${text}${source.slice(end)}`;
  setMessageEditorCursor(input, start + text.length);
}

function getMessageRawSelection(input, source) {
  const selection = getEditorSelectionOffsets(input);

  if (selection === null) {
    return messageEditorSelection;
  }

  const start = Math.min(selection.start, selection.end);
  const end = Math.max(selection.start, selection.end);

  if (input.dataset.raw === "true") {
    return { start, end };
  }

  return editorSelectionToRawRange(input, source)
    || visibleSelectionToRawRange(source, start, end);
}

function setMessageEditorCursor(input, rawOffset) {
  renderMessageEditorContent(input, messageDraft);
  input.focus();

  if (input.dataset.raw === "true") {
    setEditorSelectionOffsets(input, rawOffset, rawOffset);
    messageEditorSelection = {
      start: rawOffset,
      end: rawOffset,
    };
  } else {
    const point = rawOffsetToEditorLinePoint(messageDraft, rawOffset);
    setEditorLinePointSelection(input, point.lineIndex, point.offset);
    messageEditorSelection = getEditorSelectionOffsets(input);
  }

  resizeMessageInput(input);
}

function applyMessageStyle(input, symbol) {
  const selection = getEditorSelectionOffsets(input);
  const linePoints = input.dataset.raw === "true" ? null : getEditorSelectionLinePoints(input);

  if (selection === null || selection.start === selection.end) {
    input.focus();
    restoreCollapsedStyleCursor(input, selection, linePoints);
    return;
  }

  messageDraft = serializeMessageEditor(input);
  const rawRange = input.dataset.raw === "true"
    ? {
      start: Math.min(selection.start, selection.end),
      end: Math.max(selection.start, selection.end),
    }
    : editorSelectionToRawRange(input, messageDraft) || visibleSelectionToRawRange(messageDraft, selection.start, selection.end);
  const transformed = applyStyleTransform(messageDraft, rawRange.start, rawRange.end, symbol);
  messageDraft = transformed.text;
  renderMessageEditorContent(input, messageDraft);
  input.focus();
  collapseTransformedStyleSelection(input, transformed, symbol, linePoints);
  resizeMessageInput(input);
}

function applyStyleTransform(source, start, end, symbol) {
  if (symbol.style === "foreground") {
    return toggleColorStyle(source, start, end, "foreground", symbol.colorCode || "");
  }

  if (symbol.style === "background") {
    return toggleColorStyle(source, start, end, "background", symbol.colorCode || "");
  }

  if (symbol.style === "reset") {
    return resetInlineStyle(source, start, end);
  }

  return toggleInlineStyle(source, start, end, symbol);
}

function toggleColorStyle(source, selectionStart, selectionEnd, key, colorCode) {
  const parsed = parseInlineStyleText(source);
  const visibleStart = findVisibleStart(parsed.chars, selectionStart);
  const visibleEnd = findVisibleEnd(parsed.chars, selectionEnd);

  if (visibleStart >= visibleEnd) {
    return {
      text: source,
      selectionStart,
      selectionEnd,
      visibleSelectionStart: visibleStart,
      visibleSelectionEnd: visibleEnd,
    };
  }

  for (let index = visibleStart; index < visibleEnd; index += 1) {
    if (parsed.chars[index].hidden) {
      continue;
    }

    const current = normalizeColorCode(parsed.chars[index].state[key]);
    parsed.chars[index].state[key] = current === normalizeColorCode(colorCode) ? "" : colorCode;
  }

  return serializeInlineStyleText(parsed.chars, visibleStart, visibleEnd);
}

function prefixMessageLine(input, prefix, placeholder) {
  if (prefix === ">") {
    toggleHeadingLine(input, placeholder);
    return;
  }

  const selection = getEditorSelectionOffsets(input);
  const restoreSelection = selection === null ? null : { ...selection };
  const restoreLinePoints = input.dataset.raw === "true" ? null : getEditorSelectionLinePoints(input);
  const value = serializeMessageEditor(input);
  const lineRange = getEditorSerializedLineRange(input, value, selection);
  const selectedBlock = value.slice(lineRange.start, lineRange.end);
  const block = selectedBlock || placeholder;
  const prefixed = block
    .split("\n")
    .map((line) => applyLinePrefix(line, prefix))
    .join("\n");

  messageDraft = `${value.slice(0, lineRange.start)}${prefixed}${value.slice(lineRange.end)}`;
  renderMessageEditorContent(input, messageDraft);
  input.focus();
  restoreEditorLineSelection(input, restoreLinePoints, restoreSelection);
  resizeMessageInput(input);
}

function toggleHeadingLine(input, placeholder) {
  const selection = getEditorSelectionOffsets(input);
  const restoreSelection = selection === null ? null : { ...selection };
  const restoreLinePoints = input.dataset.raw === "true" ? null : getEditorSelectionLinePoints(input);
  const value = serializeMessageEditor(input);
  const lineRange = getEditorSerializedLineRange(input, value, selection);
  const selectedBlock = value.slice(lineRange.start, lineRange.end);
  const block = selectedBlock || placeholder;
  const toggled = block
    .split("\n")
    .map(toggleHeadingPrefix)
    .join("\n");

  messageDraft = `${value.slice(0, lineRange.start)}${toggled}${value.slice(lineRange.end)}`;
  renderMessageEditorContent(input, messageDraft);
  input.focus();
  restoreEditorLineSelection(input, restoreLinePoints, restoreSelection);
  resizeMessageInput(input);
}

function applyLinePrefix(line, prefix) {
  const parts = splitLinePrefixes(line);
  const alignment = parts.alignment === prefix ? "" : prefix;

  return `${alignment}${parts.heading}${parts.body}`;
}

function toggleHeadingPrefix(line) {
  const parts = splitLinePrefixes(line);
  const heading = parts.heading === "" ? ">" : "";

  return `${parts.alignment}${heading}${parts.body}`;
}

function splitLinePrefixes(line) {
  let body = line;
  let alignment = "";
  let heading = "";

  const alignmentMatch = body.match(/^`[clra]/);

  if (alignmentMatch !== null) {
    alignment = alignmentMatch[0];
    body = body.slice(alignment.length);
  }

  const headingMatch = body.match(/^>+\s*/);

  if (headingMatch !== null) {
    heading = ">";
    body = body.slice(headingMatch[0].length);
  }

  return {
    alignment,
    heading,
    body,
  };
}

function getEditorSerializedLineRange(input, serialized, selection) {
  const linePoints = input.dataset.raw === "true" ? null : getEditorSelectionLinePoints(input);

  if (linePoints !== null) {
    const ranges = getSerializedLineRanges(serialized);
    const ordered = getOrderedLineSelectionPoints(linePoints);
    const startLine = ranges[ordered.start.lineIndex];
    const endLine = ranges[ordered.end.lineIndex];

    if (startLine && endLine) {
      return {
        start: startLine.start,
        end: endLine.end,
      };
    }
  }

  return getSerializedLineRangeByIndex(serialized, getEditorSelectedLineIndex(input, selection));
}

function getSerializedLineRangeByIndex(serialized, lineIndex) {
  const ranges = getSerializedLineRanges(serialized);
  const line = ranges[Math.max(0, lineIndex)];

  if (!line) {
    return {
      start: serialized.length,
      end: serialized.length,
    };
  }

  return {
    start: line.start,
    end: line.end,
  };
}

function getEditorSelectedLineIndex(input, selection) {
  const offset = selection === null ? getMessagePlainText(input).length : Math.min(selection.start, selection.end);
  const textBeforeSelection = getMessagePlainText(input).slice(0, offset);
  return textBeforeSelection.split("\n").length - 1;
}

function getEditorRawLineRange(source, selection) {
  const visibleOffset = selection === null ? getVisibleLength(source) : Math.min(selection.start, selection.end);
  const rawOffset = visibleOffsetToRawOffset(source, visibleOffset);
  const lineStart = source.lastIndexOf("\n", Math.max(0, rawOffset - 1)) + 1;
  const lineEndIndex = source.indexOf("\n", rawOffset);

  return {
    start: lineStart,
    end: lineEndIndex === -1 ? source.length : lineEndIndex,
  };
}

function visibleOffsetToRawOffset(source, visibleOffset) {
  const parsed = parseInlineStyleText(source);
  const visibleChars = getStyleVisibleChars(parsed.chars);

  if (visibleOffset <= 0) {
    return 0;
  }

  const char = visibleChars[Math.min(visibleOffset, visibleChars.length) - 1];
  return char ? char.rawEnd : source.length;
}

function getVisibleLength(source) {
  return getStyleVisibleChars(parseInlineStyleText(source).chars).length;
}

function insertMessageBlock(input, block) {
  const source = serializeMessageEditor(input);
  const selection = getMessageRawSelection(input, source);
  const start = selection === null ? source.length : Math.min(selection.start, selection.end);
  const end = selection === null ? start : Math.max(selection.start, selection.end);
  const before = source.slice(0, start);
  const after = source.slice(end);
  const prefix = before === "" || before.endsWith("\n") ? "" : "\n";
  const suffix = after === "" ? "\n" : after.startsWith("\n") ? "" : "\n";
  const text = `${prefix}${block}${suffix}`;
  messageDraft = `${before}${text}${after}`;
  setMessageEditorCursor(input, start + text.length);
}

function restoreVisibleSelection(input, selection) {
  if (selection === null) {
    return;
  }

  const visibleLength = getVisibleLength(messageDraft);
  const start = Math.min(selection.start, visibleLength);
  const end = Math.min(selection.end, visibleLength);
  setEditorSelectionOffsets(input, start, end);
  messageEditorSelection = { start, end };
}

function restoreEditorLineSelection(input, linePoints, fallbackSelection) {
  if (linePoints !== null) {
    setEditorLinePointRangeSelection(input, linePoints);
    messageEditorSelection = getEditorSelectionOffsets(input);
    return;
  }

  restoreVisibleSelection(input, fallbackSelection);
}

function collapseTransformedStyleSelection(input, transformed, symbol, originalLinePoints) {
  if (input.dataset.raw === "true") {
    setEditorSelectionOffsets(input, transformed.selectionEnd, transformed.selectionEnd);
    messageEditorSelection = {
      start: transformed.selectionEnd,
      end: transformed.selectionEnd,
    };
    return;
  }

  if (originalLinePoints !== null) {
    const endPoint = getOrderedLineSelectionPoints(originalLinePoints).end;
    setEditorLinePointSelection(input, endPoint.lineIndex, endPoint.offset);
    messageEditorSelection = getEditorSelectionOffsets(input);
    return;
  }

  const cursor = transformed.visibleSelectionEnd;
  setEditorSelectionOffsets(input, cursor, cursor);
  messageEditorSelection = {
    start: cursor,
    end: cursor,
  };
}

function restoreCollapsedStyleCursor(input, selection, linePoints) {
  if (input.dataset.raw === "true") {
    if (selection !== null) {
      setEditorSelectionOffsets(input, selection.end, selection.end);
      messageEditorSelection = {
        start: selection.end,
        end: selection.end,
      };
    }

    return;
  }

  if (linePoints !== null) {
    const point = getOrderedLineSelectionPoints(linePoints).end;
    setEditorLinePointSelection(input, point.lineIndex, point.offset);
    messageEditorSelection = getEditorSelectionOffsets(input);
  }
}

function renderMessageEditorContent(input, source) {
  input.replaceChildren();

  if (source === "") {
    return;
  }

  if (input.dataset.raw === "true") {
    input.textContent = source;
    return;
  }

  input.appendChild(renderMicronContent(source));
}

function serializeMessageEditor(input) {
  if (input.dataset.raw === "true") {
    return input.textContent.replace(/\r\n/g, "\n");
  }

  const content = input.querySelector(".micron-content");
  const root = content || input;
  const lines = [];
  const lineNodes = Array.from(root.querySelectorAll(".micron-line, .micron-divider"));

  if (lineNodes.length === 0) {
    return getMessagePlainText(input);
  }

  for (const line of lineNodes) {
    if (line.classList.contains("micron-divider")) {
      lines.push(line.dataset.micronSource || "-");
      continue;
    }

    lines.push(`${serializeMessageLinePrefix(line)}${serializeMessageInlineNode(line)}`);
  }

  return lines.join("\n");
}

function serializeMessageLinePrefix(line) {
  let prefix = "";

  if (line.classList.contains("micron-align-c")) {
    prefix += "`c";
  }

  if (line.classList.contains("micron-align-r")) {
    prefix += "`r";
  }

  if (line.classList.contains("micron-align-a")) {
    prefix += "`a";
  }

  if (line.classList.contains("micron-heading")) {
    prefix += ">";
  }

  return prefix;
}

function serializeMessageInlineNode(root) {
  const state = createInlineStyleState();
  const output = [];

  function appendToken(token) {
    output.push(token);
  }

  function walk(node, inherited) {
    if (node.nodeType === Node.TEXT_NODE) {
      applyInlineStyleTransition(state, inherited, appendToken);
      output.push(escapeInlineVisibleText(node.nodeValue || ""));
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (node.dataset && typeof node.dataset.micronSymbol === "string") {
      applyInlineStyleTransition(state, inherited, appendToken);
      output.push(escapeInlineVisibleText(node.dataset.micronSymbol));
      return;
    }

    const next = mergeElementInlineState(inherited, node);

    for (const child of Array.from(node.childNodes)) {
      walk(child, next);
    }
  }

  for (const child of Array.from(root.childNodes)) {
    walk(child, createInlineStyleState());
  }

  applyInlineStyleTransition(state, createInlineStyleState(), appendToken);
  return output.join("");
}

function mergeElementInlineState(baseState, node) {
  const state = cloneInlineStyleState(baseState);

  if (node.classList.contains("micron-bold") || node.tagName === "B" || node.tagName === "STRONG") {
    state.bold = true;
  }

  if (node.classList.contains("micron-italic") || node.tagName === "I" || node.tagName === "EM") {
    state.italic = true;
  }

  if (node.classList.contains("micron-underline") || node.tagName === "U") {
    state.underline = true;
  }

  if (node.style.color !== "") {
    state.foreground = cssColorToMicronColor(node.style.color);
  }

  if (node.style.backgroundColor !== "") {
    state.background = cssColorToMicronColor(node.style.backgroundColor);
  }

  return state;
}

function getMessagePlainText(input) {
  return input.innerText.replace(/\r\n/g, "\n").replace(/\n$/, "");
}

function getEditorSelectionOffsets(input) {
  const selection = window.getSelection();

  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!input.contains(range.startContainer) || !input.contains(range.endContainer)) {
    return null;
  }

  return {
    start: getEditorTextOffset(input, range.startContainer, range.startOffset),
    end: getEditorTextOffset(input, range.endContainer, range.endOffset),
  };
}

function getEditorTextOffset(root, node, offset) {
  let total = 0;
  const lines = getEditorLineNodes(root);

  if (lines.length === 0) {
    return getPlainDomTextOffset(root, node, offset);
  }

  for (const line of lines) {
    if (line.contains(node)) {
      return total + getLineDomTextOffset(line, node, offset);
    }

    total += getVisibleLineTextLength(line) + 1;
  }

  return total > 0 ? total - 1 : 0;
}

function editorSelectionToRawRange(input, source) {
  const points = getEditorSelectionLinePoints(input);

  if (points === null) {
    return null;
  }

  const ranges = getSerializedLineRanges(source);
  const ordered = getOrderedLineSelectionPoints(points);
  const startPoint = ordered.start;
  const endPoint = ordered.end;
  const startLine = ranges[startPoint.lineIndex];
  const endLine = ranges[endPoint.lineIndex];

  if (!startLine || !endLine) {
    return null;
  }

  return {
    start: startLine.start + lineVisibleOffsetToRawOffset(startLine.text, startPoint.offset),
    end: endLine.start + lineVisibleOffsetToRawOffset(endLine.text, endPoint.offset),
  };
}

function getOrderedLineSelectionPoints(points) {
  const startFirst = points.start.lineIndex < points.end.lineIndex || (
    points.start.lineIndex === points.end.lineIndex && points.start.offset <= points.end.offset
  );

  return {
    start: startFirst ? points.start : points.end,
    end: startFirst ? points.end : points.start,
  };
}

function getEditorSelectionLinePoints(input) {
  const selection = window.getSelection();

  if (selection === null || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const lines = getEditorLineNodes(input);

  if (lines.length === 0) {
    return null;
  }

  const start = getEditorLinePoint(lines, range.startContainer, range.startOffset);
  const end = getEditorLinePoint(lines, range.endContainer, range.endOffset);

  if (start !== null && end !== null) {
    return { start, end };
  }

  return getEditorSelectionLinePointsByIntersection(lines, range);
}

function getEditorLineNodes(root) {
  return Array.from(root.querySelectorAll(".micron-line, .micron-divider"));
}

function getEditorLinePoint(lines, node, offset) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.contains(node)) {
      return {
        lineIndex: index,
        offset: normalizeEditorLineOffset(line, getLineDomTextOffset(line, node, offset)),
      };
    }
  }

  return null;
}

function getEditorSelectionLinePointsByIntersection(lines, range) {
  let start = null;
  let end = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!rangeIntersectsNodeContents(range, line)) {
      continue;
    }

    const lineLength = getVisibleLineTextLength(line);
    const startOffset = line.contains(range.startContainer)
      ? normalizeEditorLineOffset(line, getLineDomTextOffset(line, range.startContainer, range.startOffset))
      : 0;
    const endOffset = line.contains(range.endContainer)
      ? normalizeEditorLineOffset(line, getLineDomTextOffset(line, range.endContainer, range.endOffset))
      : lineLength;
    const lineStart = {
      lineIndex: index,
      offset: start === null ? startOffset : 0,
    };
    const lineEnd = {
      lineIndex: index,
      offset: endOffset,
    };

    if (start === null) {
      start = lineStart;
    }

    end = lineEnd;
  }

  if (start === null || end === null) {
    return null;
  }

  return { start, end };
}

function setEditorRawRangeSelection(input, source, rawStart, rawEnd) {
  setEditorLinePointRangeSelection(input, {
    start: rawOffsetToEditorLinePoint(source, rawStart),
    end: rawOffsetToEditorLinePoint(source, rawEnd),
  });
}

function rawOffsetToEditorLinePoint(source, rawOffset) {
  const ranges = getSerializedLineRanges(source);
  const offset = Math.max(0, Math.min(source.length, rawOffset));

  for (let index = 0; index < ranges.length; index += 1) {
    const range = ranges[index];
    const isLast = index === ranges.length - 1;

    if (offset <= range.end || isLast) {
      return {
        lineIndex: index,
        offset: lineRawOffsetToVisibleOffset(range.text, offset - range.start),
      };
    }
  }

  return {
    lineIndex: Math.max(0, ranges.length - 1),
    offset: 0,
  };
}

function rangeIntersectsNodeContents(range, node) {
  const nodeRange = document.createRange();
  nodeRange.selectNodeContents(node);

  return range.compareBoundaryPoints(Range.END_TO_START, nodeRange) > 0
    && range.compareBoundaryPoints(Range.START_TO_END, nodeRange) < 0;
}

function setEditorLinePointSelection(input, lineIndex, lineOffset) {
  const lines = getEditorLineNodes(input);
  const line = lines[lineIndex];

  if (!line) {
    setEditorSelectionOffsets(input, 0, 0);
    return;
  }

  const point = findLineDomPoint(line, lineOffset);
  const range = document.createRange();
  range.setStart(point.node, point.offset);
  range.setEnd(point.node, point.offset);

  const selection = window.getSelection();

  if (selection === null) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function setEditorLinePointRangeSelection(input, points) {
  const lines = getEditorLineNodes(input);
  const ordered = getOrderedLineSelectionPoints(points);
  const startLine = lines[ordered.start.lineIndex];
  const endLine = lines[ordered.end.lineIndex];

  if (!startLine || !endLine) {
    setEditorSelectionOffsets(input, 0, 0);
    return;
  }

  const startPoint = findLineDomPoint(startLine, ordered.start.offset);
  const endPoint = findLineDomPoint(endLine, ordered.end.offset);
  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);

  const selection = window.getSelection();

  if (selection === null) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function findLineDomPoint(line, targetOffset) {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let offset = targetOffset;
  let lastText = null;

  while (true) {
    const node = walker.nextNode();

    if (node === null) {
      break;
    }

    lastText = node;

    const icon = getMicronSymbolIcon(node);

    if (icon !== null) {
      const iconLength = getMicronSymbolLength(icon);

      if (offset <= iconLength) {
        return getMicronSymbolBoundaryPoint(icon, offset > 0);
      }

      offset -= iconLength;
      continue;
    }

    if (offset <= node.nodeValue.length) {
      return {
        node,
        offset,
      };
    }

    offset -= node.nodeValue.length;
  }

  if (lastText !== null) {
    return {
      node: lastText,
      offset: lastText.nodeValue.length,
    };
  }

  return {
    node: line,
    offset: 0,
  };
}

function normalizeEditorLineOffset(line, offset) {
  const lineLength = getVisibleLineTextLength(line);

  if (offset <= 0 || lineLength === 0) {
    return 0;
  }

  return Math.max(0, Math.min(lineLength, offset));
}

function getSerializedLineRanges(source) {
  const ranges = [];
  let start = 0;

  while (start <= source.length) {
    const end = source.indexOf("\n", start);
    const lineEnd = end === -1 ? source.length : end;
    ranges.push({
      start,
      end: lineEnd,
      text: source.slice(start, lineEnd),
    });

    if (end === -1) {
      break;
    }

    start = end + 1;
  }

  return ranges;
}

function lineVisibleOffsetToRawOffset(line, visibleOffset) {
  const visibleChars = getStyleVisibleChars(parseInlineStyleText(line).chars);

  if (visibleChars.length === 0) {
    return line.length;
  }

  if (visibleOffset <= 0) {
    return visibleChars[0].rawStart;
  }

  if (visibleOffset >= visibleChars.length) {
    return visibleChars[visibleChars.length - 1].rawEnd;
  }

  return visibleChars[visibleOffset].rawStart;
}

function lineRawOffsetToVisibleOffset(line, rawOffset) {
  if (isMicronDividerSource(line)) {
    return rawOffset <= 0 ? 0 : 32;
  }

  const visibleChars = getStyleVisibleChars(parseInlineStyleText(line).chars);
  const offset = Math.max(0, Math.min(line.length, rawOffset));
  let visibleOffset = 0;

  for (const char of visibleChars) {
    if (char.rawEnd > offset) {
      break;
    }

    visibleOffset += 1;
  }

  return visibleOffset;
}

function isMicronDividerSource(line) {
  const trimmed = String(line).trim();
  return trimmed === "-" || (trimmed.length === 2 && trimmed[0] === "-");
}

function getPlainDomTextOffset(root, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getLineDomTextOffset(line, node, offset) {
  let total = 0;

  if (node.nodeType === Node.ELEMENT_NODE) {
    return getLineElementDomTextOffset(line, node, offset);
  }

  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);

  while (true) {
    const current = walker.nextNode();

    if (current === null) {
      break;
    }

    const icon = getMicronSymbolIcon(current);

    if (icon !== null) {
      const iconLength = getMicronSymbolLength(icon);

      if (current === node) {
        return total + (offset > 0 ? iconLength : 0);
      }

      total += iconLength;
      continue;
    }

    if (current === node) {
      return total + offset;
    }

    total += current.nodeValue.length;
  }

  return total;
}

function getVisibleLineTextLength(line) {
  let total = 0;
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);

  while (true) {
    const current = walker.nextNode();

    if (current === null) {
      break;
    }

    const icon = getMicronSymbolIcon(current);

    if (icon !== null) {
      total += getMicronSymbolLength(icon);
      continue;
    }

    total += current.nodeValue.length;
  }

  return total;
}

function getMicronSymbolIcon(node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;

  if (!element) {
    return null;
  }

  return element.closest(".micron-symbol-icon[data-micron-symbol]");
}

function getMicronSymbolLength(icon) {
  return (icon.dataset.micronSymbol || "").length;
}

function getMicronSymbolBoundaryPoint(icon, after) {
  const parent = icon.parentNode;

  if (!parent) {
    return {
      node: icon,
      offset: 0,
    };
  }

  const offset = Array.prototype.indexOf.call(parent.childNodes, icon) + (after ? 1 : 0);
  return {
    node: parent,
    offset,
  };
}

function getLineElementDomTextOffset(line, node, offset) {
  let total = 0;
  const range = document.createRange();
  range.setStart(line, 0);

  try {
    range.setEnd(node, offset);
  } catch (error) {
    return getVisibleLineTextLength(line);
  }

  const fragment = range.cloneContents();
  const icons = Array.from(fragment.querySelectorAll(".micron-symbol-icon[data-micron-symbol]"));

  for (const icon of icons) {
    total += getMicronSymbolLength(icon);
    icon.textContent = "";
  }

  total += fragment.textContent.length;
  return total;
}

function visibleSelectionToRawRange(source, visibleStart, visibleEnd) {
  const parsed = parseInlineStyleText(source);
  const visibleChars = getStyleVisibleChars(parsed.chars);
  const startIndex = Math.min(visibleStart, visibleEnd);
  const endIndex = Math.max(visibleStart, visibleEnd);
  const startChar = visibleChars[startIndex];
  const nextChar = visibleChars[endIndex];
  const endChar = visibleChars[endIndex - 1];

  return {
    start: startChar ? startChar.rawStart : source.length,
    end: nextChar ? nextChar.rawStart : endChar ? endChar.rawEnd : source.length,
  };
}

function documentVisibleSelectionToRawRange(source, visibleStart, visibleEnd) {
  const parsed = parseInlineStyleText(source);
  const visibleChars = getDocumentVisibleChars(parsed.chars);
  const startIndex = Math.min(visibleStart, visibleEnd);
  const endIndex = Math.max(visibleStart, visibleEnd);
  const startChar = visibleChars[startIndex];
  const nextChar = visibleChars[endIndex];
  const endChar = visibleChars[endIndex - 1];

  return {
    start: startChar ? startChar.rawStart : source.length,
    end: nextChar ? nextChar.rawStart : endChar ? endChar.rawEnd : source.length,
  };
}

function rawRangeToVisibleSelection(source, rawStart, rawEnd) {
  const parsed = parseInlineStyleText(source);
  const visibleChars = getStyleVisibleChars(parsed.chars);
  const start = visibleChars.findIndex((char) => char.rawEnd > rawStart);
  const end = visibleChars.findIndex((char) => char.rawStart >= rawEnd);

  return {
    start: start === -1 ? visibleChars.length : start,
    end: end === -1 ? visibleChars.length : end,
  };
}

function rawRangeToDocumentVisibleSelection(source, rawStart, rawEnd) {
  const parsed = parseInlineStyleText(source);
  const visibleChars = getDocumentVisibleChars(parsed.chars);
  const start = visibleChars.findIndex((char) => char.rawEnd > rawStart);
  const end = visibleChars.findIndex((char) => char.rawStart >= rawEnd);

  return {
    start: start === -1 ? visibleChars.length : start,
    end: end === -1 ? visibleChars.length : end,
  };
}

function getStyleVisibleChars(chars) {
  return chars.filter((char) => !char.hidden && char.value !== "\n");
}

function getDocumentVisibleChars(chars) {
  return chars.filter((char) => !char.hidden);
}

function rememberMessageEditorSelection(input) {
  messageEditorSelection = getEditorSelectionOffsets(input);
}

function rememberNomadNetEditorSelection(input) {
  if (input instanceof HTMLTextAreaElement) {
    nomadnetEditorSelection = {
      start: input.selectionStart,
      end: input.selectionEnd,
    };

    if (input.selectionStart !== input.selectionEnd) {
      nomadnetEditorRawSelection = {
        start: input.selectionStart,
        end: input.selectionEnd,
      };
    }

    nomadnetEditorLinePoints = null;
    return;
  }

  const selection = getEditorSelectionOffsets(input);

  if (selection === null) {
    return;
  }

  nomadnetEditorSelection = selection;

  const rawSelection = getNomadNetRawSelection(input);

  if (rawSelection !== null && rawSelection.start !== rawSelection.end) {
    nomadnetEditorRawSelection = rawSelection;
  }

  if (input.dataset.raw === "true") {
    nomadnetEditorLinePoints = null;
    return;
  }

  const linePoints = getEditorSelectionLinePoints(input);

  if (linePoints !== null) {
    nomadnetEditorLinePoints = linePoints;
  }
}

function restoreNomadNetTextareaSelection(input, shouldFocus = false) {
  const selection = nomadnetEditorRawSelection || nomadnetEditorSelection;
  const fallback = nomadnetEditorDraft.length;
  const start = selection === null
    ? fallback
    : Math.max(0, Math.min(nomadnetEditorDraft.length, selection.start));
  const end = selection === null
    ? fallback
    : Math.max(0, Math.min(nomadnetEditorDraft.length, selection.end));

  if (shouldFocus) {
    try {
      input.focus({ preventScroll: true });
    } catch (error) {
      input.focus();
    }
  }

  input.setSelectionRange(start, end);
  nomadnetEditorSelection = { start, end };
  nomadnetEditorRawSelection = { start, end };
}

function restoreNomadNetRenderedSelection(input, shouldFocus = false) {
  const selection = nomadnetEditorRawSelection;

  if (selection === null) {
    return;
  }

  const start = Math.max(0, Math.min(nomadnetEditorDraft.length, selection.start));
  const end = Math.max(0, Math.min(nomadnetEditorDraft.length, selection.end));

  if (shouldFocus) {
    try {
      input.focus({ preventScroll: true });
    } catch (error) {
      input.focus();
    }
  }

  setEditorRawRangeSelection(input, nomadnetEditorDraft, start, end);
  nomadnetEditorSelection = getEditorSelectionOffsets(input);
  nomadnetEditorRawSelection = { start, end };
}

function updateMessageEditorSelectionStatus(node) {
  if (!showMessageUnprintable) {
    node.textContent = "";
    return;
  }

  if (messageEditorSelection === null) {
    node.textContent = "selection: none";
    return;
  }

  node.textContent = `selection: ${messageEditorSelection.start}..${messageEditorSelection.end}`;
}

function updateNomadNetEditorSelectionStatus(node) {
  if (!showNomadNetEditorUnprintable) {
    node.textContent = "";
    return;
  }

  if (nomadnetEditorSelection === null) {
    node.textContent = "selection: none";
    return;
  }

  node.textContent = `selection: ${nomadnetEditorSelection.start}..${nomadnetEditorSelection.end}`;
}

function restoreMessageEditorSelection(input) {
  if (input.dataset.editor === "nomadnet" && input.dataset.raw !== "true" && nomadnetEditorLinePoints !== null) {
    setEditorLinePointRangeSelection(input, nomadnetEditorLinePoints);
    return;
  }

  if (messageEditorSelection === null) {
    return;
  }

  setEditorSelectionOffsets(input, messageEditorSelection.start, messageEditorSelection.end);
}

function runNomadNetEditorOperation(input, operation) {
  const savedDraft = messageDraft;
  const savedSelection = messageEditorSelection;
  const savedUnprintable = showMessageUnprintable;
  const savedScrollTop = input.scrollTop;
  const savedNomadNetLinePoints = nomadnetEditorLinePoints;

  messageDraft = nomadnetEditorDraft;
  messageEditorSelection = nomadnetEditorSelection;
  showMessageUnprintable = showNomadNetEditorUnprintable;

  operation();

  nomadnetEditorDraft = messageDraft;
  nomadnetEditorSelection = messageEditorSelection;
  nomadnetEditorLinePoints = getEditorSelectionLinePoints(input) || savedNomadNetLinePoints;
  showNomadNetEditorUnprintable = showMessageUnprintable;

  messageDraft = savedDraft;
  messageEditorSelection = savedSelection;
  showMessageUnprintable = savedUnprintable;

  input.dataset.raw = showNomadNetEditorUnprintable ? "true" : "false";
  resizeNomadNetEditorInput(input);
  input.scrollTop = Math.min(savedScrollTop, input.scrollHeight);
}

function setEditorSelectionOffsets(input, start, end) {
  const rangeStart = findEditorDomPoint(input, start);
  const rangeEnd = findEditorDomPoint(input, end);

  if (rangeStart === null || rangeEnd === null) {
    return;
  }

  const range = document.createRange();
  range.setStart(rangeStart.node, rangeStart.offset);
  range.setEnd(rangeEnd.node, rangeEnd.offset);

  const selection = window.getSelection();

  if (selection === null) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function findEditorDomPoint(root, targetOffset) {
  const lines = getEditorLineNodes(root);

  if (lines.length > 0) {
    return findEditorLineDomPoint(lines, targetOffset);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let offset = targetOffset;
  let lastText = null;

  while (true) {
    const node = walker.nextNode();

    if (node === null) {
      break;
    }

    lastText = node;

    if (offset <= node.nodeValue.length) {
      return {
        node,
        offset,
      };
    }

    offset -= node.nodeValue.length;
  }

  if (lastText !== null) {
    return {
      node: lastText,
      offset: lastText.nodeValue.length,
    };
  }

  return {
    node: root,
    offset: 0,
  };
}

function findEditorLineDomPoint(lines, targetOffset) {
  let offset = Math.max(0, targetOffset);
  let lastLine = null;

  for (const line of lines) {
    const lineLength = getVisibleLineTextLength(line);
    lastLine = line;

    if (offset <= lineLength) {
      return findLineDomPoint(line, offset);
    }

    offset -= lineLength + 1;
  }

  if (lastLine !== null) {
    return findLineDomPoint(lastLine, getVisibleLineTextLength(lastLine));
  }

  return null;
}

function cssColorToMicronColor(value) {
  const rgb = String(value).match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);

  if (rgb === null) {
    return "";
  }

  return rgb.slice(1)
    .map((part) => Number(part).toString(16).padStart(2, "0"))
    .join("");
}

function toggleInlineStyle(source, selectionStart, selectionEnd, symbol) {
  const parsed = parseInlineStyleText(source);
  const visibleStart = findVisibleStart(parsed.chars, selectionStart);
  const visibleEnd = findVisibleEnd(parsed.chars, selectionEnd);

  if (visibleStart >= visibleEnd) {
    return {
      text: source,
      selectionStart,
      selectionEnd,
    };
  }

  for (let index = visibleStart; index < visibleEnd; index += 1) {
    if (parsed.chars[index].hidden) {
      continue;
    }

    const charState = parsed.chars[index].state;

    if (symbol.style === "foreground" || symbol.style === "background") {
      const key = symbol.style;
      const colorCode = symbol.colorCode || "";
      charState[key] = normalizeColorCode(charState[key]) === normalizeColorCode(colorCode) ? "" : colorCode;
    } else {
      charState[symbol.style] = !charState[symbol.style];
    }
  }

  return serializeInlineStyleText(parsed.chars, visibleStart, visibleEnd);
}

function resetInlineStyle(source, selectionStart, selectionEnd) {
  const parsed = parseInlineStyleText(source);
  const visibleStart = findVisibleStart(parsed.chars, selectionStart);
  const visibleEnd = findVisibleEnd(parsed.chars, selectionEnd);

  if (visibleStart >= visibleEnd) {
    return {
      text: source,
      selectionStart,
      selectionEnd,
    };
  }

  for (let index = visibleStart; index < visibleEnd; index += 1) {
    if (parsed.chars[index].hidden) {
      continue;
    }

    parsed.chars[index].state = createInlineStyleState();
  }

  return serializeInlineStyleText(parsed.chars, visibleStart, visibleEnd);
}

function resetNomadNetStyle(source, selectionStart, selectionEnd) {
  const unprefixed = removeLinePrefixesInRawRange(source, selectionStart, selectionEnd);
  return resetInlineStyle(unprefixed.text, unprefixed.selectionStart, unprefixed.selectionEnd);
}

function removeLinePrefixesInRawRange(source, selectionStart, selectionEnd) {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const removals = getLinePrefixRemovals(source, start, end);

  if (removals.length === 0) {
    return {
      text: source,
      selectionStart: start,
      selectionEnd: end,
    };
  }

  const ordered = [...removals].sort((left, right) => right.start - left.start);
  let text = source;

  for (const removal of ordered) {
    text = `${text.slice(0, removal.start)}${text.slice(removal.end)}`;
  }

  return {
    text,
    selectionStart: mapRawOffsetAfterRemovals(start, removals),
    selectionEnd: mapRawOffsetAfterRemovals(end, removals),
  };
}

function getLinePrefixRemovals(source, selectionStart, selectionEnd) {
  const removals = [];
  const rangeEnd = selectionEnd > selectionStart ? selectionEnd - 1 : selectionEnd;
  let lineStart = source.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;

  while (lineStart <= source.length) {
    const lineBreak = source.indexOf("\n", lineStart);
    const lineEnd = lineBreak === -1 ? source.length : lineBreak;

    if (lineStart > rangeEnd && lineStart > selectionStart) {
      break;
    }

    if (lineEnd >= selectionStart && lineStart <= rangeEnd) {
      const prefix = readLinePrefix(source, lineStart);

      if (prefix.nextIndex > lineStart) {
        removals.push({
          start: lineStart,
          end: prefix.nextIndex,
        });
      }
    }

    if (lineBreak === -1 || lineEnd >= rangeEnd) {
      break;
    }

    lineStart = lineBreak + 1;
  }

  return removals;
}

function mapRawOffsetAfterRemovals(offset, removals) {
  let mapped = offset;

  for (const removal of [...removals].sort((left, right) => left.start - right.start)) {
    const length = removal.end - removal.start;

    if (removal.end <= offset) {
      mapped -= length;
      continue;
    }

    if (removal.start < offset) {
      mapped -= offset - removal.start;
    }
  }

  return Math.max(0, mapped);
}

function parseInlineStyleText(source) {
  const chars = [];
  const state = createInlineStyleState();
  let index = 0;
  let atLineStart = true;

  while (index < source.length) {
    if (atLineStart) {
      const prefix = readLinePrefix(source, index);

      if (prefix.value !== "") {
        chars.push({
          value: prefix.value,
          rawStart: index,
          rawEnd: prefix.nextIndex,
          state: createInlineStyleState(),
          hidden: true,
        });
        index = prefix.nextIndex;
      }

      atLineStart = false;

      if (index >= source.length) {
        break;
      }
    }

    const char = source[index];

    if (char === "\\" && index + 1 < source.length) {
      chars.push({
        value: source[index + 1],
        rawStart: index,
        rawEnd: index + 2,
        state: cloneInlineStyleState(state),
        hidden: false,
      });
      index += 2;
      continue;
    }

    if (char === "`" && index + 1 < source.length) {
      const command = source[index + 1];

      if (command === "`") {
        Object.assign(state, createInlineStyleState());
        index += 2;
        continue;
      }

      if (command === "!") {
        state.bold = !state.bold;
        index += 2;
        continue;
      }

      if (command === "*") {
        state.italic = !state.italic;
        index += 2;
        continue;
      }

      if (command === "_") {
        state.underline = !state.underline;
        index += 2;
        continue;
      }

      if (command === "f") {
        state.foreground = "";
        index += 2;
        continue;
      }

      if (command === "b") {
        state.background = "";
        index += 2;
        continue;
      }

      if (command === "F" || command === "B") {
        const color = readInlineColorCode(source, index + 2);

        if (color.value !== "") {
          if (command === "F") {
            state.foreground = color.value;
          } else {
            state.background = color.value;
          }

          index = color.nextIndex;
          continue;
        }
      }
    }

    chars.push({
      value: char,
      rawStart: index,
      rawEnd: index + 1,
      state: cloneInlineStyleState(state),
      hidden: false,
    });
    atLineStart = char === "\n";
    index += 1;
  }

  return { chars };
}

function readLinePrefix(source, startIndex) {
  let index = startIndex;
  let value = "";

  if (source.slice(index, index + 2).match(/^`[clra]/)) {
    value += source.slice(index, index + 2);
    index += 2;
  }

  const heading = source.slice(index).match(/^>+\s*/);

  if (heading !== null) {
    value += heading[0];
    index += heading[0].length;
  }

  return {
    value,
    nextIndex: index,
  };
}

function serializeInlineStyleText(chars, selectedVisibleStart, selectedVisibleEnd) {
  let output = "";
  let selectionStart = 0;
  let selectionEnd = 0;
  const current = createInlineStyleState();

  for (let index = 0; index < chars.length; index += 1) {
    if (chars[index].hidden) {
      applyInlineStyleTransition(current, createInlineStyleState(), (token) => {
        output += token;
      });
      output += chars[index].value;
      continue;
    }

    applyInlineStyleTransition(current, chars[index].state, (token) => {
      output += token;
    });

    if (index === selectedVisibleStart) {
      selectionStart = output.length;
    }

    output += escapeInlineVisibleChar(chars[index].value);

    if (index + 1 === selectedVisibleEnd) {
      selectionEnd = output.length;
    }
  }

  applyInlineStyleTransition(current, createInlineStyleState(), (token) => {
    output += token;
  });

  return {
    text: output,
    selectionStart,
    selectionEnd,
    visibleSelectionStart: selectedVisibleStart,
    visibleSelectionEnd: selectedVisibleEnd,
  };
}

function applyInlineStyleTransition(current, next, append) {
  applyInlineColorTransition(current, next, append, {
    key: "foreground",
    openToken: "`F",
    closeToken: "`f",
  });
  applyInlineColorTransition(current, next, append, {
    key: "background",
    openToken: "`B",
    closeToken: "`b",
  });

  for (const key of ["bold", "italic", "underline"]) {
    if (current[key] !== next[key]) {
      append(getInlineBooleanStyleToken(key));
      current[key] = next[key];
    }
  }
}

function applyInlineColorTransition(current, next, append, spec) {
  if (current[spec.key] === next[spec.key]) {
    return;
  }

  if (current[spec.key] !== "") {
    append(spec.closeToken);
  }

  if (next[spec.key] !== "") {
    append(`${spec.openToken}${next[spec.key]}`);
  }

  current[spec.key] = next[spec.key];
}

function getInlineBooleanStyleToken(style) {
  if (style === "bold") {
    return "`!";
  }

  if (style === "italic") {
    return "`*";
  }

  if (style === "underline") {
    return "`_";
  }

  return "";
}

function findVisibleStart(chars, rawSelectionStart) {
  const index = chars.findIndex((char) => char.rawEnd > rawSelectionStart);
  return index === -1 ? chars.length : index;
}

function findVisibleEnd(chars, rawSelectionEnd) {
  const index = chars.findIndex((char) => char.rawStart >= rawSelectionEnd);
  return index === -1 ? chars.length : index;
}

function readInlineColorCode(text, startIndex) {
  let index = startIndex;
  let value = "";

  while (index < text.length && value.length < 6 && /[0-9a-fA-F]/.test(text[index])) {
    value += text[index];
    index += 1;
  }

  if (value.length === 3 || value.length === 4 || value.length === 6) {
    return {
      value,
      nextIndex: index,
    };
  }

  return {
    value: "",
    nextIndex: startIndex,
  };
}

function normalizeColorCode(colorCode) {
  return String(colorCode || "").toLowerCase();
}

function createInlineStyleState() {
  return {
    bold: false,
    italic: false,
    underline: false,
    foreground: "",
    background: "",
  };
}

function cloneInlineStyleState(state) {
  return {
    bold: state.bold,
    italic: state.italic,
    underline: state.underline,
    foreground: state.foreground,
    background: state.background,
  };
}

function escapeInlineVisibleChar(char) {
  if (char === "`" || char === "\\") {
    return `\\${char}`;
  }

  return char;
}

function escapeInlineVisibleText(text) {
  return String(text).split("").map(escapeInlineVisibleChar).join("");
}

function renderMessageContent(source, options = {}) {
  const micron = window.FriendlyNodeMicron;

  if (micron && typeof micron.render === "function") {
    return micron.render(source, options);
  }

  const fallback = document.createElement("div");
  fallback.className = "micron-content";
  fallback.textContent = String(source);
  return fallback;
}

function renderMicronContent(source, options = {}) {
  return renderMessageContent(source, {
    symbolStyle: micronSymbolStyle,
    ...options,
  });
}

function resizeMessageInput(input) {
  if (input.dataset.editor === "nomadnet") {
    resizeNomadNetEditorInput(input);
    return;
  }

  const messageList = document.querySelector(".message-list");
  const listHeight = messageList instanceof HTMLElement ? messageList.clientHeight : 240;
  const maxHeight = Math.max(48, Math.floor(listHeight / 3));

  input.style.height = "auto";
  input.style.maxHeight = `${maxHeight}px`;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

function resizeNomadNetEditorInput(input) {
  const maxHeight = 800;

  input.style.height = "auto";
  input.style.maxHeight = `${maxHeight}px`;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
}

function renderInterfaces() {
  const wrapper = document.createElement("div");

  if (window.FriendlyNodeRnsConfigEditor !== undefined) {
    wrapper.appendChild(window.FriendlyNodeRnsConfigEditor.render({ mode: "interfaces" }));
    return wrapper;
  }

  wrapper.appendChild(renderTable("Interfaces"));
  return wrapper;
}

function renderTransport() {
  const wrapper = document.createElement("div");

  wrapper.appendChild(renderTransportStatusPanel());

  if (window.FriendlyNodeRnsConfigEditor !== undefined) {
    wrapper.appendChild(window.FriendlyNodeRnsConfigEditor.render({ mode: "transport" }));
  }

  return wrapper;
}

function renderTransportStatusPanel() {
  const section = renderCollapsibleSection("transportStatus", "Transport status");
  section.classList.add("transport-status-section");

  const table = document.createElement("table");
  table.className = "transport-status-table";

  const tbody = document.createElement("tbody");
  const names = document.createElement("tr");
  const values = document.createElement("tr");

  const engine = currentStatus?.engine || {};
  const rns = engine.rns || {};
  const interfaces = Array.isArray(currentStatus?.interfaces) ? currentStatus.interfaces.length : 0;
  const peers = Array.isArray(currentStatus?.peers) ? currentStatus.peers.length : 0;

  for (const item of [
    ["RNS", rns.running ? "Running" : "Stopped"],
    ["Interfaces", String(interfaces)],
    ["Peers", String(peers)],
  ]) {
    const name = document.createElement("td");
    name.textContent = item[0];
    names.appendChild(name);

    const value = document.createElement("td");
    value.textContent = item[1];
    values.appendChild(value);
  }

  tbody.appendChild(names);
  tbody.appendChild(values);
  table.appendChild(tbody);
  section.appendChild(table);

  return section;
}

function renderSettings() {
  const wrapper = document.createElement("div");

  wrapper.appendChild(renderAccessSettings());
  wrapper.appendChild(renderRuntimeSettings());
  wrapper.appendChild(renderPathSettings());
  return wrapper;
}

function renderRuntimeSettings() {
  const runtimeBlock = renderCollapsibleSection("settingsRuntime", "Runtime");

  const details = document.createElement("div");
  details.className = "settings-compact-grid";

  const runtime = currentStatus?.runtime || {};
  const engine = currentStatus?.engine || {};
  const rns = engine.rns || {};
  const engineRuntime = engine.runtime || {};
  const activeRuntime = runtime.active || "stub";
  const availableRuntimes = Array.isArray(runtime.available) ? runtime.available : [];

  for (const [label, value] of [
    ["Active", activeRuntime],
    ["Available", String(availableRuntimes.length)],
    ["Engine", engine.running ? "running" : "stopped"],
    ["RNS runtime", rns.using_stubs ? "stub" : "native"],
    ["RNS version", rns.rns_version || "-"],
    ["LXMF version", rns.lxmf_version || "-"],
    ["Python", engineRuntime.python_path || "-"],
    ["Source", engineRuntime.source_path || "-"],
  ]) {
    details.appendChild(renderCompactSetting(label, value));
  }

  runtimeBlock.appendChild(details);

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

  return runtimeBlock;
}

function renderPathSettings() {
  const block = renderCollapsibleSection("settingsPaths", "Paths");
  const config = currentStatus?.config || {};
  const controller = currentStatus?.controller || {};
  const engine = currentStatus?.engine || {};
  const rns = engine.rns || {};

  const paths = document.createElement("div");
  paths.className = "settings-compact-grid";

  for (const [label, value] of [
    ["App config", config.app_config_path],
    ["Database", config.database_path],
    ["Clients", config.clients_dir],
    ["Reticulum config", config.rns_config_dir || rns.config_dir],
    ["NomadNet pages", config.nomadnet_pages_dir],
    ["Web root", controller.web_root],
  ]) {
    paths.appendChild(renderCompactSetting(label, value || "-"));
  }

  block.appendChild(paths);
  return block;
}

function renderCompactSetting(labelText, valueText) {
  const item = document.createElement("div");
  item.className = "settings-compact-item";

  const label = document.createElement("span");
  label.textContent = labelText;
  item.appendChild(label);

  const value = document.createElement("code");
  value.textContent = String(valueText || "-");
  item.appendChild(value);

  return item;
}

function renderAccessSettings() {
  const block = renderCollapsibleSection("settingsAccess", "Access");

  const config = currentStatus?.config || {};
  const port = config.controller_port || 8787;
  const bindHost = config.controller_host || "127.0.0.1";
  const enabled = config.ssh_access_enabled !== false;
  const host = config.ssh_tunnel_host || "";
  const user = config.ssh_tunnel_user || "";

  const row = document.createElement("label");
  row.className = "settings-checkbox-row";

  const label = document.createElement("span");
  label.textContent = "Use encrypted SSH tunnel access";
  row.appendChild(label);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = enabled;
  checkbox.onchange = () => saveSshAccessSetting({ ssh_access_enabled: checkbox.checked });
  row.appendChild(checkbox);
  block.appendChild(row);

  const bindGrid = document.createElement("div");
  bindGrid.className = "access-endpoint-grid";
  bindGrid.appendChild(renderAccessTextInput("Additional HTTP bind host", bindHost, "127.0.0.1", (value) => {
    saveSshAccessSetting({ controller_host: value });
  }));
  bindGrid.appendChild(renderAccessTextInput("HTTP bind port", String(port), "8787", (value) => {
    saveSshAccessSetting({ controller_port: Number(value) || 8787 });
  }));
  block.appendChild(bindGrid);

  block.appendChild(renderNetworkInterfacePicker(bindHost, port));

  const bindHint = document.createElement("div");
  bindHint.className = "settings-hint";
  bindHint.textContent = "FriendlyNode always keeps 127.0.0.1 open. For Tailscale direct access, add your Tailscale IP or 0.0.0.0, then apply and restart the HTTP server.";
  block.appendChild(bindHint);

  const endpoint = document.createElement("div");
  endpoint.className = "access-endpoint-grid";

  endpoint.appendChild(renderAccessTextInput("Windows SSH host", host, "192.168.88.161", (value) => {
    saveSshAccessSetting({ ssh_tunnel_host: value });
  }));
  endpoint.appendChild(renderAccessTextInput("Windows SSH user", user, "user", (value) => {
    saveSshAccessSetting({ ssh_tunnel_user: value });
  }));
  block.appendChild(endpoint);

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = enabled
    ? "Run this command on the other machine, then open the forwarded localhost URL there. FriendlyNode still listens only on localhost."
    : "SSH tunnel access is disabled in FriendlyNode settings. Local browser access still works.";
  block.appendChild(hint);

  const commandRow = document.createElement("div");
  commandRow.className = "settings-command-row";

  const command = document.createElement("code");
  command.className = "settings-command";
  command.textContent = buildSshTunnelCommand(port, host, user);
  commandRow.appendChild(command);

  const copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.textContent = "Copy";
  copyButton.onclick = () => copyTextToClipboard(command.textContent);
  commandRow.appendChild(copyButton);
  block.appendChild(commandRow);

  const browserUrl = document.createElement("code");
  browserUrl.className = "settings-command";
  browserUrl.textContent = `http://127.0.0.1:${port}/`;
  block.appendChild(browserUrl);

  block.appendChild(renderSshAccessStatus(currentStatus?.access?.ssh || null));
  block.appendChild(renderAccessHelperCommands(port, host, user));

  return block;
}

function renderAccessHelperCommands(port, host, user) {
  const panel = document.createElement("div");
  panel.className = "access-status";

  const title = document.createElement("div");
  title.className = "settings-hint";
  title.textContent = "Desktop SSH starter commands";
  panel.appendChild(title);

  for (const commandText of [
    "python scripts\\access_starter.py check",
    "python scripts\\access_starter.py setup-server",
    "python scripts\\access_starter.py setup-server --apply",
    buildAccessStarterTunnelCommand(port, host, user),
  ]) {
    const row = document.createElement("div");
    row.className = "settings-command-row";

    const command = document.createElement("code");
    command.className = "settings-command";
    command.textContent = commandText;
    row.appendChild(command);

    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.onclick = () => copyTextToClipboard(commandText);
    row.appendChild(copy);
    panel.appendChild(row);
  }

  return panel;
}

function renderNetworkInterfacePicker(bindHost, port) {
  const panel = document.createElement("div");
  panel.className = "network-interface-panel";

  const header = document.createElement("div");
  header.className = "access-status-header";

  const title = document.createElement("strong");
  title.textContent = "Network interfaces";
  header.appendChild(title);

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Scan";
  refresh.onclick = refreshNetworkInterfaces;
  header.appendChild(refresh);
  panel.appendChild(header);

  const interfaces = currentStatus?.access?.network?.interfaces || [];
  const list = document.createElement("div");
  list.className = "network-interface-list";

  for (const iface of interfaces) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = iface.address === bindHost ? "active" : "";
    button.onclick = () => saveSshAccessSetting({ controller_host: iface.address });

    const name = document.createElement("span");
    name.textContent = `${iface.name || "interface"} (${iface.kind || "network"})`;
    button.appendChild(name);

    const address = document.createElement("code");
    address.textContent = iface.address || "-";
    button.appendChild(address);
    list.appendChild(button);
  }

  panel.appendChild(list);

  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "restart-http-button";
  apply.textContent = "Apply & restart HTTP server";
  apply.onclick = () => restartHttpServerFromUi(bindHost, port);
  panel.appendChild(apply);
  return panel;
}

function renderSshAccessStatus(status) {
  const panel = document.createElement("div");
  panel.className = "access-status";

  const header = document.createElement("div");
  header.className = "access-status-header";

  const title = document.createElement("strong");
  title.textContent = status?.ready ? "SSH server ready" : "SSH server needs setup";
  header.appendChild(title);

  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.textContent = "Refresh";
  refresh.onclick = refreshSshAccessStatus;
  header.appendChild(refresh);
  panel.appendChild(header);

  const rows = [
    ["Platform", status?.platform || "-"],
    ["sshd", status?.sshd_found ? status.sshd_path || "found" : "not found"],
    ["Port 22", status?.port_open ? "listening" : "not listening"],
  ];

  for (const [label, value] of rows) {
    const row = document.createElement("div");
    row.className = "access-status-row";

    const rowLabel = document.createElement("span");
    rowLabel.textContent = label;
    row.appendChild(rowLabel);

    const rowValue = document.createElement("code");
    rowValue.textContent = String(value);
    row.appendChild(rowValue);
    panel.appendChild(row);
  }

  const notes = Array.isArray(status?.notes) ? status.notes : [];

  for (const note of notes) {
    const item = document.createElement("div");
    item.className = "settings-hint";
    item.textContent = note;
    panel.appendChild(item);
  }

  const commands = Array.isArray(status?.setup_commands) ? status.setup_commands : [];

  if (commands.length > 0 && !status?.ready) {
    const commandBlock = document.createElement("div");
    commandBlock.className = "access-setup-commands";

    for (const commandText of commands) {
      const row = document.createElement("div");
      row.className = "settings-command-row";

      const command = document.createElement("code");
      command.className = "settings-command";
      command.textContent = commandText;
      row.appendChild(command);

      const copy = document.createElement("button");
      copy.type = "button";
      copy.textContent = "Copy";
      copy.onclick = () => copyTextToClipboard(commandText);
      row.appendChild(copy);
      commandBlock.appendChild(row);
    }

    panel.appendChild(commandBlock);
  }

  return panel;
}

function renderAccessTextInput(labelText, value, placeholder, onChange) {
  const field = document.createElement("label");
  field.className = "access-field";

  const label = document.createElement("span");
  label.textContent = labelText;
  field.appendChild(label);

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.placeholder = placeholder;
  input.onchange = () => onChange(input.value);
  field.appendChild(input);

  return field;
}

function buildSshTunnelCommand(port, host, user) {
  const targetHost = host || "<windows-host>";
  const endpoint = user === "" ? targetHost : `${user}@${targetHost}`;
  return `ssh -L ${port}:127.0.0.1:${port} ${endpoint}`;
}

function buildAccessStarterTunnelCommand(port, host, user) {
  const parts = [
    "python scripts\\access_starter.py tunnel",
    "--local-port",
    String(port),
    "--remote-port",
    String(port),
  ];

  if (host !== "") {
    parts.push("--host", host);
  }

  if (user !== "") {
    parts.push("--user", user);
  }

  return parts.join(" ");
}

async function refreshSshAccessStatus() {
  try {
    const response = await fetch("/api/access/ssh/status", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`SSH access status failed: HTTP ${response.status}`);
    }

    const status = await response.json();
    currentStatus = {
      ...(currentStatus || {}),
      access: {
        ...((currentStatus || {}).access || {}),
        ssh: status,
      },
    };
    render("Settings");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

async function refreshNetworkInterfaces() {
  try {
    const response = await fetch("/api/status", {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Network interface scan failed: HTTP ${response.status}`);
    }

    currentStatus = await response.json();
    updateSummaryCards(currentStatus);
    render("Settings");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

async function restartHttpServerFromUi(host, port) {
  try {
    const response = await fetch("/api/controller/restart", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        controller_host: host,
        controller_port: Number(port) || 8787,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP server restart failed: HTTP ${response.status}`);
    }

    const content = document.querySelector("#content");

    if (content !== null) {
      const notice = document.createElement("div");
      notice.className = "settings-block";
      notice.textContent = `HTTP server is restarting on ${host}:${Number(port) || 8787}. Reopen the page at the selected address.`;
      content.replaceChildren(notice);
    }
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

function render(tab = "Client") {
  if (tab !== "Client") {
    contactMenuState = null;
    clientAccountMenuState = null;
  }

  if (tab !== "Announces") {
    announceModalState = null;
  }

  document.querySelector("h1").textContent = tab;
  renderNav(tab);
  renderClientSummaryState(tab);

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

  if (tab === "Announces") {
    content.appendChild(renderAnnounces());
    return;
  }

  if (tab === "NomadNet") {
    content.appendChild(renderNomadNet());
    return;
  }

  if (tab === "Interfaces") {
    content.appendChild(renderInterfaces());
    return;
  }

  if (tab === "Transport") {
    content.appendChild(renderTransport());
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

  if (cards.length >= 1) {
    cards[0].textContent = rns.using_stubs ? "stub runtime" : "native runtime";
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

  if (activeTab === "Client" || activeTab === "Interfaces" || activeTab === "Transport" || activeTab === "Logs" || activeTab === "Settings") {
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

    if (activeTab === "Client" || activeTab === "Interfaces" || activeTab === "Transport" || activeTab === "Logs" || activeTab === "Settings") {
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

async function saveSshAccessSetting(payload) {
  try {
    const response = await fetch("/api/config", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Config save failed: HTTP ${response.status}`);
    }

    await fetchStatus();
    render("Settings");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
      return;
    }

    copyTextFallback(text);
  } catch (error) {
    appendUiError(error);
    render("Logs");
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

async function shareClientAccount(client) {
  const text = [
    `Name: ${client.display_name || client.id || "-"}`,
    `Client id: ${client.id || "-"}`,
    `Identity: ${client.identity_hash || "-"}`,
    `LXMF destination: ${client.lxmf_destination_hash || "-"}`,
  ].join("\n");

  clientAccountMenuState = null;

  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      await navigator.clipboard.writeText(text);
    } else {
      copyTextFallback(text);
    }

    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
}

function copyTextFallback(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
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
    symbolPaletteOpen = false;
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

  if (clientAccountMenuState !== null) {
    clientAccountMenuState = null;
    render("Client");
  }

  if (announceModalState !== null) {
    announceModalState = null;
    render("Announces");
  }

  if (symbolPaletteOpen) {
    symbolPaletteOpen = false;
    render("Client");
  }

  if (nomadnetEditorPaletteOpen) {
    nomadnetEditorPaletteOpen = false;
    render("NomadNet");
  }

  if (nomadnetEditorFileDialog !== null) {
    nomadnetEditorFileDialog = null;
    render("NomadNet");
  }
});

document.addEventListener("selectionchange", () => {
  const activeElement = document.activeElement;
  const editor = activeElement instanceof HTMLElement
    ? activeElement.closest(".message-rich-input")
    : null;

  if (editor === null) {
    return;
  }

  if (activeElement !== null && activeElement.closest(".message-symbol-palette") !== null) {
    return;
  }

  const selection = getEditorSelectionOffsets(editor);

  if (selection === null) {
    return;
  }

  if (editor.dataset.editor === "nomadnet") {
    nomadnetEditorSelection = selection;
    const rawSelection = getNomadNetRawSelection(editor);

    if (rawSelection !== null && rawSelection.start !== rawSelection.end) {
      nomadnetEditorRawSelection = rawSelection;
    }

    if (editor.dataset.raw === "true") {
      nomadnetEditorLinePoints = null;
    } else {
      const linePoints = getEditorSelectionLinePoints(editor);

      if (linePoints !== null) {
        nomadnetEditorLinePoints = linePoints;
      }
    }
  } else {
    messageEditorSelection = selection;
  }
});
window.render = render;
