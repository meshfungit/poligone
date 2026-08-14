const tabs = ["Client", "Announces", "Peers", "NomadNet", "Interfaces", "Transport", "Logs", "Settings"];

let currentStatus = null;
const FRIENDLYNODE_MODULE_KEYS = Object.freeze([
  "lxmf_enabled",
  "nomadnet_enabled",
  "client_enabled",
]);

let runtimeModuleDraft = null;
let runtimeModuleApplyInFlight = false;
let lxmfReleaseOverview = null;
let lxmfReleaseLoadInFlight = false;
let lxmfReleaseInstallInFlight = false;
let lxmfReleaseLoadError = "";
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
let nomadnetBrowserSettingsModalOpen = false;
let nomadnetBrowserSaveStatus = "";
let nomadnetBrowserHistory = [];
let nomadnetBrowserHistoryIndex = -1;
const NOMADNET_BOOKMARK_ROOT_ID = "root";
const NOMADNET_BROWSER_HISTORY_LIMIT = 50;
const NOMADNET_BROWSER_STATE_VERSION = 2;
let nomadnetBrowserStorageLoaded = false;
let nomadnetBrowserStorageSaveTimer = null;
let nomadnetBookmarkStore = createDefaultNomadNetBookmarkStore();
let nomadnetBookmarkTreeModalState = null;
let nomadnetBookmarkAddGroupState = null;
let nomadnetBookmarkPageModalState = null;
let nomadnetBookmarkDragState = null;
let nomadnetBookmarkCollapsedGroups = new Set();
let nomadnetLongPressTimer = null;
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
let interfaceStatusRefreshInFlight = false;
let engineRestartInFlight = false;
let announceStream = null;
let clientStream = null;
let clientRefreshInFlight = false;
let announceQueryKey = "";
let announceFetchInFlight = false;
const announceFilters = {
  type: "all",
  name: "",
  destination: "",
  identity: "",
  lxmf: "",
  hops: 0,
};

const UNKNOWN_ASPECT_FILTER_VALUE = "__unknown_aspect__";

const ANNOUNCE_TYPE_DEFINITIONS = Object.freeze([
  {
    value: "identity",
    label: "Identity",
    aspects: ["lxmf.delivery"],
  },
  {
    value: "lxmf.propagation",
    label: "Propagation",
    aspects: ["lxmf.propagation"],
  },
  {
    value: "lxmf.propagation.control",
    label: "Propagation control",
    aspects: ["lxmf.propagation.control"],
  },
  {
    value: "call.audio",
    label: "call.audio",
    aspects: ["call.audio"],
  },
  {
    value: "phonex",
    label: "PhoneX",
    aspects: ["lxst.telephony"],
  },
  {
    value: "nomadnet",
    label: "NomadNet",
    aspects: ["nomadnetwork.node"],
  },
  {
    value: "interface",
    label: "Interface",
    aspects: ["rnstransport.discovery.interface"],
  },
  {
    value: "rnstransport.probe",
    label: "Probe",
    aspects: ["rnstransport.probe"],
  },
  {
    value: "rncp.receive",
    label: "File transfer",
    aspects: ["rncp.receive"],
  },
  {
    value: "rnx.execute",
    label: "Remote exec",
    aspects: ["rnx.execute"],
  },
  {
    value: "rserver",
    label: "RServer",
    aspects: ["rserver.web"],
  },
  {
    value: "bbs",
    label: "BBS",
    aspects: ["retibbs.bbs"],
  },
  {
    value: "styrene",
    label: "Styrene",
    aspects: ["styrene.tui.operator"],
  },
  {
    value: "service-hub",
    label: "Service hub",
    aspects: [],
  },
  {
    value: "endpoint",
    label: "Endpoint",
    aspects: [],
  },
  {
    value: "mission",
    label: "Mission",
    aspects: [],
  },
  {
    value: "beacon",
    label: "Beacon",
    aspects: [],
  },
  {
    value: "telemetry",
    label: "Telemetry",
    aspects: [],
  },  
  {
    value: "transport",
    label: "Transport",
    aspects: ["transport.*"],
  },
  {
    value: "peer",
    label: "Peer",
    aspects: [],
  },
]);

function getAnnounceAspect(announce) {
  return String(announce?.aspect || "").trim();
}

function announceAspectMatchesPattern(aspect, pattern) {
  if (pattern.endsWith(".*")) {
    return aspect.startsWith(pattern.slice(0, -1));
  }

  return aspect === pattern;
}

function getAnnounceTypeDefinitionByAspect(aspect) {
  if (aspect === "") {
    return null;
  }

  return (
    ANNOUNCE_TYPE_DEFINITIONS.find((definition) =>
      definition.aspects.some((pattern) => announceAspectMatchesPattern(aspect, pattern))
    ) || null
  );
}

function getAnnounceTypeDefinitionByValue(type) {
  return ANNOUNCE_TYPE_DEFINITIONS.find((definition) => definition.value === type) || null;
}

function getAnnounceType(announce) {
  const aspect = getAnnounceAspect(announce);
  const aspectDefinition = getAnnounceTypeDefinitionByAspect(aspect);

  if (aspectDefinition !== null) {
    return aspectDefinition.value;
  }

  if (aspect !== "") {
    return aspect;
  }

  const rawType = String(announce?.type || "").trim();

  return rawType === "" ? "peer" : rawType;
}

function getAnnounceTypeCssName(announce) {
  return getAnnounceType(announce).replaceAll(".", "-");
}

function getAnnounceTypeLabel(announceOrType) {
  const aspect =
    typeof announceOrType === "string" ? "" : getAnnounceAspect(announceOrType);

  const type =
    typeof announceOrType === "string"
      ? announceOrType
      : getAnnounceType(announceOrType);

  const definition = getAnnounceTypeDefinitionByValue(type);

  if (definition !== null) {
    return definition.label;
  }

  return aspect || type || "Peer";
}

function announceHasUnknownRawAspect(announce) {
  const aspect = getAnnounceAspect(announce);

  if (aspect === "") {
    return false;
  }

  return getAnnounceTypeDefinitionByAspect(aspect) === null;
}


function filterAnnouncesForDisplay(announces) {
  if (announceFilters.type !== UNKNOWN_ASPECT_FILTER_VALUE) {
    return announces;
  }

  return announces.filter(announceHasUnknownRawAspect);
}

function getAnnounceTypeFilterOptions() {
  const options = [
    ["all", "All"],
    [UNKNOWN_ASPECT_FILTER_VALUE, "Unknown raw aspects"],
    ...ANNOUNCE_TYPE_DEFINITIONS.map((definition) => [definition.value, definition.label]),
  ];

  const existingValues = new Set(options.map(([value]) => value));
  const announces = Array.isArray(currentStatus?.announces) ? currentStatus.announces : [];

  for (const announce of announces) {
    const type = getAnnounceType(announce);
    if (type === "" || existingValues.has(type)) {
      continue;
    }

    options.push([type, getAnnounceTypeLabel(announce)]);
    existingValues.add(type);
  }

  return options;
}

function renderCopyButton(label, textGetter) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;

  button.onclick = async (event) => {
    event.stopPropagation();

    const originalText = button.textContent;
    button.disabled = true;

    try {
      await copyTextToClipboard(textGetter());
      button.textContent = "Copied";
    } catch (error) {
      button.textContent = "Copy failed";
    }

    window.setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 1200);
  };

  return button;
}


function formatAnnounceCardForClipboard(announce) {
  const fields = [
    ["Name", announce?.name],
    ["Type", getAnnounceTypeLabel(announce)],
    ["Aspect", announce?.aspect],
    ["Identity", announce?.identity_hash],
    ["LXMF", announce?.lxmf],
    ["Destination", announce?.destination_hash],
    ["Interface", announce?.interface],
    ["Hops", announce?.hops],
    ["Time", announce?.time],
  ];

  return fields
    .map(([label, value]) => {
      const text = value === undefined || value === null || value === "" ? "-" : String(value);
      return `${label}: ${text}`;
    })
    .join("\n");
}

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

function getVisibleTabs() {
  const config = currentStatus?.config || {};

  return tabs.filter((tab) => {
    if (tab === "Client") {
      return Boolean(config.client_enabled);
    }

    if (tab === "NomadNet") {
      return Boolean(config.nomadnet_enabled);
    }

    return true;
  });
}

function renderNav(active) {
  renderToolboxState();

  const visibleTabs = getVisibleTabs();

  if (!visibleTabs.includes(active)) {
    renderSidebarContacts("");
    window.setTimeout(() => render("Interfaces"), 0);
    return;
  }

  renderSidebarContacts(active);

  const nav = document.querySelector("nav");
  nav.innerHTML = "";

  for (const tab of visibleTabs) {
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

  const listHeader = renderAnnounceListHeader();

  const list = document.createElement("div");
  list.className = "announce-list";

  const refresh = () => renderAnnounceResults(announces, count, list);

  const filters = document.createElement("div");
  filters.className = "announce-filters";
  filters.appendChild(renderAnnounceTypeFilter(refresh));
  filters.appendChild(renderAnnounceTextFilter("Name", "name", refresh));
  filters.appendChild(renderAnnounceTextFilter("Destination", "destination", refresh));
  filters.appendChild(renderAnnounceTextFilter("Identity", "identity", refresh));
  filters.appendChild(renderAnnounceTextFilter("LXMF", "lxmf", refresh));
  filters.appendChild(renderAnnounceHopsFilter(refresh));
  filters.appendChild(renderAnnounceApplyButton(refresh));

  section.appendChild(filters);
  section.appendChild(count);
  section.appendChild(listHeader);

  refresh();

  section.appendChild(list);
  wrapper.appendChild(section);

  if (announceModalState !== null) {
    wrapper.appendChild(renderAnnounceModal());
  }

  window.setTimeout(() => {
    startAnnounceUpdates(false);
  }, 0);

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
      nomadnetBrowserSettingsModalOpen = false;
      nomadnetBookmarkTreeModalState = null;
      nomadnetBookmarkAddGroupState = null;
      nomadnetBookmarkPageModalState = null;
      clearNomadNetBookmarkDragState();
      render("NomadNet");
    };
    tabs.appendChild(button);
  }

  return tabs;
}

function renderNomadNetBrowser() {
  const block = document.createElement("section");
  block.className = "settings-block nomadnet-browser";

  const current = getNomadNetBrowserState();
  ensureNomadNetBrowserHistory(current);

  const header = document.createElement("div");
  header.className = "nomadnet-browser-header";

  const browserPanel = document.createElement("div");
  browserPanel.className = "nomadnet-browser-panel";

  const title = document.createElement("h2");
  title.textContent = "Browser";
  browserPanel.appendChild(title);

  const runtime = document.createElement("div");
  runtime.className = "nomadnet-browser-runtime";

  const runtimeLabel = document.createElement("span");
  runtimeLabel.textContent = "Runtime:";
  runtime.appendChild(runtimeLabel);

  const runtimeValue = document.createElement("code");
  runtimeValue.textContent = current.runtime || "stub";
  runtime.appendChild(runtimeValue);

  browserPanel.appendChild(runtime);
  header.appendChild(browserPanel);

  const headerActions = document.createElement("div");
  headerActions.className = "nomadnet-browser-actions";
  headerActions.style.display = "inline-flex";
  headerActions.style.gap = "8px";
  headerActions.style.alignItems = "stretch";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "nomadnet-browser-save-button nomadnet-browser-settings-button";
  saveButton.textContent = "Save";
  saveButton.disabled = current.loading || !current.source;
  saveButton.title = current.source ? "Save current page to local NomadNet pages" : "No loaded page source to save";
  saveButton.onclick = () => saveNomadNetBrowserPage(current);
  headerActions.appendChild(saveButton);

  const settingsButton = document.createElement("button");
  settingsButton.type = "button";
  settingsButton.className = "nomadnet-browser-settings-button";
  settingsButton.textContent = "Settings";
  settingsButton.onclick = () => {
    nomadnetBrowserSettingsModalOpen = true;
    render("NomadNet");
  };
  headerActions.appendChild(settingsButton);
  header.appendChild(headerActions);
  block.appendChild(header);

  if (nomadnetBrowserSaveStatus !== "") {
    const saveStatus = document.createElement("div");
    saveStatus.className = nomadnetBrowserSaveStatus.startsWith("Error:") ? "settings-error" : "settings-hint";
    saveStatus.textContent = nomadnetBrowserSaveStatus;
    block.appendChild(saveStatus);
  }

  const controls = document.createElement("div");
  controls.className = "nomadnet-address-row";

  const historyButtons = renderNomadNetHistoryButtons();

  const destinationField = renderAccessTextInput(
    "Destination hash",
    current.destination_hash || "",
    "NomadNet destination hash",
    (value) => {
      current.destination_hash = value;
    }
  );
  destinationField.classList.add("nomadnet-destination-field");
  const destinationInput = destinationField.querySelector("input");

  const hopsField = renderNomadNetHopsField(current.hops);

  const pathField = renderAccessTextInput(
    "Path",
    current.path || "/page/index.mu",
    "/page/index.mu",
    (value) => {
      current.path = value;
    }
  );
  pathField.classList.add("nomadnet-path-field");
  const pathInput = pathField.querySelector("input");

  const openFromFields = () => openNomadNetPageFromFields(destinationInput, pathInput, current);

  const openOnEnter = (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    openFromFields();
  };

  if (destinationInput !== null) {
    destinationInput.addEventListener("keydown", openOnEnter);
  }

  if (pathInput !== null) {
    pathInput.addEventListener("keydown", openOnEnter);
  }

  const getBookmarkCandidate = () => createNomadNetHistoryEntry({
    ...current,
    destination_hash: String(destinationInput?.value || current.destination_hash || "").trim(),
    path: String(pathInput?.value || current.path || "/page/index.mu").trim() || "/page/index.mu",
  });

  const bookmarkButton = document.createElement("button");
  bookmarkButton.type = "button";
  bookmarkButton.className = "nomadnet-bookmark-button";
  bookmarkButton.title = "Bookmark this page";
  bookmarkButton.setAttribute("aria-label", "Bookmark this page");

  const updateBookmarkButton = () => {
    const candidate = getBookmarkCandidate();
    bookmarkButton.textContent = isNomadNetBookmarkSaved(candidate) ? "★" : "☆";
  };

  updateBookmarkButton();

  if (destinationInput !== null) {
    destinationInput.addEventListener("input", updateBookmarkButton);
  }

  if (pathInput !== null) {
    pathInput.addEventListener("input", updateBookmarkButton);
  }

  bookmarkButton.onclick = () => {
    const candidate = getBookmarkCandidate();

    if (!isNomadNetHistoryEntryUsable(candidate)) {
      return;
    }

    addNomadNetBookmarkFromState(candidate);
    render("NomadNet");
  };

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "nomadnet-address-open-button";
  openButton.textContent = "Open";
  openButton.onclick = openFromFields;

  const details = document.createElement("div");
  details.className = "settings-compact-grid nomadnet-browser-details";

  for (const [label, value] of [
    ["Name", current.name || "-"],
    ["Identity", current.identity_hash || "-"],
  ]) {
    details.appendChild(renderCompactSetting(label, value));
  }

  block.appendChild(details);

  controls.appendChild(historyButtons);
  controls.appendChild(destinationField);
  controls.appendChild(hopsField);
  controls.appendChild(bookmarkButton);
  controls.appendChild(pathField);
  controls.appendChild(openButton);
  block.appendChild(controls);

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
    page.appendChild(renderMicronContent(current.source, {
      mode: "browser",
      interactive: true,
      currentDestinationHash: current.destination_hash || "",
      currentPath: current.path || "/page/index.mu",
      onLink: handleNomadNetMicronLink,
    }));
    block.appendChild(page);
  } else {
    const hint = document.createElement("div");
    hint.className = "settings-hint";
    hint.textContent = "Select a NomadNet announce or enter a destination hash.\nReal page retrieval is still backed by a stub endpoint.";
    block.appendChild(hint);
  }

  if (nomadnetBrowserSettingsModalOpen) {
    block.appendChild(renderNomadNetBrowserSettings());
  }

  return block;
}

function renderNomadNetHopsField(hops) {
  const field = document.createElement("label");
  field.className = "access-field nomadnet-hops-field";

  const label = document.createElement("span");
  label.textContent = "Hops";
  field.appendChild(label);

  const value = document.createElement("code");
  value.textContent = hops === null || hops === undefined || hops === "" ? "-" : String(hops);
  field.appendChild(value);

  return field;
}

function renderNomadNetBrowserSettings() {
  const overlay = document.createElement("div");
  overlay.className = "nomadnet-browser-settings-overlay";
  overlay.onclick = (event) => {
    if (event.target !== overlay) {
      return;
    }

    nomadnetBrowserSettingsModalOpen = false;
    render("NomadNet");
  };

  const modal = document.createElement("section");
  modal.className = "nomadnet-browser-settings-modal";
  modal.onclick = (event) => event.stopPropagation();

  const header = document.createElement("div");
  header.className = "nomadnet-browser-settings-modal-header";

  const title = document.createElement("h2");
  title.textContent = "Settings";
  header.appendChild(title);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "nomadnet-browser-settings-close";
  closeButton.title = "Close";
  closeButton.setAttribute("aria-label", "Close settings");
  closeButton.textContent = "×";
  closeButton.onclick = () => {
    nomadnetBrowserSettingsModalOpen = false;
    render("NomadNet");
  };
  header.appendChild(closeButton);
  modal.appendChild(header);

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
  modal.appendChild(grid);
  overlay.appendChild(modal);

  return overlay;
}

function renderNomadNetBookmarks() {
  const block = document.createElement("section");
  block.className = "settings-block nomadnet-bookmarks-panel";

  const title = document.createElement("h2");
  title.textContent = "Bookmarks";
  block.appendChild(title);

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "Right-click the bookmarks panel to manage groups. On touch screens, use long tap.";
  block.appendChild(hint);

  const openManager = (event) => {
    event.preventDefault();
    nomadnetBookmarkTreeModalState = { group_id: NOMADNET_BOOKMARK_ROOT_ID };
    render("NomadNet");
  };

  block.oncontextmenu = openManager;
  block.ontouchstart = (event) => {
    if (event.target instanceof HTMLElement && event.target.closest(".nomadnet-bookmark-tree") !== null) {
      return;
    }

    clearNomadNetLongPressTimer();
    nomadnetLongPressTimer = window.setTimeout(() => openManager(event), 620);
  };
  block.ontouchend = clearNomadNetLongPressTimer;
  block.ontouchcancel = clearNomadNetLongPressTimer;
  block.appendChild(renderNomadNetBookmarkTree({ editable: false }));

  if (nomadnetBookmarkTreeModalState !== null) {
    block.appendChild(renderNomadNetBookmarkTreeModal());
  }

  if (nomadnetBookmarkAddGroupState !== null) {
    block.appendChild(renderNomadNetBookmarkAddGroupModal());
  }

  if (nomadnetBookmarkPageModalState !== null) {
    block.appendChild(renderNomadNetBookmarkPageModal());
  }

  return block;
}

function renderNomadNetBookmarkTreeModal() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay nomadnet-bookmark-modal-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor nomadnet-bookmark-modal";
  dialog.onclick = (event) => event.stopPropagation();

  const title = document.createElement("h2");
  title.textContent = "Bookmarks";
  dialog.appendChild(title);

  const help = document.createElement("div");
  help.className = "settings-hint";
  help.textContent = "Right-click a group to add a nested group. Drag pages to groups. On mobile: long tap page, drag to group, release.";
  dialog.appendChild(help);

  dialog.appendChild(renderNomadNetBookmarkTree({ editable: true }));

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.onclick = () => {
    nomadnetBookmarkTreeModalState = null;
    nomadnetBookmarkAddGroupState = null;
    nomadnetBookmarkPageModalState = null;
    clearNomadNetBookmarkDragState();
    render("NomadNet");
  };
  actions.appendChild(closeButton);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  overlay.onclick = () => {
    nomadnetBookmarkTreeModalState = null;
    nomadnetBookmarkAddGroupState = null;
    nomadnetBookmarkPageModalState = null;
    clearNomadNetBookmarkDragState();
    render("NomadNet");
  };
  return overlay;
}

function renderNomadNetBookmarkAddGroupModal() {
  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay nomadnet-bookmark-add-group-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor nomadnet-bookmark-add-group-modal";
  dialog.onclick = (event) => event.stopPropagation();

  const targetGroupId = String(nomadnetBookmarkAddGroupState?.parent_id || NOMADNET_BOOKMARK_ROOT_ID);
  const parentGroup = getNomadNetBookmarkGroup(targetGroupId);
  const isRoot = targetGroupId === NOMADNET_BOOKMARK_ROOT_ID;
  const title = document.createElement("h2");
  title.textContent = `Group: ${parentGroup?.name || "Bookmarks"}`;
  dialog.appendChild(title);

  const field = renderAccessTextInput("Name", "", "New group name", () => {});
  const input = field.querySelector("input");
  dialog.appendChild(field);

  const createGroup = () => {
    const name = String(input?.value || "").trim();

    if (name === "") {
      return;
    }

    addNomadNetBookmarkGroup(targetGroupId, name);
    setNomadNetBookmarkGroupCollapsed(targetGroupId, false);
    nomadnetBookmarkAddGroupState = null;
    render("NomadNet");
  };

  if (input !== null) {
    input.onkeydown = (event) => {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();
      createGroup();
    };
    window.setTimeout(() => input.focus(), 0);
  }

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add group";
  addButton.onclick = createGroup;
  actions.appendChild(addButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "nomadnet-danger-button";
  deleteButton.textContent = "Delete group";
  deleteButton.disabled = isRoot;
  deleteButton.title = isRoot ? "Root group cannot be deleted" : "Delete this group and everything inside it";
  deleteButton.onclick = () => {
    if (isRoot || parentGroup === null) {
      return;
    }

    deleteNomadNetBookmarkGroup(targetGroupId);
    nomadnetBookmarkAddGroupState = null;
    render("NomadNet");
  };
  actions.appendChild(deleteButton);

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.textContent = "Cancel";
  cancelButton.onclick = () => {
    nomadnetBookmarkAddGroupState = null;
    render("NomadNet");
  };
  actions.appendChild(cancelButton);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  overlay.onclick = () => {
    nomadnetBookmarkAddGroupState = null;
    render("NomadNet");
  };
  return overlay;
}

function renderNomadNetBookmarkPageModal() {
  const item = getNomadNetBookmarkItem(nomadnetBookmarkPageModalState?.item_id || "");

  if (item === null) {
    nomadnetBookmarkPageModalState = null;
    return document.createDocumentFragment();
  }

  const overlay = document.createElement("div");
  overlay.className = "client-editor-overlay nomadnet-bookmark-page-overlay";

  const dialog = document.createElement("section");
  dialog.className = "client-editor nomadnet-bookmark-page-modal";
  dialog.onclick = (event) => event.stopPropagation();

  const title = document.createElement("h2");
  title.textContent = item.name || "Bookmark";
  dialog.appendChild(title);

  const details = document.createElement("div");
  details.className = "settings-compact-grid";
  details.appendChild(renderCompactSetting("Destination", item.destination_hash || "-"));
  details.appendChild(renderCompactSetting("Path", item.path || "/page/index.mu"));
  details.appendChild(renderCompactSetting("Identity", item.identity_hash || "-"));
  details.appendChild(renderCompactSetting("Hops", item.hops ?? "-"));
  details.appendChild(renderCompactSetting("Last announce", item.last_announce_at || "-"));
  details.appendChild(renderCompactSetting("Last success", item.last_success_at || "-"));
  dialog.appendChild(details);

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.textContent = "Open";
  openButton.onclick = () => openNomadNetBookmarkItem(item);
  actions.appendChild(openButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "nomadnet-danger-button";
  deleteButton.textContent = "Delete page";
  deleteButton.onclick = () => {
    deleteNomadNetBookmarkItem(item.id);
    nomadnetBookmarkPageModalState = null;
    render("NomadNet");
  };
  actions.appendChild(deleteButton);

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.textContent = "Close";
  closeButton.onclick = () => {
    nomadnetBookmarkPageModalState = null;
    render("NomadNet");
  };
  actions.appendChild(closeButton);
  dialog.appendChild(actions);

  overlay.appendChild(dialog);
  overlay.onclick = () => {
    nomadnetBookmarkPageModalState = null;
    render("NomadNet");
  };
  return overlay;
}

function renderNomadNetBookmarkTree(options = {}) {
  normaliseNomadNetBookmarkStoreInPlace();

  const tree = document.createElement("div");
  tree.className = options.editable
    ? "nomadnet-bookmark-tree nomadnet-bookmark-tree-editable"
    : "nomadnet-bookmark-tree";

  const root = getNomadNetBookmarkGroup(NOMADNET_BOOKMARK_ROOT_ID);

  if (root === null) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No bookmark root.";
    tree.appendChild(empty);
    return tree;
  }

  tree.appendChild(renderNomadNetBookmarkGroup(root, options, 0));
  return tree;
}

function renderNomadNetBookmarkGroup(group, options, depth) {
  const groupBlock = document.createElement("div");
  groupBlock.className = "nomadnet-bookmark-group";
  groupBlock.dataset.nomadnetBookmarkGroupId = group.id;

  const collapsed = isNomadNetBookmarkGroupCollapsed(group.id);
  const totalCount = getNomadNetBookmarkItemCountForGroup(group.id);
  groupBlock.classList.toggle("nomadnet-bookmark-group-collapsed", collapsed);

  const header = document.createElement("div");
  header.className = "nomadnet-bookmark-group-header";
  header.style.paddingLeft = `${Math.min(depth, 6) * 14}px`;
  header.dataset.nomadnetBookmarkGroupId = group.id;
  header.title = collapsed
    ? `${totalCount} bookmark${totalCount === 1 ? "" : "s"}`
    : "Click to collapse";

  const marker = document.createElement("span");
  marker.className = "nomadnet-bookmark-group-marker";
  marker.textContent = collapsed ? "▸" : "▾";
  header.appendChild(marker);

  const name = document.createElement("span");
  name.className = "nomadnet-bookmark-group-name";
  name.textContent = group.name || "Group";
  header.appendChild(name);

  const itemCount = document.createElement("span");
  itemCount.className = "nomadnet-bookmark-group-count";
  itemCount.textContent = String(totalCount);
  header.appendChild(itemCount);

  const openAddGroup = (event) => {
    event.preventDefault();
    event.stopPropagation();
    nomadnetBookmarkAddGroupState = { parent_id: group.id };
    render("NomadNet");
  };

  header.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleNomadNetBookmarkGroupCollapsed(group.id);
    render("NomadNet");
  };
  header.oncontextmenu = openAddGroup;
  bindNomadNetLongPress(header, openAddGroup);

  header.ondragover = (event) => {
    if (!hasNomadNetBookmarkDragItem(event)) {
      return;
    }

    event.preventDefault();
    header.classList.add("nomadnet-bookmark-drop-target");
  };
  header.ondragleave = () => header.classList.remove("nomadnet-bookmark-drop-target");
  header.ondrop = (event) => {
    const itemId = getNomadNetBookmarkDragItemId(event);

    if (itemId === "") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    header.classList.remove("nomadnet-bookmark-drop-target");
    moveNomadNetBookmarkItem(itemId, group.id);
    setNomadNetBookmarkGroupCollapsed(group.id, false);
    render("NomadNet");
  };

  groupBlock.appendChild(header);

  if (collapsed) {
    return groupBlock;
  }

  const items = document.createElement("div");
  items.className = "nomadnet-bookmark-group-items";

  for (const item of getNomadNetBookmarkItemsForGroup(group.id)) {
    items.appendChild(renderNomadNetBookmarkItem(item, depth + 1));
  }

  for (const childGroup of getNomadNetBookmarkChildGroups(group.id)) {
    items.appendChild(renderNomadNetBookmarkGroup(childGroup, options, depth + 1));
  }

  if (group.id === NOMADNET_BOOKMARK_ROOT_ID && nomadnetBookmarkStore.items.length === 0 && nomadnetBookmarkStore.groups.length <= 1) {
    const empty = document.createElement("div");
    empty.className = "settings-hint nomadnet-bookmark-empty";
    empty.textContent = "No NomadNet bookmarks yet.";
    items.appendChild(empty);
  }

  groupBlock.appendChild(items);
  return groupBlock;
}

function renderNomadNetBookmarkItem(item, depth) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "nomadnet-bookmark-item";
  button.draggable = true;
  button.dataset.nomadnetBookmarkItemId = item.id;
  button.style.paddingLeft = `${Math.min(depth, 7) * 14}px`;
  button.title = `${item.destination_hash || "-"}${item.path || "/page/index.mu"}`;

  const label = document.createElement("span");
  label.className = "nomadnet-bookmark-item-name";
  label.textContent = item.name || item.destination_hash || "Bookmark";
  button.appendChild(label);

  const path = document.createElement("code");
  path.className = "nomadnet-bookmark-item-path";
  path.textContent = item.path || "/page/index.mu";
  button.appendChild(path);

  const openPageModal = (event) => {
    event.preventDefault();
    event.stopPropagation();
    nomadnetBookmarkPageModalState = { item_id: item.id };
    render("NomadNet");
  };

  button.onclick = () => openNomadNetBookmarkItem(item);
  button.oncontextmenu = openPageModal;
  button.ondragstart = (event) => {
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.effectAllowed = "move";
  };

  button.ontouchstart = (event) => {
    const touch = event.touches[0];
    clearNomadNetLongPressTimer();
    nomadnetLongPressTimer = window.setTimeout(() => {
      nomadnetBookmarkDragState = {
        item_id: item.id,
        touch: true,
        moved: false,
        start_x: touch?.clientX || 0,
        start_y: touch?.clientY || 0,
      };
      button.classList.add("nomadnet-bookmark-touch-dragging");
    }, 520);
  };
  button.ontouchmove = (event) => handleNomadNetBookmarkTouchMove(event);
  button.ontouchend = (event) => {
    if (nomadnetBookmarkDragState !== null && !nomadnetBookmarkDragState.moved) {
      event.preventDefault();
      clearNomadNetBookmarkDragState();
      openPageModal(event);
      return;
    }

    handleNomadNetBookmarkTouchEnd(event);
  };
  button.ontouchcancel = clearNomadNetBookmarkDragState;

  return button;
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

function getNomadNetBrowserLocalSavePath(path) {
  const clean = normaliseNomadNetEditorPath(path);

  if (clean.startsWith("page/")) {
    const pagePath = clean.slice("page/".length).replace(/^\/+/, "");
    return pagePath === "" ? "index.mu" : pagePath;
  }

  return clean;
}

async function saveNomadNetBrowserPage(current) {
  const source = String(current?.source || "");
  const pagePath = getNomadNetBrowserLocalSavePath(current?.path || "/page/index.mu");

  if (source === "") {
    nomadnetBrowserSaveStatus = "Error: no loaded page source to save.";
    render("NomadNet");
    return;
  }

  nomadnetBrowserSaveStatus = `Saving ${pagePath}...`;
  render("NomadNet");

  try {
    const response = await fetch("/api/nomadnet/local-page", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: pagePath,
        source,
      }),
    });

    if (!response.ok) {
      throw new Error(`NomadNet page save failed: HTTP ${response.status}`);
    }

    const payload = await response.json();
    const savedPath = payload.path || pagePath;
    nomadnetEditorPath = savedPath;
    nomadnetEditorDraft = source;
    nomadnetBrowserSaveStatus = `Saved ${savedPath}.`;
    await refreshNomadNetEditorPages();
  } catch (error) {
    nomadnetBrowserSaveStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  if (getActiveTab() === "NomadNet" && activeNomadNetSection === "Browser") {
    render("NomadNet");
  }
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

function createDefaultNomadNetBookmarkStore() {
  return {
    groups: [
      {
        id: NOMADNET_BOOKMARK_ROOT_ID,
        parent_id: "",
        name: "Bookmarks",
      },
    ],
    items: [],
    collapsed_group_ids: [],
  };
}

function createNomadNetId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNomadNetIsoNow() {
  return new Date().toISOString();
}

function normaliseNomadNetDestinationHash(value) {
  const destination = String(value || "").trim().toLowerCase();

  if (!/^[0-9a-f]{32}$/.test(destination)) {
    return "";
  }

  return destination;
}

function normaliseNomadNetPagePath(value) {
  const rawPath = String(value || NOMADNET_DEFAULT_PATH).trim().replaceAll("\\", "/") || NOMADNET_DEFAULT_PATH;
  const path = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;

  if (path.includes("\0") || path.includes("//") || path.includes("/../") || path.endsWith("/..")) {
    return NOMADNET_DEFAULT_PATH;
  }

  return path;
}

function normaliseNomadNetHops(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    return "";
  }

  return Number.isInteger(number) ? number : String(value);
}

function normaliseNomadNetTransportHint(rawHint) {
  if (!rawHint || typeof rawHint !== "object") {
    return {};
  }

  const hint = {};

  for (const key of [
    "interface",
    "interface_name",
    "interface_type",
    "target_host",
    "target_port",
    "transport_identity_hash",
    "next_hop",
  ]) {
    const value = rawHint[key];

    if (value === null || value === undefined || value === "") {
      continue;
    }

    hint[key] = String(value);
  }

  return hint;
}

function normaliseNomadNetBrowserStorage(raw) {
  const payload = raw && typeof raw === "object" ? raw : {};
  const bookmarkStore = normaliseNomadNetBookmarkStore(payload.bookmarks);
  const rawHistory = Array.isArray(payload.history) ? payload.history : [];
  const history = rawHistory
    .map((entry) => createNomadNetHistoryEntry(entry))
    .filter(isNomadNetHistoryEntryUsable)
    .slice(-NOMADNET_BROWSER_HISTORY_LIMIT);
  const rawIndex = Number(payload.history_index);
  const historyIndex = Number.isInteger(rawIndex) && rawIndex >= 0 && rawIndex < history.length
    ? rawIndex
    : history.length === 0
      ? -1
      : history.length - 1;

  return {
    version: NOMADNET_BROWSER_STATE_VERSION,
    history,
    history_index: historyIndex,
    bookmarks: bookmarkStore,
  };
}

function normaliseNomadNetBookmarkStore(rawBookmarks) {
  const store = createDefaultNomadNetBookmarkStore();

  if (Array.isArray(rawBookmarks)) {
    store.items = rawBookmarks
      .map((destination) => normaliseNomadNetDestinationHash(destination))
      .filter((destination) => destination !== "")
      .map((destination) => createNomadNetBookmarkItemFromState({
        name: destination,
        destination_hash: destination,
        path: NOMADNET_DEFAULT_PATH,
      }));
    return store;
  }

  if (!rawBookmarks || typeof rawBookmarks !== "object") {
    return store;
  }

  const groupIds = new Set([NOMADNET_BOOKMARK_ROOT_ID]);
  const groups = Array.isArray(rawBookmarks.groups) ? rawBookmarks.groups : [];

  for (const group of groups) {
    const id = String(group?.id || "").trim();

    if (id === "") {
      continue;
    }

    groupIds.add(id);
    const parentId = String(group?.parent_id || "").trim();
    const name = String(group?.name || "Group").trim() || "Group";
    const existing = store.groups.find((item) => item.id === id);

    if (existing !== undefined) {
      existing.name = name;
      existing.parent_id = id === NOMADNET_BOOKMARK_ROOT_ID ? "" : parentId || NOMADNET_BOOKMARK_ROOT_ID;
    } else {
      store.groups.push({
        id,
        parent_id: id === NOMADNET_BOOKMARK_ROOT_ID ? "" : parentId || NOMADNET_BOOKMARK_ROOT_ID,
        name,
      });
    }
  }

  for (const group of store.groups) {
    if (group.id === NOMADNET_BOOKMARK_ROOT_ID) {
      group.parent_id = "";
      group.name = group.name || "Bookmarks";
      continue;
    }

    if (!groupIds.has(group.parent_id) || group.parent_id === group.id) {
      group.parent_id = NOMADNET_BOOKMARK_ROOT_ID;
    }
  }

  const items = Array.isArray(rawBookmarks.items) ? rawBookmarks.items : [];
  const seenKeys = new Set();

  for (const rawItem of items) {
    const item = createNomadNetBookmarkItemFromState(rawItem);

    if (!isNomadNetHistoryEntryUsable(item)) {
      continue;
    }

    if (!groupIds.has(item.group_id)) {
      item.group_id = NOMADNET_BOOKMARK_ROOT_ID;
    }

    const key = getNomadNetBookmarkKey(item);

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    store.items.push(item);
  }

  const collapsedGroupIds = Array.isArray(rawBookmarks.collapsed_group_ids)
    ? rawBookmarks.collapsed_group_ids
      .map((value) => String(value || "").trim())
      .filter((groupId) => groupIds.has(groupId))
    : [];
  store.collapsed_group_ids = Array.from(new Set(collapsedGroupIds));

  return store;
}

function normaliseNomadNetBookmarkStoreInPlace() {
  syncNomadNetBookmarkStoreCollapsedGroups();
  nomadnetBookmarkStore = normaliseNomadNetBookmarkStore(nomadnetBookmarkStore);
  const validGroupIds = new Set(nomadnetBookmarkStore.groups.map((group) => group.id));
  nomadnetBookmarkCollapsedGroups = new Set(
    Array.from(nomadnetBookmarkCollapsedGroups)
      .filter((groupId) => validGroupIds.has(groupId))
  );
  syncNomadNetBookmarkStoreCollapsedGroups();
  rebuildNomadNetBookmarkSet();
}

function createNomadNetBookmarkItemFromState(state, groupId = NOMADNET_BOOKMARK_ROOT_ID) {
  const entry = createNomadNetHistoryEntry(state);
  const cleanPath = normaliseNomadNetPagePath(entry.path);
  const cleanDestination = normaliseNomadNetDestinationHash(entry.destination_hash);
  const name = String(state?.name || "").trim()
    || `${cleanDestination.slice(0, 12) || "NomadNet"} ${cleanPath}`;
  const now = getNomadNetIsoNow();

  return {
    id: String(state?.id || "").trim() || createNomadNetId("bookmark"),
    group_id: String(state?.group_id || groupId || NOMADNET_BOOKMARK_ROOT_ID).trim() || NOMADNET_BOOKMARK_ROOT_ID,
    name,
    destination_hash: cleanDestination,
    identity_hash: String(entry.identity_hash || ""),
    hops: entry.hops ?? "",
    path: cleanPath,
    announced_path: normaliseNomadNetPagePath(state?.announced_path || cleanPath),
    runtime: String(entry.runtime || "stub"),
    last_interface: String(state?.last_interface || entry.last_interface || ""),
    last_transport: normaliseNomadNetTransportHint(state?.last_transport || entry.last_transport),
    last_announce_at: String(state?.last_announce_at || entry.last_announce_at || ""),
    last_success_at: String(state?.last_success_at || entry.last_success_at || ""),
    last_opened_at: String(state?.last_opened_at || entry.last_opened_at || ""),
    announce_seen_count: Math.max(0, Number(state?.announce_seen_count || 0) || 0),
    created_at: String(state?.created_at || now),
    updated_at: String(state?.updated_at || now),
  };
}

function serialiseNomadNetHistoryEntry(entry) {
  const clean = createNomadNetHistoryEntry(entry);
  return {
    ...clean,
    source: "",
    error: "",
    loading: false,
  };
}

function getNomadNetBrowserStoragePayload() {
  return {
    version: NOMADNET_BROWSER_STATE_VERSION,
    history: nomadnetBrowserHistory
      .map(serialiseNomadNetHistoryEntry)
      .filter(isNomadNetHistoryEntryUsable)
      .slice(-NOMADNET_BROWSER_HISTORY_LIMIT),
    history_index: nomadnetBrowserHistoryIndex,
    bookmarks: serialiseNomadNetBookmarkStore(),
  };
}

async function loadNomadNetBrowserStorage() {
  try {
    const response = await fetch("/api/nomadnet/browser-state", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`NomadNet browser state load failed: HTTP ${response.status}`);
    }

    const payload = normaliseNomadNetBrowserStorage(await response.json());
    nomadnetBrowserHistory = payload.history;
    nomadnetBrowserHistoryIndex = payload.history_index;
    nomadnetBookmarkStore = payload.bookmarks;
    nomadnetBookmarkCollapsedGroups = new Set(Array.isArray(payload.bookmarks.collapsed_group_ids) ? payload.bookmarks.collapsed_group_ids : []);
    rebuildNomadNetBookmarkSet();
    updateNomadNetBookmarksFromAnnounces(currentStatus?.announces || [], { save: false });

    if (nomadnetBrowserHistoryIndex >= 0 && nomadnetBrowserState === null) {
      nomadnetBrowserState = {
        ...nomadnetBrowserHistory[nomadnetBrowserHistoryIndex],
        loading: false,
      };
    }
  } catch (error) {
    appendUiError(error);
  } finally {
    nomadnetBrowserStorageLoaded = true;

    if (getActiveTab() === "NomadNet") {
      render("NomadNet");
    }
  }
}

function scheduleNomadNetBrowserStorageSave() {
  if (!nomadnetBrowserStorageLoaded) {
    return;
  }

  if (nomadnetBrowserStorageSaveTimer !== null) {
    window.clearTimeout(nomadnetBrowserStorageSaveTimer);
  }

  nomadnetBrowserStorageSaveTimer = window.setTimeout(saveNomadNetBrowserStorage, 250);
}

async function saveNomadNetBrowserStorage() {
  nomadnetBrowserStorageSaveTimer = null;

  try {
    const response = await fetch("/api/nomadnet/browser-state", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(getNomadNetBrowserStoragePayload()),
    });

    if (!response.ok) {
      throw new Error(`NomadNet browser state save failed: HTTP ${response.status}`);
    }

    const payload = normaliseNomadNetBrowserStorage(await response.json());
    nomadnetBrowserHistory = payload.history;
    nomadnetBrowserHistoryIndex = payload.history_index;
    nomadnetBookmarkStore = payload.bookmarks;
    nomadnetBookmarkCollapsedGroups = new Set(Array.isArray(payload.bookmarks.collapsed_group_ids) ? payload.bookmarks.collapsed_group_ids : []);
    rebuildNomadNetBookmarkSet();
  } catch (error) {
    appendUiError(error);

    if (getActiveTab() === "Logs") {
      render("Logs");
    }
  }
}

function rebuildNomadNetBookmarkSet() {
  nomadnetBookmarks.clear();

  for (const item of nomadnetBookmarkStore.items) {
    nomadnetBookmarks.add(getNomadNetBookmarkKey(item));
  }
}

function getNomadNetBookmarkKey(entry) {
  return getNomadNetHistoryKey(entry);
}

function isNomadNetBookmarkSaved(entry) {
  return nomadnetBookmarks.has(getNomadNetBookmarkKey(entry));
}

function getNomadNetBookmarkGroup(groupId) {
  return nomadnetBookmarkStore.groups.find((group) => group.id === groupId) || null;
}

function getNomadNetBookmarkChildGroups(parentId) {
  return nomadnetBookmarkStore.groups
    .filter((group) => group.parent_id === parentId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getNomadNetBookmarkItemsForGroup(groupId) {
  return nomadnetBookmarkStore.items
    .filter((item) => item.group_id === groupId)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function syncNomadNetBookmarkStoreCollapsedGroups() {
  nomadnetBookmarkStore.collapsed_group_ids = Array.from(nomadnetBookmarkCollapsedGroups);
}

function serialiseNomadNetBookmarkStore() {
  syncNomadNetBookmarkStoreCollapsedGroups();
  return normaliseNomadNetBookmarkStore(nomadnetBookmarkStore);
}

function isNomadNetBookmarkGroupCollapsed(groupId) {
  return nomadnetBookmarkCollapsedGroups.has(groupId);
}

function setNomadNetBookmarkGroupCollapsed(groupId, collapsed) {
  if (collapsed) {
    nomadnetBookmarkCollapsedGroups.add(groupId);
  } else {
    nomadnetBookmarkCollapsedGroups.delete(groupId);
  }

  syncNomadNetBookmarkStoreCollapsedGroups();
  scheduleNomadNetBrowserStorageSave();
}

function toggleNomadNetBookmarkGroupCollapsed(groupId) {
  setNomadNetBookmarkGroupCollapsed(groupId, !isNomadNetBookmarkGroupCollapsed(groupId));
}

function getNomadNetBookmarkItem(groupId) {
  return nomadnetBookmarkStore.items.find((item) => item.id === groupId) || null;
}

function getNomadNetBookmarkGroupDescendantIds(groupId) {
  const ids = new Set([groupId]);
  let changed = true;

  while (changed) {
    changed = false;

    for (const group of nomadnetBookmarkStore.groups) {
      if (ids.has(group.id) || !ids.has(group.parent_id)) {
        continue;
      }

      ids.add(group.id);
      changed = true;
    }
  }

  return ids;
}

function getNomadNetBookmarkItemCountForGroup(groupId) {
  const groupIds = getNomadNetBookmarkGroupDescendantIds(groupId);
  return nomadnetBookmarkStore.items.filter((item) => groupIds.has(item.group_id)).length;
}

function deleteNomadNetBookmarkGroup(groupId) {
  if (groupId === NOMADNET_BOOKMARK_ROOT_ID) {
    return;
  }

  const groupIds = getNomadNetBookmarkGroupDescendantIds(groupId);
  nomadnetBookmarkStore.groups = nomadnetBookmarkStore.groups.filter((group) => !groupIds.has(group.id));
  nomadnetBookmarkStore.items = nomadnetBookmarkStore.items.filter((item) => !groupIds.has(item.group_id));

  for (const id of groupIds) {
    nomadnetBookmarkCollapsedGroups.delete(id);
  }

  syncNomadNetBookmarkStoreCollapsedGroups();
  rebuildNomadNetBookmarkSet();
  scheduleNomadNetBrowserStorageSave();
}

function deleteNomadNetBookmarkItem(itemId) {
  nomadnetBookmarkStore.items = nomadnetBookmarkStore.items.filter((item) => item.id !== itemId);
  rebuildNomadNetBookmarkSet();
  scheduleNomadNetBrowserStorageSave();
}

function addNomadNetBookmarkFromState(state, groupId = NOMADNET_BOOKMARK_ROOT_ID) {
  normaliseNomadNetBookmarkStoreInPlace();
  const item = createNomadNetBookmarkItemFromState(state, groupId);
  const existing = nomadnetBookmarkStore.items.find((candidate) => getNomadNetBookmarkKey(candidate) === getNomadNetBookmarkKey(item));

  if (existing !== undefined) {
    Object.assign(existing, {
      ...existing,
      ...item,
      id: existing.id,
      group_id: existing.group_id || groupId,
      last_announce_at: existing.last_announce_at || item.last_announce_at || "",
      last_success_at: existing.last_success_at || item.last_success_at || "",
      created_at: existing.created_at || item.created_at,
      updated_at: getNomadNetIsoNow(),
    });
  } else {
    nomadnetBookmarkStore.items.push(item);
  }

  rebuildNomadNetBookmarkSet();
  scheduleNomadNetBrowserStorageSave();
}

function addNomadNetBookmarkGroup(parentId, name) {
  normaliseNomadNetBookmarkStoreInPlace();
  const parent = getNomadNetBookmarkGroup(parentId) || getNomadNetBookmarkGroup(NOMADNET_BOOKMARK_ROOT_ID);
  const parentGroupId = parent?.id || NOMADNET_BOOKMARK_ROOT_ID;
  nomadnetBookmarkStore.groups.push({
    id: createNomadNetId("group"),
    parent_id: parentGroupId,
    name: String(name || "Group").trim() || "Group",
  });
  setNomadNetBookmarkGroupCollapsed(parentGroupId, false);
  scheduleNomadNetBrowserStorageSave();
}

function moveNomadNetBookmarkItem(itemId, groupId) {
  const item = nomadnetBookmarkStore.items.find((candidate) => candidate.id === itemId);
  const group = getNomadNetBookmarkGroup(groupId);

  if (item === undefined || group === null) {
    return;
  }

  item.group_id = group.id;
  item.updated_at = new Date().toISOString();
  rebuildNomadNetBookmarkSet();
  scheduleNomadNetBrowserStorageSave();
}

function openNomadNetBookmarkItem(item) {
  activeNomadNetSection = "Browser";
  nomadnetBookmarkTreeModalState = null;
  nomadnetBookmarkAddGroupState = null;
  nomadnetBrowserState = {
    ...createNomadNetHistoryEntry(item),
    name: item.name || "Bookmarked page",
    loading: true,
    error: "",
    last_opened_at: getNomadNetIsoNow(),
  };
  pushNomadNetBrowserHistory(nomadnetBrowserState);
  render("NomadNet");
  fetchNomadNetPage(nomadnetBrowserState.destination_hash, nomadnetBrowserState.path);
}

function hasNomadNetBookmarkDragItem(event) {
  return nomadnetBookmarkDragState !== null
    || Array.from(event.dataTransfer?.types || []).includes("text/plain");
}

function getNomadNetBookmarkDragItemId(event) {
  if (nomadnetBookmarkDragState !== null) {
    return String(nomadnetBookmarkDragState.item_id || "");
  }

  return String(event.dataTransfer?.getData("text/plain") || "");
}

function clearNomadNetLongPressTimer() {
  if (nomadnetLongPressTimer !== null) {
    window.clearTimeout(nomadnetLongPressTimer);
    nomadnetLongPressTimer = null;
  }
}

function clearNomadNetBookmarkDragState() {
  clearNomadNetLongPressTimer();
  nomadnetBookmarkDragState = null;

  for (const element of document.querySelectorAll(".nomadnet-bookmark-drop-target, .nomadnet-bookmark-touch-dragging")) {
    element.classList.remove("nomadnet-bookmark-drop-target", "nomadnet-bookmark-touch-dragging");
  }
}

function bindNomadNetLongPress(element, callback) {
  element.ontouchstart = (event) => {
    clearNomadNetLongPressTimer();
    nomadnetLongPressTimer = window.setTimeout(() => callback(event), 620);
  };
  element.ontouchend = clearNomadNetLongPressTimer;
  element.ontouchcancel = clearNomadNetLongPressTimer;
  element.ontouchmove = (event) => {
    if (event.touches.length > 0) {
      clearNomadNetLongPressTimer();
    }
  };
}

function handleNomadNetBookmarkTouchMove(event) {
  if (nomadnetBookmarkDragState === null) {
    return;
  }

  const touch = event.touches[0];

  if (touch === undefined) {
    return;
  }

  event.preventDefault();
  nomadnetBookmarkDragState.moved = true;

  for (const element of document.querySelectorAll(".nomadnet-bookmark-drop-target")) {
    element.classList.remove("nomadnet-bookmark-drop-target");
  }

  const target = document
    .elementFromPoint(touch.clientX, touch.clientY)
    ?.closest("[data-nomadnet-bookmark-group-id]");

  if (target instanceof HTMLElement) {
    target.classList.add("nomadnet-bookmark-drop-target");
  }
}

function handleNomadNetBookmarkTouchEnd(event) {
  if (nomadnetBookmarkDragState === null) {
    clearNomadNetBookmarkDragState();
    return;
  }

  const touch = event.changedTouches[0];
  const itemId = String(nomadnetBookmarkDragState.item_id || "");

  if (touch !== undefined && itemId !== "") {
    const target = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest("[data-nomadnet-bookmark-group-id]");

    if (target instanceof HTMLElement) {
      moveNomadNetBookmarkItem(itemId, target.dataset.nomadnetBookmarkGroupId || NOMADNET_BOOKMARK_ROOT_ID);
    }
  }

  clearNomadNetBookmarkDragState();
  render("NomadNet");
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
    destination_hash: normaliseNomadNetDestinationHash(announce.destination_hash),
    identity_hash: announce.identity_hash || "",
    hops: announce.hops,
    path: NOMADNET_DEFAULT_PATH,
    source: "",
    runtime: "stub",
    last_announce_at: String(announce.time || ""),
    last_interface: String(announce.interface || ""),
  };
}


function createNomadNetHistoryEntry(state) {
  return {
    name: String(state?.name || ""),
    destination_hash: normaliseNomadNetDestinationHash(state?.destination_hash),
    identity_hash: String(state?.identity_hash || ""),
    hops: normaliseNomadNetHops(state?.hops),
    path: normaliseNomadNetPagePath(state?.path),
    source: String(state?.source || ""),
    runtime: String(state?.runtime || "stub"),
    error: String(state?.error || ""),
    loading: false,
    last_interface: String(state?.last_interface || ""),
    last_transport: normaliseNomadNetTransportHint(state?.last_transport),
    last_announce_at: String(state?.last_announce_at || ""),
    last_success_at: String(state?.last_success_at || ""),
    last_opened_at: String(state?.last_opened_at || ""),
  };
}

function isNomadNetHistoryEntryUsable(entry) {
  return normaliseNomadNetDestinationHash(entry?.destination_hash) !== "";
}

function getNomadNetHistoryKey(entry) {
  return `${normaliseNomadNetDestinationHash(entry?.destination_hash)}\n${normaliseNomadNetPagePath(entry?.path)}`;
}

function isSameNomadNetHistoryEntry(left, right) {
  return getNomadNetHistoryKey(left) === getNomadNetHistoryKey(right);
}

function ensureNomadNetBrowserHistory(current) {
  if (nomadnetBrowserHistoryIndex >= 0) {
    return;
  }

  const entry = createNomadNetHistoryEntry(current);

  if (!isNomadNetHistoryEntryUsable(entry)) {
    return;
  }

  nomadnetBrowserHistory = [entry];
  nomadnetBrowserHistoryIndex = 0;
  scheduleNomadNetBrowserStorageSave();
}

function pushNomadNetBrowserHistory(state) {
  const entry = createNomadNetHistoryEntry(state);

  if (!isNomadNetHistoryEntryUsable(entry)) {
    return;
  }

  const current = nomadnetBrowserHistory[nomadnetBrowserHistoryIndex] || null;

  if (current !== null && isSameNomadNetHistoryEntry(current, entry)) {
    nomadnetBrowserHistory[nomadnetBrowserHistoryIndex] = {
      ...current,
      ...entry,
    };
    scheduleNomadNetBrowserStorageSave();
    return;
  }

  nomadnetBrowserHistory = nomadnetBrowserHistory.slice(0, nomadnetBrowserHistoryIndex + 1);
  nomadnetBrowserHistory.push(entry);

  if (nomadnetBrowserHistory.length > 50) {
    nomadnetBrowserHistory.shift();
  }

  nomadnetBrowserHistoryIndex = nomadnetBrowserHistory.length - 1;
  scheduleNomadNetBrowserStorageSave();
}

function replaceNomadNetBrowserHistory(state) {
  const entry = createNomadNetHistoryEntry(state);

  if (!isNomadNetHistoryEntryUsable(entry)) {
    return;
  }

  if (nomadnetBrowserHistoryIndex < 0) {
    pushNomadNetBrowserHistory(entry);
    return;
  }

  const current = nomadnetBrowserHistory[nomadnetBrowserHistoryIndex] || null;

  if (current !== null && isSameNomadNetHistoryEntry(current, entry)) {
    nomadnetBrowserHistory[nomadnetBrowserHistoryIndex] = {
      ...current,
      ...entry,
    };
    scheduleNomadNetBrowserStorageSave();
    return;
  }

  pushNomadNetBrowserHistory(entry);
}

function goNomadNetBrowserHistory(delta) {
  const nextIndex = nomadnetBrowserHistoryIndex + delta;

  if (nextIndex < 0 || nextIndex >= nomadnetBrowserHistory.length) {
    return;
  }

  nomadnetBrowserHistoryIndex = nextIndex;
  scheduleNomadNetBrowserStorageSave();
  const entry = nomadnetBrowserHistory[nomadnetBrowserHistoryIndex];
  const shouldFetch = entry.source === "" && entry.error === "";
  nomadnetBrowserState = {
    ...entry,
    loading: shouldFetch,
  };
  render("NomadNet");

  if (shouldFetch) {
    fetchNomadNetPage(nomadnetBrowserState.destination_hash, nomadnetBrowserState.path);
  }
}

function renderNomadNetHistoryButtons() {
  const wrapper = document.createElement("div");
  wrapper.className = "nomadnet-browser-nav-buttons";

  for (const [label, title, delta, disabled] of [
    ["←", "Back", -1, nomadnetBrowserHistoryIndex <= 0],
    ["→", "Forward", 1, nomadnetBrowserHistoryIndex < 0 || nomadnetBrowserHistoryIndex >= nomadnetBrowserHistory.length - 1],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.disabled = disabled;
    button.onclick = () => goNomadNetBrowserHistory(delta);
    wrapper.appendChild(button);
  }

  return wrapper;
}

function openNomadNetPageFromFields(destinationInput, pathInput, current) {
  nomadnetBrowserSaveStatus = "";
  const destination = String(destinationInput?.value || current.destination_hash || "").trim();
  const path = String(pathInput?.value || current.path || "/page/index.mu").trim() || "/page/index.mu";

  nomadnetBrowserState = {
    ...current,
    destination_hash: destination,
    path,
    loading: true,
    error: "",
    last_opened_at: getNomadNetIsoNow(),
  };
  pushNomadNetBrowserHistory(nomadnetBrowserState);
  render("NomadNet");
  fetchNomadNetPage(destination, path);
}

async function fetchNomadNetPage(destinationHash, path, options = {}) {
  const fetchHints = getNomadNetFetchHints(destinationHash, path);
  const requestData = normaliseNomadNetMicronRequestData(options.requestData || {});
  const hasRequestData = Object.keys(requestData).length > 0;

  try {
    let response = null;

    if (hasRequestData) {
      response = await fetch("/api/nomadnet/page", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          destination_hash: destinationHash,
          path,
          discovery_hints: fetchHints,
          request_data: requestData,
        }),
      });
    } else {
      const query = new URLSearchParams({
        destination_hash: destinationHash,
        path,
      });

      if (fetchHints.bookmark_id) {
        query.set("bookmark_id", fetchHints.bookmark_id);
      }

      if (fetchHints.last_interface) {
        query.set("last_interface", fetchHints.last_interface);
      }

      if (fetchHints.last_announce_at) {
        query.set("last_announce_at", fetchHints.last_announce_at);
      }

      if (fetchHints.last_transport_key) {
        query.set("last_transport_key", fetchHints.last_transport_key);
      }

      response = await fetch(`/api/nomadnet/page?${query.toString()}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });
    }

    if (!response.ok) {
      throw new Error(`NomadNet page request failed: HTTP ${response.status}`);
    }

    const page = await response.json();

    if (page.status === "error" || page.error) {
      nomadnetBrowserState = {
        ...(nomadnetBrowserState || {}),
        destination_hash: page.destination_hash || destinationHash,
        path: page.path || path,
        source: "",
        runtime: page.runtime || "reticulum",
        loading: false,
        error: page.message || page.error || "NomadNet page request failed",
      };

      replaceNomadNetBrowserHistory(nomadnetBrowserState);

      if (getActiveTab() === "NomadNet") {
        render("NomadNet");
      }

      return;
    }

    const successState = {
      ...(nomadnetBrowserState || {}),
      destination_hash: page.destination_hash || destinationHash,
      identity_hash: page.identity_hash || nomadnetBrowserState?.identity_hash || "",
      hops: page.hops ?? nomadnetBrowserState?.hops ?? "",
      path: page.path || path,
      source: page.source || "",
      runtime: page.runtime || "reticulum",
      last_interface: page.interface || page.last_interface || nomadnetBrowserState?.last_interface || "",
      last_transport: page.last_transport || nomadnetBrowserState?.last_transport || {},
      last_success_at: getNomadNetIsoNow(),
      last_request_data: requestData,
      loading: false,
      error: "",
    };

    nomadnetBrowserState = successState;
    updateNomadNetBookmarksFromPageSuccess(successState);
    replaceNomadNetBrowserHistory(nomadnetBrowserState);
  } catch (error) {
    nomadnetBrowserState = {
      ...(nomadnetBrowserState || {}),
      loading: false,
      error: error instanceof Error ? error.message : String(error),
    };
    replaceNomadNetBrowserHistory(nomadnetBrowserState);
  }

  if (getActiveTab() === "NomadNet") {
    render("NomadNet");
  }
}

function handleNomadNetMicronLink(payload, event) {
  if (event !== undefined && event !== null && typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  const target = String(payload?.target || "").trim();

  if (target === "") {
    return;
  }

  if (isExternalMicronTarget(target)) {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }

  const current = getNomadNetBrowserState();
  const resolved = resolveNomadNetMicronTarget(target, current);

  if (resolved === null) {
    console.debug("Micron link target could not be resolved", {
      target,
      current_destination_hash: current.destination_hash || "",
      current_path: current.path || "",
    });
    return;
  }

  const requestData = buildNomadNetMicronRequestData(payload);

  if (payload?.request || Object.keys(requestData).length > 0) {
    console.debug("Micron request link data", {
      target,
      fields: payload.fields || "",
      request_data: requestData,
    });
  }

  openNomadNetPageFromMicronLink(resolved.destination_hash, resolved.path, {
    ...payload,
    requestData,
  });
}

function isExternalMicronTarget(target) {
  return /^(https?:|gemini:|mailto:)/i.test(String(target || "").trim());
}

function resolveNomadNetMicronTarget(rawTarget, current) {
  let target = String(rawTarget || "").trim();

  if (target === "") {
    return null;
  }

  if (target.toLowerCase().startsWith("nomadnet://")) {
    target = target.slice("nomadnet://".length);
  }

  const currentDestination = normaliseNomadNetDestinationHash(current?.destination_hash || "");
  const currentPath = normaliseNomadNetPagePath(current?.path || "/page/index.mu");

  if (target.startsWith(":")) {
    if (currentDestination === "") {
      return null;
    }

    return {
      destination_hash: currentDestination,
      path: normaliseNomadNetPagePath(target.slice(1) || "/page/index.mu"),
    };
  }

  const directDestination = normaliseNomadNetDestinationHash(target);

  if (directDestination !== "") {
    return {
      destination_hash: directDestination,
      path: "/page/index.mu",
    };
  }

  const colonIndex = target.indexOf(":");

  if (colonIndex > 0) {
    const destination = normaliseNomadNetDestinationHash(target.slice(0, colonIndex));

    if (destination !== "") {
      return {
        destination_hash: destination,
        path: normaliseNomadNetPagePath(target.slice(colonIndex + 1) || "/page/index.mu"),
      };
    }
  }

  if (target.startsWith("/")) {
    if (currentDestination === "") {
      return null;
    }

    return {
      destination_hash: currentDestination,
      path: normaliseNomadNetPagePath(target),
    };
  }

  if (currentDestination === "") {
    return null;
  }

  return {
    destination_hash: currentDestination,
    path: resolveNomadNetRelativePath(target, currentPath),
  };
}

function resolveNomadNetRelativePath(target, currentPath) {
  const cleanTarget = String(target || "").trim().replaceAll("\\", "/");

  if (cleanTarget === "") {
    return normaliseNomadNetPagePath(currentPath || "/page/index.mu");
  }

  if (cleanTarget.startsWith("/")) {
    return normaliseNomadNetPagePath(cleanTarget);
  }

  const basePath = normaliseNomadNetPagePath(currentPath || "/page/index.mu");
  const slashIndex = basePath.lastIndexOf("/");
  const baseDir = slashIndex >= 0 ? basePath.slice(0, slashIndex + 1) : "/";

  return normaliseNomadNetPagePath(`${baseDir}${cleanTarget}`);
}

function openNomadNetPageFromMicronLink(destinationHash, path, payload = {}) {
  const destination = normaliseNomadNetDestinationHash(destinationHash);
  const pagePath = normaliseNomadNetPagePath(path || "/page/index.mu");
  const requestData = normaliseNomadNetMicronRequestData(payload.requestData || {});

  if (destination === "") {
    return;
  }

  nomadnetBrowserSaveStatus = "";
  const current = getNomadNetBrowserState();
  const sameDestination = normaliseNomadNetDestinationHash(current.destination_hash || "") === destination;

  nomadnetBrowserState = {
    ...current,
    destination_hash: destination,
    identity_hash: sameDestination ? current.identity_hash || "" : "",
    hops: sameDestination ? current.hops ?? "" : "",
    path: pagePath,
    source: "",
    loading: true,
    error: "",
    last_opened_at: getNomadNetIsoNow(),
    last_request_data: requestData,
  };

  pushNomadNetBrowserHistory(nomadnetBrowserState);
  render("NomadNet");
  fetchNomadNetPage(destination, pagePath, { requestData });
}

function buildNomadNetMicronRequestData(payload = {}) {
  const element = payload?.element;
  const fieldSpec = String(payload?.fields || "").trim();

  if (fieldSpec === "") {
    return {};
  }

  return collectNomadNetMicronFieldValues(element, fieldSpec);
}

function collectNomadNetMicronFieldValues(anchorElement, fieldSpec = "*") {
  const root = anchorElement instanceof HTMLElement
    ? anchorElement.closest(".micron-content")
    : null;

  if (root === null) {
    return {};
  }

  const request = parseNomadNetMicronFieldSpec(fieldSpec);
  const values = { ...request.variables };

  for (const input of Array.from(root.querySelectorAll(".micron-field"))) {
    const name = String(input.dataset.micronName || input.name || "").trim();

    if (name === "" || !shouldCollectNomadNetMicronField(request, name)) {
      continue;
    }

    values[`field_${name}`] = input.value;
  }

  for (const input of Array.from(root.querySelectorAll(".micron-choice input"))) {
    const name = String(input.dataset.micronName || input.name || "").trim();
    const value = String(input.dataset.micronValue || input.value || "");

    if (name === "" || !shouldCollectNomadNetMicronField(request, name)) {
      continue;
    }

    if (input.type === "checkbox") {
      if (!input.checked) {
        continue;
      }

      const key = `field_${name}`;

      if (values[key] === undefined) {
        values[key] = value;
      } else if (Array.isArray(values[key])) {
        values[key].push(value);
      } else {
        values[key] = [values[key], value];
      }

      continue;
    }

    if (input.type === "radio" && input.checked) {
      values[`field_${name}`] = value;
    }
  }

  return normaliseNomadNetMicronRequestData(values);
}

function parseNomadNetMicronFieldSpec(fieldSpec) {
  const request = {
    allFields: false,
    fieldNames: new Set(),
    variables: {},
  };

  for (const rawPart of String(fieldSpec || "").split("|")) {
    const part = rawPart.trim();

    if (part === "") {
      continue;
    }

    if (part === "*") {
      request.allFields = true;
      continue;
    }

    const separator = part.indexOf("=");

    if (separator > 0) {
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1);

      if (key !== "") {
        request.variables[`var_${key}`] = value;
      }

      continue;
    }

    request.fieldNames.add(part);
  }

  return request;
}

function shouldCollectNomadNetMicronField(request, name) {
  return Boolean(request.allFields || request.fieldNames.has(name));
}

function normaliseNomadNetMicronRequestData(values) {
  const result = {};

  for (const [rawName, rawValue] of Object.entries(values || {})) {
    const name = String(rawName || "").trim();

    if (name === "") {
      continue;
    }

    if (Array.isArray(rawValue)) {
      result[name] = rawValue.map((value) => String(value)).join(",");
      continue;
    }

    if (rawValue === undefined || rawValue === null) {
      result[name] = "";
      continue;
    }

    result[name] = String(rawValue);
  }

  return result;
}

function getNomadNetFetchHints(destinationHash, path) {
  const key = getNomadNetHistoryKey({ destination_hash: destinationHash, path });
  const item = nomadnetBookmarkStore.items.find((candidate) => getNomadNetBookmarkKey(candidate) === key) || null;

  if (item === null) {
    return {};
  }

  const lastTransport = normaliseNomadNetTransportHint(item.last_transport);
  const lastTransportParts = [
    lastTransport.interface_type || "",
    lastTransport.interface_name || item.last_interface || "",
    lastTransport.target_host || "",
    lastTransport.target_port || "",
  ].filter((value) => String(value).trim() !== "");

  return {
    bookmark_id: item.id || "",
    last_interface: item.last_interface || lastTransport.interface_name || lastTransport.interface || "",
    last_announce_at: item.last_announce_at || "",
    last_transport_key: lastTransportParts.join("|"),
  };
}


function isNomadNetAnnounce(announce) {
  return getAnnounceType(announce) === "nomadnet" || String(announce?.aspect || "") === "nomadnetwork.node";
}

function getNomadNetAnnounceDestination(announce) {
  return normaliseNomadNetDestinationHash(announce?.destination_hash);
}

function getNomadNetAnnouncePath(announce) {
  const directPath = announce?.path || announce?.page_path || announce?.nomadnet_path || announce?.request_path;

  if (directPath) {
    return normaliseNomadNetPagePath(directPath);
  }

  const preview = String(announce?.app_data_preview || "").trim();

  if (!preview.startsWith("{")) {
    return "";
  }

  try {
    const parsed = JSON.parse(preview);
    const parsedPath = parsed.path || parsed.page_path || parsed.nomadnet_path || parsed.request_path;
    return parsedPath ? normaliseNomadNetPagePath(parsedPath) : "";
  } catch (error) {
    return "";
  }
}

function updateNomadNetBookmarksFromAnnounces(announces, options = {}) {
  if (!Array.isArray(announces) || announces.length === 0) {
    return false;
  }

  let changed = false;

  for (const announce of announces) {
    if (updateNomadNetBookmarksFromAnnounce(announce)) {
      changed = true;
    }
  }

  if (changed) {
    rebuildNomadNetBookmarkSet();

    if (options.save !== false) {
      scheduleNomadNetBrowserStorageSave();
    }
  }

  return changed;
}

function updateNomadNetBookmarksFromAnnounce(announce) {
  if (!isNomadNetAnnounce(announce)) {
    return false;
  }

  const destination = getNomadNetAnnounceDestination(announce);

  if (destination === "") {
    return false;
  }

  normaliseNomadNetBookmarkStoreInPlace();
  const announcePath = getNomadNetAnnouncePath(announce);
  const announceTime = String(announce.time || getNomadNetIsoNow());
  const announceName = String(announce.name || "").trim();
  const announceIdentity = String(announce.identity_hash || "").trim();
  const announceInterface = String(announce.interface || "").trim();
  const announceHops = normaliseNomadNetHops(announce.hops);
  let changed = false;

  for (const item of nomadnetBookmarkStore.items) {
    if (normaliseNomadNetDestinationHash(item.destination_hash) !== destination) {
      continue;
    }

    const previousAnnouncedPath = normaliseNomadNetPagePath(item.announced_path || item.path || NOMADNET_DEFAULT_PATH);
    const previousPath = normaliseNomadNetPagePath(item.path || NOMADNET_DEFAULT_PATH);
    const nextPath = announcePath !== "" && (previousPath === NOMADNET_DEFAULT_PATH || previousPath === previousAnnouncedPath)
      ? announcePath
      : previousPath;
    const updates = {
      last_announce_at: announceTime,
      announce_seen_count: Math.max(0, Number(item.announce_seen_count || 0) || 0) + 1,
      updated_at: getNomadNetIsoNow(),
    };

    if (announceName !== "" && item.name !== announceName) {
      updates.name = announceName;
    }

    if (announceIdentity !== "" && item.identity_hash !== announceIdentity) {
      updates.identity_hash = announceIdentity;
    }

    if (announceHops !== "" && item.hops !== announceHops) {
      updates.hops = announceHops;
    }

    if (announceInterface !== "" && item.last_interface !== announceInterface) {
      updates.last_interface = announceInterface;
      updates.last_transport = {
        ...(normaliseNomadNetTransportHint(item.last_transport)),
        interface: announceInterface,
        interface_name: announceInterface,
      };
    }

    if (announcePath !== "" && item.announced_path !== announcePath) {
      updates.announced_path = announcePath;
    }

    if (nextPath !== previousPath) {
      updates.path = nextPath;
    }

    Object.assign(item, updates);
    changed = true;
  }

  if (changed) {
    updateNomadNetHistoryFromAnnounce({
      destination,
      announcePath,
      announceTime,
      announceName,
      announceIdentity,
      announceHops,
      announceInterface,
    });
  }

  return changed;
}

function updateNomadNetHistoryFromAnnounce(data) {
  const now = getNomadNetIsoNow();

  for (let index = 0; index < nomadnetBrowserHistory.length; index += 1) {
    const entry = nomadnetBrowserHistory[index];

    if (normaliseNomadNetDestinationHash(entry.destination_hash) !== data.destination) {
      continue;
    }

    const previousPath = normaliseNomadNetPagePath(entry.path || NOMADNET_DEFAULT_PATH);
    const updates = {
      ...entry,
      last_announce_at: data.announceTime,
    };

    if (data.announceName !== "") {
      updates.name = data.announceName;
    }

    if (data.announceIdentity !== "") {
      updates.identity_hash = data.announceIdentity;
    }

    if (data.announceHops !== "") {
      updates.hops = data.announceHops;
    }

    if (data.announceInterface !== "") {
      updates.last_interface = data.announceInterface;
      updates.last_transport = {
        ...(normaliseNomadNetTransportHint(entry.last_transport)),
        interface: data.announceInterface,
        interface_name: data.announceInterface,
      };
    }

    if (data.announcePath !== "" && previousPath === NOMADNET_DEFAULT_PATH) {
      updates.path = data.announcePath;
    }

    updates.updated_at = now;
    nomadnetBrowserHistory[index] = updates;
  }
}

function updateNomadNetBookmarksFromPageSuccess(state) {
  const key = getNomadNetBookmarkKey(state);
  let changed = false;
  const now = getNomadNetIsoNow();

  for (const item of nomadnetBookmarkStore.items) {
    if (getNomadNetBookmarkKey(item) !== key) {
      continue;
    }

    Object.assign(item, {
      identity_hash: state.identity_hash || item.identity_hash || "",
      hops: state.hops ?? item.hops ?? "",
      runtime: state.runtime || item.runtime || "reticulum",
      last_interface: state.last_interface || item.last_interface || "",
      last_transport: normaliseNomadNetTransportHint(state.last_transport || item.last_transport),
      last_success_at: now,
      updated_at: now,
    });
    changed = true;
  }

  if (changed) {
    scheduleNomadNetBrowserStorageSave();
  }

  return changed;
}

function renderAnnounceListHeader() {
  const header = document.createElement("div");
  header.className = "announce-list-header";

  for (const label of ["Type", "Name", "Hash", "Distance"]) {
    const cell = document.createElement("span");
    cell.textContent = label;
    header.appendChild(cell);
  }

  return header;
}

function renderAnnounceResults(announces, count, list) {
  const visibleAnnounces = filterAnnouncesForDisplay(announces);
  const shouldStickToBottom = isAnnounceListAtBottom(list);
  count.textContent = `${visibleAnnounces.length} announces`;
  list.replaceChildren();

  if (visibleAnnounces.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No announces received for current filters.";
    list.appendChild(empty);
    return;
  }

  for (const announce of visibleAnnounces) {
    list.appendChild(renderAnnounceRow(announce));
  }

  if (shouldStickToBottom) {
    window.setTimeout(() => {
      list.scrollTop = list.scrollHeight;
    }, 0);
  }
}

function renderAnnounceTypeFilter(onChange) {
  const field = document.createElement("label");
  field.className = "announce-filter-field";

  const label = document.createElement("span");
  label.textContent = "Type";
  field.appendChild(label);

  const select = document.createElement("select");

  for (const [value, text] of getAnnounceTypeFilterOptions()) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = text;
    option.selected = announceFilters.type === value;
    select.appendChild(option);
  }

  select.onchange = () => {
    announceFilters.type = select.value;
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
  };
  input.onkeydown = (event) => {
    if (event.key === "Enter") {
      requestAnnounceRefresh(onChange);
    }
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
  };
  field.appendChild(input);
  return field;
}

function renderAnnounceApplyButton(onChange) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "announce-filter-apply";
  button.textContent = "Apply";
  button.onclick = () => requestAnnounceRefresh(onChange);
  return button;
}

function requestAnnounceRefresh(onChange) {
  if (typeof onChange === "function") {
    onChange();
  }

  startAnnounceUpdates(true);
}

function startClientUpdates() {
  if (!Boolean(currentStatus?.config?.client_enabled)) {
    if (clientStream !== null) {
      clientStream.close();
      clientStream = null;
    }
    return;
  }

  if (typeof EventSource !== "function") {
    return;
  }

  if (clientStream !== null) {
    clientStream.close();
  }

  clientStream = new EventSource("/api/clients/stream");

  clientStream.addEventListener("ready", () => {
    refreshClientDataFromStream();
  });

  clientStream.addEventListener("client-change", () => {
    refreshClientDataFromStream();
  });

  clientStream.onerror = () => {
    // EventSource reconnects automatically. The next "ready" event
    // refreshes the complete client snapshot, so no message can be missed.
  };
}

async function refreshClientDataFromStream() {
  if (clientRefreshInFlight) {
    return;
  }

  clientRefreshInFlight = true;

  try {
    const response = await fetch("/api/clients", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Client refresh failed: HTTP ${response.status}`);
    }

    const clients = await response.json();

    if (currentStatus === null) {
      currentStatus = {};
    }

    currentStatus.clients = clients;

    if (getActiveTab() === "Client") {
      refreshVisibleClientData();
    }
  } catch (error) {
    appendUiError(error);
  } finally {
    clientRefreshInFlight = false;
  }
}

function refreshVisibleClientData() {
  renderSidebarContacts("Client");

  const clientsData = currentStatus?.clients || {};
  const clients = Array.isArray(clientsData.clients) ? clientsData.clients : [];

  if (clients.length === 0) {
    render("Client");
    return;
  }

  const activeClient = selectActiveClient(clients);
  const conversations = getClientConversations(activeClient);
  const previousContactId = activeContactId;
  const activeConversation = selectActiveConversation(conversations);
  const currentContactId = activeConversation?.contact?.id || "";

  if (previousContactId !== currentContactId) {
    render("Client");
    return;
  }

  const list = document.querySelector(".client-thread-panel .message-list");

  if (list === null) {
    render("Client");
    return;
  }

  const messages = Array.isArray(activeConversation?.messages)
    ? activeConversation.messages
    : [];

  refreshMessageList(list, messages);
}

function refreshMessageList(list, messages) {
  const stickToBottom = isMessageListAtBottom(list);
  const previousScrollTop = list.scrollTop;

  list.replaceChildren();

  if (messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No messages";
    list.appendChild(empty);
  }

  for (const message of messages) {
    const bubble = document.createElement("div");
    bubble.className = message.direction === "outbound"
      ? "message-bubble outbound"
      : "message-bubble inbound";
    bubble.appendChild(renderMicronContent(message.content || ""));
    list.appendChild(bubble);
  }

  window.setTimeout(() => {
    if (stickToBottom) {
      list.scrollTop = list.scrollHeight;
    } else {
      list.scrollTop = previousScrollTop;
    }
  }, 0);
}

function isMessageListAtBottom(list) {
  if (list.scrollHeight <= list.clientHeight) {
    return true;
  }

  return list.scrollHeight - list.scrollTop - list.clientHeight < 12;
}

function startAnnounceUpdates(force) {
  const params = buildAnnounceQueryParams();
  const key = params.toString();

  if (!force && announceQueryKey === key && announceStream !== null) {
    return;
  }

  announceQueryKey = key;
  fetchAnnouncesSnapshot(params);
  openAnnounceStream(params);
}

async function fetchAnnouncesSnapshot(params) {
  if (announceFetchInFlight) {
    return;
  }

  announceFetchInFlight = true;

  try {
    const response = await fetch(`/api/announces?${params.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Announces request failed: HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (currentStatus === null) {
      currentStatus = {};
    }

    currentStatus.announces = Array.isArray(payload.announces) ? payload.announces : [];
    updateNomadNetBookmarksFromAnnounces(currentStatus.announces);

    if (getActiveTab() === "Announces") {
      render("Announces");
    }
  } catch (error) {
    appendUiError(error);
    render("Logs");
  } finally {
    announceFetchInFlight = false;
  }
}

function openAnnounceStream(params) {
  if (announceStream !== null) {
    announceStream.close();
    announceStream = null;
  }

  if (typeof EventSource !== "function") {
    return;
  }

  const streamParams = new URLSearchParams(params);
  const lastId = lastAnnounceId();

  if (lastId > 0) {
    streamParams.set("after_id", String(lastId));
  }

  announceStream = new EventSource(`/api/announces/stream?${streamParams.toString()}`);
  announceStream.addEventListener("announce", (event) => {
    try {
      appendAnnounceFromStream(JSON.parse(event.data));
    } catch (error) {
      appendUiError(error);
    }
  });
  announceStream.onerror = () => {
    if (getActiveTab() !== "Announces") {
      return;
    }
  };
}

function appendAnnounceFromStream(announce) {
  if (currentStatus === null) {
    currentStatus = {};
  }

  const current = Array.isArray(currentStatus.announces) ? currentStatus.announces : [];
  const announceId = Number(announce.id) || 0;
  const existingIndex = current.findIndex((item) => Number(item.id) === announceId && announceId > 0);

  if (existingIndex >= 0) {
    current[existingIndex] = announce;
  } else {
    current.push(announce);
  }

  currentStatus.announces = current.slice(-500);
  updateNomadNetBookmarksFromAnnounce(announce);

  if (getActiveTab() === "Announces") {
    renderAnnouncesAfterStreamUpdate();
  }
}

function renderAnnouncesAfterStreamUpdate() {
  if (document.activeElement instanceof HTMLElement && document.activeElement.closest(".announce-filters") !== null) {
    return;
  }

  const list = document.querySelector(".announce-list");
  const shouldStickToBottom = list === null || isAnnounceListAtBottom(list);
  const previousScrollTop = list === null ? 0 : list.scrollTop;

  render("Announces");

  window.setTimeout(() => {
    const newList = document.querySelector(".announce-list");

    if (newList === null) {
      return;
    }

    if (shouldStickToBottom) {
      newList.scrollTop = newList.scrollHeight;
    } else {
      newList.scrollTop = previousScrollTop;
    }
  }, 0);
}

function isAnnounceListAtBottom(list) {
  if (list === null || list.scrollHeight <= list.clientHeight) {
    return true;
  }

  return list.scrollHeight - list.scrollTop - list.clientHeight < 12;
}

function lastAnnounceId() {
  const announces = Array.isArray(currentStatus?.announces) ? currentStatus.announces : [];
  return announces.reduce((maxId, announce) => Math.max(maxId, Number(announce.id) || 0), 0);
}

function buildAnnounceQueryParams() {
  const params = new URLSearchParams();
  params.set("limit", "500");

  for (const key of ["type", "name", "destination", "identity", "lxmf"]) {
    const value = String(announceFilters[key] || "").trim();

    if (key === "type" && (value === "all" || value === UNKNOWN_ASPECT_FILTER_VALUE)) {
      continue;
    }

    if (value !== "") {
      params.set(key, value);
    }
  }

  const hops = Number(announceFilters.hops) || 0;

  if (hops > 0) {
    params.set("hops", String(hops));
  }

  return params;
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
  type.className = `announce-row-type announce-type-${getAnnounceTypeCssName(announce)}`;
  type.textContent = getAnnounceTypeLabel(announce);
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
  hops.textContent = announce.hops === null || announce.hops === undefined ? "-" : `${announce.hops}h`;
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
  badge.className = `announce-type announce-type-${getAnnounceTypeCssName(announce)}`;
  badge.textContent = getAnnounceTypeLabel(announce);
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
  title.className = "announce-modal-title";
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
  bookmarkButton.textContent = isNomadNetBookmarkSaved(announceToNomadNetBookmarkCandidate(announceModalState))
    ? "Bookmarked"
    : "Bookmark";
  bookmarkButton.disabled = getAnnounceType(announceModalState) !== "nomadnet";
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
  pageButton.disabled = getAnnounceType(announceModalState) !== "nomadnet";
  pageButton.onclick = () => openAnnounceNomadnetPage(announceModalState);
  actions.appendChild(pageButton);

  const copyButton = renderCopyButton("Copy", () => formatAnnounceCardForClipboard(announceModalState));
  copyButton.title = "Copy announce card";
  actions.appendChild(copyButton);

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

function announceCanOpenChat(announce) {
  return String(announce.lxmf || announce.destination_hash || "") !== "";
}

function announceToContact(announce) {
  const destination = String(announce.lxmf || announce.destination_hash || "");
  return {
    id: `announce-${destination.slice(0, 12) || announce.id || "contact"}`,
    name: announce.name || getAnnounceTypeLabel(announce),
    destination_hash: announce.destination_hash || destination,
    identity_hash: announce.identity_hash || "",
    lxmf_address: announce.lxmf ? `lxmf://${announce.lxmf}` : "",
    last_announce: announce.time || "",
    hops: announce.hops,
    path_status: "announced",
  };
}

function announceToNomadNetBookmarkCandidate(announce) {
  return createNomadNetHistoryEntry({
    name: announce?.name || "NomadNet node",
    destination_hash: announce?.destination_hash || "",
    identity_hash: announce?.identity_hash || "",
    hops: announce?.hops,
    path: "/page/index.mu",
    runtime: "stub",
  });
}

function getAnnounceBookmarkId(announce) {
  return getNomadNetBookmarkKey(announceToNomadNetBookmarkCandidate(announce));
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
  if (getAnnounceType(announce) !== "nomadnet") {
    return;
  }

  addNomadNetBookmarkFromState(announceToNomadNetBookmarkCandidate(announce));
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
  if (getAnnounceType(announce) !== "nomadnet") {
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
  pushNomadNetBrowserHistory(nomadnetBrowserState);
  render("NomadNet");
  fetchNomadNetPage(nomadnetBrowserState.destination_hash, nomadnetBrowserState.path);
}

function getClientConversations(client) {
  let conversations = Array.isArray(client?.conversations) ? client.conversations : [];

  if (transientConversation !== null && transientConversation.client_id === client?.id) {
    const transientContactId = transientConversation.contact?.id || "";
    const hasContact = conversations.some(
      (conversation) => conversation.contact?.id === transientContactId
    );

    if (transientContactId !== "" && !hasContact) {
      conversations = [...conversations, transientConversation];
    }
  }

  return conversations;
}

function renderClientContactsPanel(clients) {
  const block = renderCollapsibleSection("clientAccounts", "Contacts");

  const actionRow = document.createElement("div");
  actionRow.className = "settings-row client-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.textContent = "Add Contact";
  addButton.title = "Add a contact from received announces";
  addButton.disabled = clients.length === 0;
  addButton.onclick = () => render("Announces");
  actionRow.appendChild(addButton);
  block.appendChild(actionRow);

  const contactList = document.createElement("div");
  contactList.className = "client-accounts-list";

  if (clients.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No local identities loaded";
    contactList.appendChild(empty);
    block.appendChild(contactList);
    return block;
  }

  const activeClient = selectActiveClient(clients);
  const conversations = getClientConversations(activeClient);
  const activeConversation = selectActiveConversation(conversations);
  const selectedContactId = activeConversation?.contact?.id || "";

  if (conversations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No contacts for this identity";
    contactList.appendChild(empty);
  }

  for (const conversation of conversations) {
    const contact = conversation?.contact;

    if (contact === null || contact === undefined) {
      continue;
    }

    const card = document.createElement("div");
    card.className = "client-account-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");

    if (contact.id === selectedContactId) {
      card.setAttribute("aria-current", "true");
    }

    card.onclick = () => openClientContact(activeClient, contact);
    card.onkeydown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      openClientContact(activeClient, contact);
    };

    const summary = document.createElement("div");
    summary.className = "client-account-summary";

    const summaryText = document.createElement("div");
    summaryText.className = "client-account-summary-text";

    const contactName = document.createElement("div");
    contactName.className = "client-account-name";
    contactName.textContent = contact.name || contact.id || "-";
    summaryText.appendChild(contactName);

    const contactPreview = document.createElement("div");
    contactPreview.className = "client-account-lxmf";
    contactPreview.textContent = (
      conversation.last_message
      || contact.lxmf_address
      || contact.destination_hash
      || "No messages"
    );
    summaryText.appendChild(contactPreview);
    summary.appendChild(summaryText);

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "client-account-menu-button";
    menuButton.title = "Contact actions";
    menuButton.setAttribute("aria-label", "Contact actions");
    menuButton.textContent = "...";
    menuButton.onclick = (event) => {
      const rect = menuButton.getBoundingClientRect();
      event.stopPropagation();
      openContactMenu(contact, rect.left, rect.bottom + 6);
    };
    summary.appendChild(menuButton);

    card.appendChild(summary);
    contactList.appendChild(card);
  }

  block.appendChild(contactList);
  return block;
}

function openClientContact(client, contact) {
  activeClientId = client.id || "";
  activeContactId = contact.id || "";
  contactMenuState = null;
  clientAccountMenuState = null;
  collapsedPanels.conversations = false;
  render("Client");
}

function openClientConversations(client) {
  activeClientId = client.id || "";
  activeContactId = "";
  clientAccountMenuState = null;
  collapsedPanels.conversations = false;
  render("Client");
}

function getClientLxmfWorker(clientId) {
  const workers = Array.isArray(currentStatus?.engine?.lxmf_client?.workers)
    ? currentStatus.engine.lxmf_client.workers
    : [];

  return workers.find((worker) => worker.identity_id === clientId) || null;
}

async function controlClientLxmf(client, action) {
  const clientId = client?.id || "";

  if (clientId === "") {
    return;
  }

  clientAccountMenuState = null;

  try {
    const response = await fetch(
      `/api/clients/${encodeURIComponent(clientId)}/lxmf/${encodeURIComponent(action)}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload.message
        || payload.error
        || `LXMF ${action} failed: HTTP ${response.status}`
      );
    }

    await fetchStatus();
    render("Client");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  }
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
  const worker = getClientLxmfWorker(client.id || "");
  const workerRunning = Boolean(worker?.running);
  const actions = [
    ["Edit", () => {
      clientAccountMenuState = null;
      openClientEditor(client);
    }],
    ["Remove", () => {
      clientAccountMenuState = null;
      removeClient(client);
    }],
  ];
  if (workerRunning) {
    actions.push(["Stop LXMF", () => controlClientLxmf(client, "stop")]);
    actions.push(["Restart LXMF", () => controlClientLxmf(client, "restart")]);
  } else {
    actions.push(["Start LXMF", () => controlClientLxmf(client, "start")]);
  }
  actions.push(
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
  );
  for (const [label, action] of actions) {
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
  hint.textContent = "Local identities are separate from contacts. Message transport is not wired yet.";
  section.appendChild(hint);

  if (clients.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "Create a local identity to load conversations.";
    section.appendChild(empty);
    return section;
  }

  const activeClient = selectActiveClient(clients);
  const conversations = getClientConversations(activeClient);
  const activeConversation = selectActiveConversation(conversations);
  const activeContact = activeConversation?.contact || null;
  const messages = Array.isArray(activeConversation?.messages)
    ? activeConversation.messages
    : [];

  const accountRow = document.createElement("div");
  accountRow.className = "settings-row client-chat-account-row";

  const accountSelect = document.createElement("select");
  accountSelect.title = "Local identity";
  accountSelect.setAttribute("aria-label", "Local identity");

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
    transientConversation = null;
    render("Client");
  };
  accountRow.appendChild(accountSelect);

  const addIdentityButton = document.createElement("button");
  addIdentityButton.type = "button";
  addIdentityButton.textContent = "+";
  addIdentityButton.title = "Create local identity";
  addIdentityButton.setAttribute("aria-label", "Create local identity");
  addIdentityButton.onclick = openNewClientEditor;
  accountRow.appendChild(addIdentityButton);

  const identityMenuButton = document.createElement("button");
  identityMenuButton.type = "button";
  identityMenuButton.textContent = "...";
  identityMenuButton.title = "Local identity actions";
  identityMenuButton.setAttribute("aria-label", "Local identity actions");
  identityMenuButton.onclick = () => {
    const rect = identityMenuButton.getBoundingClientRect();
    clientAccountMenuState = {
      client: activeClient,
      x: rect.left,
      y: rect.bottom + 6,
    };
    render("Client");
  };
  accountRow.appendChild(identityMenuButton);

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

  let previousAlignment = "a";

  for (const line of lineNodes) {
    const alignment = getMessageLineAlignment(line);
    const alignmentPrefix = alignment === previousAlignment ? "" : `\`${alignment}`;

    if (line.classList.contains("micron-divider")) {
      lines.push(`${alignmentPrefix}${line.dataset.micronSource || "-"}`);
      previousAlignment = alignment;
      continue;
    }

    lines.push(`${alignmentPrefix}${serializeMessageLinePrefix(line)}${serializeMessageInlineNode(line)}`);
    previousAlignment = alignment;
  }

  return lines.join("\n");
}

function serializeMessageLinePrefix(line) {
  let prefix = "";

  if (line.classList.contains("micron-heading")) {
    prefix += ">";
  }

  return prefix;
}

function getMessageLineAlignment(line) {
  for (const alignment of ["c", "l", "r", "a"]) {
    if (line.classList.contains(`micron-align-${alignment}`)) {
      return alignment;
    }
  }

  return "a";
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
    wrapper.appendChild(window.FriendlyNodeRnsConfigEditor.render({ mode: "interfaces", status: currentStatus }));
    return wrapper;
  }

  wrapper.appendChild(renderTable("Interfaces"));
  return wrapper;
}

function renderTransport() {
  const wrapper = document.createElement("div");

  wrapper.appendChild(renderTransportStatusPanel());

  if (window.FriendlyNodeRnsConfigEditor !== undefined) {
    wrapper.appendChild(window.FriendlyNodeRnsConfigEditor.render({ mode: "transport", status: currentStatus }));
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

async function loadLxmfReleaseOverviewIfNeeded() {
  if (lxmfReleaseOverview !== null || lxmfReleaseLoadInFlight) {
    return;
  }

  lxmfReleaseLoadInFlight = true;
  lxmfReleaseLoadError = "";

  try {
    const response = await fetch("/api/runtime/lxmf/releases", {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.message
        || payload.error
        || `HTTP ${response.status}`,
      );
    }

    lxmfReleaseOverview = payload;
  } catch (error) {
    lxmfReleaseLoadError = error.message || String(error);
  } finally {
    lxmfReleaseLoadInFlight = false;

    if (getActiveTab() === "Settings") {
      render("Settings");
    }
  }
}

function formatLxmfCompatibility(compatibility) {
  if (compatibility === null || typeof compatibility !== "object") {
    return "unknown";
  }

  if (compatibility.compatible === true) {
    return compatibility.message || "compatible";
  }

  if (compatibility.compatible === false) {
    return compatibility.message || "incompatible";
  }

  return compatibility.message || compatibility.status || "unknown";
}

function renderLxmfReleaseSettings() {
  loadLxmfReleaseOverviewIfNeeded();

  const wrapper = document.createElement("div");
  wrapper.className = "runtime-feature-capabilities";

  const title = document.createElement("h4");
  title.textContent = "LXMF release";
  wrapper.appendChild(title);

  const runtimeLxmf = currentStatus?.runtime?.lxmf || {};
  const overview = lxmfReleaseOverview || {};
  const lxmf = overview.lxmf || runtimeLxmf;
  const releases = Array.isArray(overview.releases) ? overview.releases : [];

  const details = document.createElement("div");
  details.className = "settings-compact-grid";
  details.appendChild(renderCompactSetting("Installed", lxmf.installed ? (lxmf.release_version || "-") : "not installed"));
  details.appendChild(renderCompactSetting("Source", lxmf.source_path || "-"));
  details.appendChild(renderCompactSetting("RNS requirement", lxmf.rns_requirement || "-"));
  details.appendChild(renderCompactSetting("Compatibility", formatLxmfCompatibility(lxmf.compatibility)));
  wrapper.appendChild(details);

  if (lxmfReleaseLoadError !== "") {
    const error = document.createElement("div");
    error.className = "settings-hint";
    error.textContent = `LXMF release list failed: ${lxmfReleaseLoadError}`;
    wrapper.appendChild(error);
    return wrapper;
  }

  if (lxmfReleaseLoadInFlight) {
    const loading = document.createElement("div");
    loading.className = "settings-hint";
    loading.textContent = "Loading LXMF releases...";
    wrapper.appendChild(loading);
    return wrapper;
  }

  if (releases.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No LXMF releases available.";
    wrapper.appendChild(empty);
    return wrapper;
  }

  const row = document.createElement("div");
  row.className = "settings-row";

  const select = document.createElement("select");
  select.id = "lxmf-release-select";

  for (const release of releases) {
    const option = document.createElement("option");
    option.value = release.version;
    option.textContent = [
      release.label || release.version,
      release.version === lxmf.release_version ? "installed" : "",
      release.recommended ? "recommended" : "",
      release.source === "local" ? "local" : "",
    ].filter(Boolean).join(" - ");

    if (release.version === lxmf.release_version) {
      option.selected = true;
    }

    select.appendChild(option);
  }

  const button = document.createElement("button");
  button.type = "button";
  button.id = "install-lxmf-release";
  button.textContent = lxmfReleaseInstallInFlight
    ? "Installing LXMF..."
    : "Install LXMF release";
  button.disabled = lxmfReleaseInstallInFlight;
  button.onclick = installLxmfReleaseFromUi;

  row.appendChild(select);
  row.appendChild(button);
  wrapper.appendChild(row);

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "LXMF is installed independently from RNS. Incompatible versions are rejected by backend.";
  wrapper.appendChild(hint);

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
  const releases = Array.isArray(runtime.releases) ? runtime.releases : [];
  const capabilities = Array.isArray(runtime.interface_capabilities)
    ? runtime.interface_capabilities
    : [];
  const currentRuntime = availableRuntimes.find((item) => item.name === activeRuntime) || {};
  const featureCapabilities = Array.isArray(currentRuntime.feature_capabilities)
    ? currentRuntime.feature_capabilities
    : [];

  for (const [label, value] of [
    ["Active", activeRuntime],
    ["Available", String(availableRuntimes.length)],
    ["Engine", engine.running ? "running" : "stopped"],
    ["RNS runtime", rns.rns_using_stub ? "stub" : "native"],
    ["RNS version", rns.rns_version || "-"],
    ["LXMF runtime", rns.lxmf_enabled ? (rns.lxmf_loaded ? "native" : "stub") : "disabled"],
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

  if (releases.length > 0) {
    const releaseRow = document.createElement("div");
    releaseRow.className = "settings-row";

    const releaseSelect = document.createElement("select");
    releaseSelect.id = "runtime-release-select";

    for (const release of releases) {
      const option = document.createElement("option");
      const activeReleaseVersion = currentRuntime.release_version || "";
      option.value = release.version;
      option.textContent = [
        release.label || release.version,
        release.version === activeReleaseVersion ? "active" : "",
        release.recommended ? "recommended" : "",
        release.installed ? "installed" : "",
        release.verified === false ? "PyPI only" : "",
      ].filter(Boolean).join(" - ");

      if (release.version === activeReleaseVersion) {
        option.selected = true;
      }

      releaseSelect.appendChild(option);
    }

    const installButton = document.createElement("button");
    installButton.type = "button";
    installButton.id = "install-runtime-release";
    installButton.textContent = "Install release";
    installButton.onclick = installRuntimeReleaseFromUi;

    releaseRow.appendChild(releaseSelect);
    releaseRow.appendChild(installButton);
    runtimeBlock.appendChild(releaseRow);
  }

  runtimeBlock.appendChild(renderLxmfReleaseSettings());
  runtimeBlock.appendChild(renderRuntimeInterfaceCapabilities(capabilities));
  runtimeBlock.appendChild(renderRuntimeFeatureCapabilities(activeRuntime, featureCapabilities));

  const hint = document.createElement("div");
  hint.className = "settings-hint";
  hint.textContent = "Changing runtime saves controller config and restarts the Reticulum engine.";
  runtimeBlock.appendChild(hint);

  return runtimeBlock;
}

function renderRuntimeInterfaceCapabilities(capabilities) {
  const wrapper = document.createElement("div");
  wrapper.className = "runtime-interface-capabilities";

  const title = document.createElement("h3");
  title.textContent = "Interface capabilities";
  wrapper.appendChild(title);

  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const header = document.createElement("tr");

  for (const label of ["Type", "Installed", "Configured", "Enabled"]) {
    const th = document.createElement("th");
    th.textContent = label;
    header.appendChild(th);
  }

  thead.appendChild(header);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  if (capabilities.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No runtime interface capabilities available.";
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  for (const item of capabilities) {
    const row = document.createElement("tr");

    for (const value of [
      item.type || "-",
      item.installed ? "yes" : "no",
      String(item.configured || 0),
      String(item.enabled || 0),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    }

    tbody.appendChild(row);
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);
  return wrapper;
}

async function waitForFriendlyNodeProcessRestart() {
  await new Promise((resolve) => window.setTimeout(resolve, 1500));

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch("/api/status", {
        cache: "no-store",
      });

      if (response.ok) {
        window.location.reload();
        return;
      }
    } catch (error) {
      // FriendlyNode is restarting.
    }

    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  window.location.reload();
}

function readFriendlyNodeModuleConfig() {
  const config = currentStatus?.config || {};

  return {
    lxmf_enabled: Boolean(config.lxmf_enabled),
    nomadnet_enabled: Boolean(config.nomadnet_enabled),
    client_enabled: Boolean(config.client_enabled),
  };
}

function getFriendlyNodeModuleDraft() {
  if (runtimeModuleDraft === null) {
    runtimeModuleDraft = readFriendlyNodeModuleConfig();
  }

  return runtimeModuleDraft;
}

function friendlyNodeModuleDraftChanged() {
  const saved = readFriendlyNodeModuleConfig();
  const draft = getFriendlyNodeModuleDraft();

  return FRIENDLYNODE_MODULE_KEYS.some(
    (key) => Boolean(saved[key]) !== Boolean(draft[key]),
  );
}

function setFriendlyNodeModuleDraft(featureName, enabled) {
  if (!FRIENDLYNODE_MODULE_KEYS.includes(featureName)) {
    return;
  }

  const draft = getFriendlyNodeModuleDraft();
  draft[featureName] = Boolean(enabled);

  if (featureName === "client_enabled" && enabled) {
    draft.lxmf_enabled = true;
  }

  if (featureName === "lxmf_enabled" && !enabled) {
    draft.client_enabled = false;
  }

  render("Settings");
}

async function applyFriendlyNodeModules() {
  if (
    runtimeModuleApplyInFlight
    || !friendlyNodeModuleDraftChanged()
  ) {
    return;
  }

  const draft = getFriendlyNodeModuleDraft();

  const payload = {
    lxmf_enabled: Boolean(draft.lxmf_enabled),
    nomadnet_enabled: Boolean(draft.nomadnet_enabled),
    client_enabled: Boolean(draft.client_enabled),
  };

  runtimeModuleApplyInFlight = true;
  render("Settings");

  try {
    const saveResponse = await fetch("/api/config", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const saveResult = await saveResponse.json().catch(() => ({}));

    if (!saveResponse.ok) {
      throw new Error(
        saveResult.message
        || saveResult.error
        || `HTTP ${saveResponse.status}`,
      );
    }

    if (currentStatus !== null) {
      currentStatus.config = saveResult;
    }

    runtimeModuleDraft = {
      lxmf_enabled: Boolean(saveResult.lxmf_enabled),
      nomadnet_enabled: Boolean(saveResult.nomadnet_enabled),
      client_enabled: Boolean(saveResult.client_enabled),
    };

    setEngineRestartInFlight(true);
    render("Settings");

    const restartResponse = await fetch("/api/reticulum/restart", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    const restartResult = await restartResponse.json().catch(() => ({}));

    if (!restartResponse.ok) {
      throw new Error(
        restartResult.message
        || restartResult.error
        || `HTTP ${restartResponse.status}`,
      );
    }

    await waitForFriendlyNodeProcessRestart();
  } catch (error) {
    runtimeModuleApplyInFlight = false;
    setEngineRestartInFlight(false);
    render("Settings");

    window.alert(
      `Could not apply FriendlyNode modules: ${error.message}`,
    );
  }
}

function renderRuntimeFeatureCapabilities(activeRuntime, features) {
  const wrapper = document.createElement("div");
  wrapper.className = "runtime-feature-capabilities";

  const title = document.createElement("h3");
  title.textContent = "Runtime features";
  wrapper.appendChild(title);

  const moduleConfig = getFriendlyNodeModuleDraft();

  const moduleFeatures = [
    {
      name: "lxmf_enabled",
      label: "LXMF",
      enabled: Boolean(moduleConfig.lxmf_enabled),
      description: "Load the LXMF messaging module. Client requires LXMF.",
    },
    {
      name: "nomadnet_enabled",
      label: "NomadNet",
      enabled: Boolean(moduleConfig.nomadnet_enabled),
      description: "Enable NomadNet browser, publisher and page functions.",
    },
    {
      name: "client_enabled",
      label: "Client",
      enabled: Boolean(moduleConfig.client_enabled),
      description: "Enable the messaging client. Enabling Client also enables LXMF.",
    },
  ];

  for (const feature of moduleFeatures) {
    const row = document.createElement("label");
    row.className = "settings-checkbox-row";

    const label = document.createElement("span");
    label.textContent = feature.label;
    row.appendChild(label);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "friendlynode-module-checkbox";
    checkbox.checked = feature.enabled;
    checkbox.disabled = runtimeModuleApplyInFlight;
    checkbox.onchange = () => setFriendlyNodeModuleDraft(
      feature.name,
      checkbox.checked,
    );

    row.appendChild(checkbox);
    wrapper.appendChild(row);

    const hint = document.createElement("div");
    hint.className = "settings-hint";
    hint.textContent = feature.description;
    wrapper.appendChild(hint);
  }

  const moduleActions = document.createElement("div");
  moduleActions.className = "runtime-feature-actions";

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.textContent = runtimeModuleApplyInFlight
    ? "Applying modules..."
    : "Apply modules";
  applyButton.disabled = (
    runtimeModuleApplyInFlight
    || !friendlyNodeModuleDraftChanged()
  );
  applyButton.onclick = applyFriendlyNodeModules;
  moduleActions.appendChild(applyButton);

  const moduleStatus = document.createElement("div");
  moduleStatus.className = "settings-hint";
  moduleStatus.textContent = runtimeModuleApplyInFlight
    ? "Module configuration saved. FriendlyNode is restarting."
    : friendlyNodeModuleDraftChanged()
      ? "Module configuration has unapplied changes."
      : "Module configuration is applied.";
  moduleActions.appendChild(moduleStatus);

  wrapper.appendChild(moduleActions);

  const packageTitle = document.createElement("h4");
  packageTitle.textContent = "Optional runtime packages";
  wrapper.appendChild(packageTitle);

  const runtimeFeatures = Array.isArray(features) ? features : [];

  if (runtimeFeatures.length === 0) {
    const empty = document.createElement("div");
    empty.className = "settings-hint";
    empty.textContent = "No optional runtime packages available.";
    wrapper.appendChild(empty);
    return wrapper;
  }

  for (const feature of runtimeFeatures) {
    const row = document.createElement("label");
    row.className = "settings-checkbox-row";

    const label = document.createElement("span");
    label.textContent = [
      feature.label || feature.name,
      feature.installed ? "installed" : "not installed",
    ].filter(Boolean).join(" - ");
    row.appendChild(label);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(feature.enabled);
    checkbox.disabled = activeRuntime === "stub";
    checkbox.onchange = () => setRuntimeFeatureFromUi(
      activeRuntime,
      feature.name,
      checkbox.checked,
    );

    row.appendChild(checkbox);
    wrapper.appendChild(row);

    const hint = document.createElement("div");
    hint.className = "settings-hint";
    hint.textContent = feature.description || "";
    wrapper.appendChild(hint);
  }

  return wrapper;
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

  if (tab !== "NomadNet") {
    nomadnetBrowserSettingsModalOpen = false;
    nomadnetBookmarkTreeModalState = null;
    nomadnetBookmarkAddGroupState = null;
    nomadnetBookmarkPageModalState = null;
    clearNomadNetBookmarkDragState();
  }

  document.querySelector("h1").textContent = tab;
  renderChannelSecurityWarning();
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

function renderChannelSecurityWarning() {
  const security = getChannelSecurityStatus();
  const insecure = !security.secure;
  document.body.classList.toggle("insecure-channel", insecure);

  const main = document.querySelector("main");
  const topbar = document.querySelector(".topbar");

  if (main === null || topbar === null) {
    return;
  }

  let warning = main.querySelector(".channel-security-warning");

  if (!insecure) {
    if (warning !== null) {
      warning.remove();
    }

    return;
  }

  if (warning === null) {
    warning = document.createElement("div");
    warning.className = "channel-security-warning";
    warning.setAttribute("role", "status");
    main.insertBefore(warning, topbar);
  }

  warning.textContent = `Your channel is not secure: ${security.reason}`;
}

function getChannelSecurityStatus() {
  const backendSecurity = currentStatus?.access?.security;

  if (backendSecurity && typeof backendSecurity.secure === "boolean") {
    return {
      secure: backendSecurity.secure,
      reason: String(backendSecurity.reason || backendSecurity.level || "backend security assessment"),
    };
  }

  if (isBrowserChannelSecure()) {
    return {
      secure: true,
      reason: "Browser reports a secure local or HTTPS context.",
    };
  }

  return {
    secure: false,
    reason: "Plain HTTP over a non-local browser address.",
  };
}

function isBrowserChannelSecure() {
  return window.isSecureContext
    || window.location.protocol === "https:"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1"
    || window.location.hostname === "::1"
    || window.location.hostname === "[::1]"
    || isBrowserTailscaleHost(window.location.hostname);
}

function isBrowserTailscaleHost(hostname) {
  const parts = String(hostname || "").split(".").map((part) => Number(part));

  return parts.length === 4
    && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    && parts[0] === 100
    && parts[1] >= 64
    && parts[1] <= 127;
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element !== null) {
    element.textContent = value;
  }
}

function setEngineRestartInFlight(restarting) {
  engineRestartInFlight = Boolean(restarting);

  if (engineRestartInFlight) {
    setText("#engine-status", "engine: restarting");
    return;
  }

  const running = Boolean(currentStatus?.engine?.running);
  setText("#engine-status", running ? "engine: running" : "engine: stopped");
}

function updateSummaryCards(status) {
  const engine = status.engine || {};
  const rns = engine.rns || {};
  const engineRuntime = engine.runtime || {};
  const logs = Array.isArray(status.logs) ? status.logs : [];
  const runtime = status.runtime || {};
  const availableRuntimes = Array.isArray(runtime.available) ? runtime.available : [];
  const rnsInterfaces = Array.isArray(rns.interfaces) ? rns.interfaces : [];

  setText(
    "#engine-status",
    engineRestartInFlight
      ? "engine: restarting"
      : engine.running
        ? "engine: running"
        : "engine: stopped",
  );

  const cards = document.querySelectorAll(".card .value");

  if (cards.length >= 1) {
    cards[0].textContent = rns.rns_using_stub ? "stub runtime" : "native runtime";
  }

  rows.Transport = [
    ["Field", "Value"],
    ["Controller", status.controller?.running ? "running" : "stopped"],
    ["Engine", engine.running ? "running" : "stopped"],
    ["RNS", rns.running ? "running" : "stopped"],
    ["RNS using stub", String(Boolean(rns.rns_using_stub))],
    ["LXMF using stub", String(Boolean(rns.lxmf_using_stub))],
    ["Active runtime", runtime.active || "-"],
    ["Runtime count", String(availableRuntimes.length)],
    ["Engine runtime name", engineRuntime.name || "-"],
    ["Engine runtime python", engineRuntime.python_path || "-"],
    ["Engine runtime source", engineRuntime.source_path || "-"],
    ["RNS version", rns.rns_version || "-"],
    ["LXMF version", rns.lxmf_version || "-"],
    ["RNS interfaces", String(rnsInterfaces.length)],
    ["Config dir", rns.config_dir || "-"],
    ["Web root", status.controller?.web_root || "-"],
  ];

  rows.Interfaces = [
    ["Name", "Type", "Online", "IN", "OUT", "Bind", "Target"],
    ...rnsInterfaces.map((iface) => [
      iface.name || "-",
      iface.type || "-",
      iface.online ? "yes" : "no",
      iface.in ? "yes" : "no",
      iface.out ? "yes" : "no",
      iface.bind_ip || iface.bind_port ? `${iface.bind_ip || "*"}:${iface.bind_port || "-"}` : "-",
      iface.target_host || iface.target_port ? `${iface.target_host || "-"}:${iface.target_port || "-"}` : "-",
    ]),
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

window.FriendlyNodeRefreshStatus = fetchStatus;

window.setInterval(() => {
  if (getActiveTab() !== "Interfaces" || interfaceStatusRefreshInFlight) {
    return;
  }

  if (typeof window.FriendlyNodeRefreshStatus !== "function") {
    return;
  }

  interfaceStatusRefreshInFlight = true;
  window.FriendlyNodeRefreshStatus()
    .catch((error) => {
      appendUiError(error);
    })
    .finally(() => {
      interfaceStatusRefreshInFlight = false;
    });
}, 5000);

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForFriendlyNodeAfterProcessRestart() {
  await sleep(1200);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch("/api/status", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
      });

      if (response.ok) {
        return;
      }
    } catch (error) {
      // Controller is restarting.
    }

    await sleep(500);
  }
}

async function restartReticulum() {
  const button = document.querySelector("#restart-reticulum");

  if (button !== null) {
    button.disabled = true;
    button.textContent = "Restarting Reticulum...";
  }

  setEngineRestartInFlight(true);

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

    const payload = await response.json();

    if (payload.status === "process_restarting") {
      await waitForFriendlyNodeAfterProcessRestart();
      window.location.reload();
      return;
    }

    currentStatus = payload;
    setEngineRestartInFlight(false);
    updateSummaryCards(currentStatus);

    const activeTab = getActiveTab();

    if (
      activeTab === "Client"
      || activeTab === "Interfaces"
      || activeTab === "Transport"
      || activeTab === "Logs"
      || activeTab === "Settings"
    ) {
      render(activeTab);
    }
  } catch (error) {
    setEngineRestartInFlight(false);
    appendUiError(error);
    render("Logs");
  } finally {
    if (!engineRestartInFlight && button !== null) {
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

    const payload = await response.json();

    if (payload.status === "process_restarting") {
      if (button !== null) {
        button.textContent = "Restarting process...";
      }

      await waitForFriendlyNodeAfterProcessRestart();
      window.location.reload();
      return;
    }

    currentStatus = payload;
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

async function installRuntimeReleaseFromUi() {
  const select = document.querySelector("#runtime-release-select");
  const button = document.querySelector("#install-runtime-release");

  if (select === null) {
    return;
  }

  if (button !== null) {
    button.disabled = true;
    button.textContent = "Installing...";
  }

  try {
    const response = await fetch("/api/runtime/install", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: select.value,
      }),
    });

    if (!response.ok) {
      throw new Error(`Runtime install failed: HTTP ${response.status}`);
    }

    const payload = await response.json();

    if (payload.status === "process_restarting") {
      if (button !== null) {
        button.textContent = "Restarting process...";
      }

      await waitForFriendlyNodeAfterProcessRestart();
      window.location.reload();
      return;
    }

    currentStatus = payload;
    updateSummaryCards(currentStatus);
    render("Settings");
  } catch (error) {
    appendUiError(error);
    render("Logs");
  } finally {
    if (button !== null) {
      button.disabled = false;
      button.textContent = "Install release";
    }
  }
}

async function installLxmfReleaseFromUi() {
  const select = document.querySelector("#lxmf-release-select");
  const button = document.querySelector("#install-lxmf-release");

  if (select === null) {
    return;
  }

  if (button !== null) {
    button.disabled = true;
    button.textContent = "Installing LXMF...";
  }

  lxmfReleaseInstallInFlight = true;

  try {
    const response = await fetch("/api/runtime/lxmf/install", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: select.value,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        payload.message
        || payload.error
        || `LXMF install failed: HTTP ${response.status}`,
      );
    }

    if (payload.status === "process_restarting") {
      if (button !== null) {
        button.textContent = "Restarting process...";
      }

      lxmfReleaseOverview = null;
      setEngineRestartInFlight(true);
      await waitForFriendlyNodeAfterProcessRestart();
      window.location.reload();
      return;
    }

    lxmfReleaseOverview = null;
    await fetchStatus();
    render("Settings");
  } catch (error) {
    lxmfReleaseInstallInFlight = false;
    setEngineRestartInFlight(false);
    appendUiError(error);
    render("Logs");
  } finally {
    if (!engineRestartInFlight && button !== null) {
      button.disabled = false;
      button.textContent = "Install LXMF release";
    }
  }
}

async function setRuntimeFeatureFromUi(runtimeName, featureName, enabled) {
  try {
    const response = await fetch("/api/runtime/feature", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runtime: runtimeName,
        feature: featureName,
        enabled,
      }),
    });

    if (!response.ok) {
      throw new Error(`Runtime feature update failed: HTTP ${response.status}`);
    }

    currentStatus = await response.json();
    updateSummaryCards(currentStatus);
    render("Settings");
  } catch (error) {
    appendUiError(error);
    render("Logs");
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

async function generateClientIdentityFromEditor() {
  if (clientEditorState === null) {
    return;
  }

  try {
    const saveResponse = await fetch("/api/clients", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(clientEditorState),
    });

    if (!saveResponse.ok) {
      throw new Error(`Client save before identity generation failed: HTTP ${saveResponse.status}`);
    }

    const savedClient = await saveResponse.json();
    const clientId = savedClient.id || clientEditorState.id || "";

    if (clientId === "") {
      throw new Error("Local identity id is empty after save");
    }

    const generateResponse = await fetch(
      `/api/clients/${encodeURIComponent(clientId)}/generate`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!generateResponse.ok) {
      const payload = await generateResponse.json().catch(() => ({}));
      throw new Error(
        payload.message
        || payload.error
        || `Identity generation failed: HTTP ${generateResponse.status}`
      );
    }

    clientEditorState = await generateResponse.json();
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

async function makeClientAnnounce(client) {
  const clientId = client?.id || "";

  if (clientId === "") {
    return;
  }

  clientAccountMenuState = null;
  try {
    const response = await fetch(
      `/api/clients/${encodeURIComponent(clientId)}/lxmf/announce`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload.message
        || payload.error
        || `LXMF announce failed: HTTP ${response.status}`
      );
    }

    await fetchStatus();
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
  title.textContent = "Local identity editor";
  dialog.appendChild(title);
  dialog.appendChild(
    renderClientEditorField("Display name", "display_name", "text")
  );
  dialog.appendChild(
    renderClientEditorField("Local identity id", "id", "text", true)
  );
  dialog.appendChild(
    renderClientEditorField("Identity hash", "identity_hash", "text", true)
  );
  dialog.appendChild(
    renderClientEditorField("LXMF destination hash", "lxmf_destination_hash", "text", true)
  );
  dialog.appendChild(
    renderClientEditorField("External config path", "config_path", "text")
  );

  const announceTitle = document.createElement("h3");
  announceTitle.textContent = "LXMF announce";
  dialog.appendChild(announceTitle);
  dialog.appendChild(
    renderClientEditorCheckbox("Auto announce", "lxmf_auto_announce")
  );
  dialog.appendChild(
    renderClientEditorField(
      "Announce interval (seconds)",
      "lxmf_announce_interval_seconds",
      "number"
    )
  );

  const actions = document.createElement("div");
  actions.className = "settings-row client-editor-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "Save";
  saveButton.onclick = saveClientFromEditor;
  actions.appendChild(saveButton);

  const generateButton = document.createElement("button");
  generateButton.type = "button";
  generateButton.textContent = "Generate identity";
  generateButton.title = "Save this local identity and generate or load its RNS key material";
  generateButton.onclick = generateClientIdentityFromEditor;
  actions.appendChild(generateButton);

  const worker = getClientLxmfWorker(clientEditorState?.id || "");
  const announceButton = document.createElement("button");
  announceButton.type = "button";
  announceButton.textContent = "Announce now";
  announceButton.title = Boolean(worker?.ready)
    ? "Send an LXMF delivery announce for this identity"
    : "Start this identity's LXMF worker before announcing";
  announceButton.disabled = !Boolean(worker?.ready);
  announceButton.onclick = () => makeClientAnnounce(clientEditorState);
  actions.appendChild(announceButton);

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

function renderClientEditorCheckbox(labelText, key) {
  const field = document.createElement("label");
  field.className = "rns-field";
  const label = document.createElement("span");
  label.textContent = labelText;
  field.appendChild(label);

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(clientEditorState?.[key]);
  input.onchange = () => {
    clientEditorState[key] = input.checked;
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

  fetchStatus()
    .then(() => {
      startClientUpdates();

      if (!Boolean(currentStatus?.config?.nomadnet_enabled)) {
        return;
      }

      return loadNomadNetBrowserStorage();
    })
    .catch((error) => {
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

  if (nomadnetBrowserSettingsModalOpen) {
    nomadnetBrowserSettingsModalOpen = false;
    render("NomadNet");
  }

  if (nomadnetBookmarkAddGroupState !== null) {
    nomadnetBookmarkAddGroupState = null;
    render("NomadNet");
  }

  if (nomadnetBookmarkPageModalState !== null) {
    nomadnetBookmarkPageModalState = null;
    render("NomadNet");
  }

  if (nomadnetBookmarkTreeModalState !== null) {
    nomadnetBookmarkTreeModalState = null;
    clearNomadNetBookmarkDragState();
    render("NomadNet");
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
