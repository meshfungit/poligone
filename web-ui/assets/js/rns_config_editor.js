(function () {
  let configState = null;
  let loading = false;
  let loadError = "";
  let addInterfaceType = "BackboneInterface";
  let addInterfaceOutgoing = true;
  let lastAddedInterfaceName = "";
  let interfaceImportExportStatus = "";

  function render(options = {}) {
    const mode = options.mode || "full";
    const status = options.status || null;
    const block = document.createElement("section");
    block.className = "settings-block rns-config-editor";
    block.id = "rns-config-editor";

    const title = document.createElement("h2");
    if (mode === "interfaces") {
      title.textContent = "Interfaces";
    } else if (mode === "transport") {
      title.textContent = "Transport config";
    } else {
      title.textContent = "Reticulum config";
    }
    block.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "settings-hint";
    if (mode === "interfaces") {
      hint.textContent = "Editor for the [interfaces] section in data/config/reticulum/config. Saving does not restart the engine automatically.";
    } else if (mode === "transport") {
      hint.textContent = "Editor for the [reticulum] transport settings in data/config/reticulum/config. Saving does not restart the engine automatically.";
    } else if (mode === "settings") {
      hint.textContent = "Editor for the [reticulum] section in data/config/reticulum/config. Saving does not restart the engine automatically.";
    } else {
      hint.textContent = "Visual editor for data/config/reticulum/config. Saving does not restart the engine automatically.";
    }
    block.appendChild(hint);

    if (loading) {
      const status = document.createElement("div");
      status.className = "settings-hint";
      status.textContent = "Loading Reticulum config...";
      block.appendChild(status);
      return block;
    }

    if (loadError !== "") {
      const status = document.createElement("div");
      status.className = "settings-error";
      status.textContent = loadError;
      block.appendChild(status);
      return block;
    }

    if (configState === null) {
      loading = true;
      fetchRnsConfig();

      const status = document.createElement("div");
      status.className = "settings-hint";
      status.textContent = "Loading Reticulum config...";
      block.appendChild(status);
      return block;
    }

    block.appendChild(renderConfigPaths());

	if (mode === "interfaces") {
	  block.appendChild(renderInterfaceImportExportActions());
	}

	if (interfaceImportExportStatus !== "") {
	  const statusBox = document.createElement("div");
	  statusBox.className = interfaceImportExportStatus.startsWith("Error:")
		? "settings-error"
		: "settings-hint";
	  statusBox.textContent = interfaceImportExportStatus;
	  block.appendChild(statusBox);
	}

    if (mode === "interfaces") {
      block.appendChild(renderInterfaceAnnounceStatus(status));
    }

    if (mode !== "interfaces") {
      block.appendChild(renderReticulumSection());
    }

    if (mode !== "settings" && mode !== "transport") {
      block.appendChild(renderInterfacesSection());
    }

    block.appendChild(renderEditorActions());

    return block;
  }

  async function fetchRnsConfig() {
    try {
      const response = await fetch("/api/rns-config", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`RNS config request failed: HTTP ${response.status}`);
      }

      configState = await response.json();
      loadError = "";
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
    } finally {
      loading = false;
      rerenderActiveRnsEditor();
    }
  }

  async function saveRnsConfig() {
    if (configState === null) {
      return;
    }

    const button = document.querySelector("#save-rns-config");

    if (button !== null) {
      button.disabled = true;
      button.textContent = "Saving...";
    }

    try {
      const response = await fetch("/api/rns-config", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reticulum: configState.reticulum,
          interfaces: configState.interfaces,
        }),
      });

      if (!response.ok) {
        throw new Error(`RNS config save failed: HTTP ${response.status}`);
      }

      configState = await response.json();
      loadError = "";
      rerenderActiveRnsEditor();
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      rerenderActiveRnsEditor();
    } finally {
      const newButton = document.querySelector("#save-rns-config");

      if (newButton !== null) {
        newButton.disabled = false;
        newButton.textContent = "Save Reticulum config";
      }
    }
  }

function renderInterfaceImportExportActions() {
  const row = document.createElement("div");
  row.className = "settings-row rns-interface-import-export-actions";

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.textContent = "Import Interfaces";
  importButton.onclick = importInterfacesFromFile;
  row.appendChild(importButton);

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "Export Interfaces";
  exportButton.onclick = exportInterfacesToServerFile;
  row.appendChild(exportButton);

  return row;
}

async function exportInterfacesToServerFile() {
  interfaceImportExportStatus = "Exporting interfaces...";
  rerenderActiveRnsEditor();

  try {
    const response = await fetch("/api/rns-config/interfaces/export", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Interfaces export failed: HTTP ${response.status}`);
    }

    const result = await response.json();
    interfaceImportExportStatus = `Interfaces exported to ${result.relative_path || result.path || "data/import-export/interfaces-export.json"}`;
  } catch (error) {
    interfaceImportExportStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
  }

  rerenderActiveRnsEditor();
}

function importInterfacesFromFile() {
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".json,application/json";

  input.onchange = async () => {
    const file = input.files && input.files.length > 0 ? input.files[0] : null;

    if (file === null) {
      return;
    }

    interfaceImportExportStatus = `Importing ${file.name}...`;
    rerenderActiveRnsEditor();

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      const response = await fetch("/api/rns-config/interfaces/import", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Interfaces import failed: HTTP ${response.status}`);
      }

      const result = await response.json();

      if (!Array.isArray(result.interfaces)) {
        throw new Error("Interfaces import response does not contain interfaces list");
      }

      if (configState === null) {
        configState = {};
      }

      configState.interfaces = result.interfaces;
      interfaceImportExportStatus = result.message || "Interfaces imported into editor. Press Save interfaces to apply.";
    } catch (error) {
      interfaceImportExportStatus = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }

    rerenderActiveRnsEditor();
  };

  input.click();
}  

  function renderConfigPaths() {
    const box = document.createElement("div");
    box.className = "rns-config-paths";

    const configPath = document.createElement("div");
    configPath.textContent = `Config dir: ${configState.config_path || "-"}`;
    box.appendChild(configPath);

    const filePath = document.createElement("div");
    filePath.textContent = `Config file: ${configState.file_path || "-"}`;
    box.appendChild(filePath);

    return box;
  }

  function renderReticulumSection() {
    const section = document.createElement("div");
    section.className = "rns-section";

    const title = document.createElement("h3");
    title.textContent = "[reticulum]";
    section.appendChild(title);

    const fields = configState.schema?.reticulum_fields || [];

    for (const field of fields) {
      section.appendChild(
        renderFieldControl({
          field,
          value: configState.reticulum?.[field.key],
          onChange: (value) => {
            configState.reticulum[field.key] = value;
          },
        })
      );
    }

    return section;
  }

  function renderInterfacesSection() {
    const section = document.createElement("div");
    section.className = "rns-section";

    const title = document.createElement("h3");
    title.textContent = "[interfaces]";
    section.appendChild(title);

    section.appendChild(renderAddInterfacePanel());

    const interfaces = Array.isArray(configState.interfaces) ? configState.interfaces : [];

    for (let index = 0; index < interfaces.length; index += 1) {
      section.appendChild(renderInterfaceCard(index, interfaces[index]));
    }

    return section;
  }

  function renderInterfaceAnnounceStatus(status) {
    const panel = document.createElement("div");
    panel.className = "rns-announce-panel";

    const actions = document.createElement("div");
    actions.className = "settings-row rns-announce-actions";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Make Annonce";
    button.onclick = () => makeReticulumAnnounce("transport");
    actions.appendChild(button);
    panel.appendChild(actions);

    const table = document.createElement("table");
    table.className = "rns-announce-table";

    const thead = document.createElement("thead");
    const header = document.createElement("tr");

    for (const label of ["Interface", "Status", "Last announce", "Next auto"]) {
      const th = document.createElement("th");
      th.textContent = label;
      header.appendChild(th);
    }

    thead.appendChild(header);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const announce = status?.engine?.rns?.announce || {};
    const rows = Array.isArray(announce.interfaces) ? announce.interfaces : [];

    if (rows.length === 0) {
      const empty = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "No enabled live interfaces are available for announce status.";
      empty.appendChild(cell);
      tbody.appendChild(empty);
    }

    for (const row of rows) {
      const tr = document.createElement("tr");

      const name = document.createElement("td");
      name.textContent = row.name || "-";
      tr.appendChild(name);

      const state = document.createElement("td");
      state.textContent = row.status || (row.online ? "Up" : "Down");
      tr.appendChild(state);

      const last = document.createElement("td");
      last.appendChild(renderAgeCell(row.last_announce_age, "never"));
      tr.appendChild(last);

      const next = document.createElement("td");
      next.appendChild(renderCountdownCell(row.next_announce_in));
      tr.appendChild(next);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    panel.appendChild(table);
    return panel;
  }

  function renderAddInterfacePanel() {
    const panel = document.createElement("div");
    panel.className = "rns-add-interface-panel";

    const typeField = document.createElement("label");
    typeField.className = "rns-field";

    const typeLabel = document.createElement("span");
    typeLabel.textContent = "New interface type";
    typeField.appendChild(typeLabel);

    const select = document.createElement("select");
    const types = configState.schema?.supported_interface_types || ["BackboneInterface"];

    for (const type of types) {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;

      if (type === addInterfaceType) {
        option.selected = true;
      }

      select.appendChild(option);
    }

    select.onchange = () => {
      addInterfaceType = select.value;
    };

    typeField.appendChild(select);
    panel.appendChild(typeField);

    const outgoingField = document.createElement("label");
    outgoingField.className = "rns-boolean-line";

    const outgoingLabel = document.createElement("span");
    outgoingLabel.textContent = "Outgoing";
    outgoingField.appendChild(outgoingLabel);

    const outgoingInput = document.createElement("input");
    outgoingInput.type = "checkbox";
    outgoingInput.checked = addInterfaceOutgoing;
    outgoingInput.onchange = () => {
      addInterfaceOutgoing = outgoingInput.checked;
    };

    outgoingField.appendChild(outgoingInput);
    panel.appendChild(outgoingField);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "Add interface";
    addButton.onclick = addInterface;
    panel.appendChild(addButton);

    return panel;
  }

  function renderInterfaceCard(index, iface) {
    const card = document.createElement("div");
    card.className = "rns-interface-card";

    if (iface.name === lastAddedInterfaceName) {
      card.id = "last-added-interface";
    }

    const header = document.createElement("div");
    header.className = "rns-interface-header";

    const title = document.createElement("h4");
    title.textContent = `[[${iface.name || "Unnamed Interface"}]]`;
    header.appendChild(title);

    card.appendChild(header);

    const enabledField = findField(configState.schema?.common_interface_fields || [], "enabled");

    if (enabledField !== null) {
      card.appendChild(
        renderFieldControl({
          field: enabledField,
          value: iface.enabled,
          onChange: (value) => {
            iface.enabled = value;
          },
        })
      );
    }

    const removeRow = document.createElement("div");
    removeRow.className = "rns-remove-row";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => removeInterface(index);

    removeRow.appendChild(removeButton);
    card.appendChild(removeRow);

    const typeName = iface.type || "AutoInterface";
    const fieldsTitle = document.createElement("div");
    fieldsTitle.className = "rns-subtitle";
    fieldsTitle.textContent = "Interface fields";
    card.appendChild(fieldsTitle);

    const fields = orderedInterfaceFields(typeName);

    for (const field of fields) {
      card.appendChild(renderInterfaceField(iface, field));
    }

    return card;
  }

  function orderedInterfaceFields(typeName) {
    const commonFields = (configState.schema?.common_interface_fields || []).filter(
      (field) => field.key !== "enabled" && field.key !== "name"
    );
    const typeFields = configState.schema?.interface_type_fields?.[typeName] || [];
    const allFields = [...commonFields, ...typeFields];
    const byKey = new Map();

    for (const field of allFields) {
      byKey.set(field.key, field);
    }

    const priority = [
      "type",
      "target_host",
      "target_port",
      "listen_ip",
      "listen_port",
      "mode",
      "outgoing",
      "bitrate",
      "announce_interval",
      "discoverable",
      "network_name",
    ];
    const result = [];

    for (const key of priority) {
      if (byKey.has(key)) {
        result.push(byKey.get(key));
        byKey.delete(key);
      }
    }

    for (const field of allFields) {
      if (byKey.has(field.key)) {
        result.push(field);
        byKey.delete(field.key);
      }
    }

    return result;
  }

  function renderInterfaceField(iface, field) {
    return renderFieldControl({
      field,
      value: iface[field.key],
      onChange: (value) => {
        iface[field.key] = value;

        if (field.key === "type") {
          applyInterfaceTypeDefaults(iface);
          rerenderActiveRnsEditor();
        }
      },
    });
  }

  function renderEditorActions() {
    const row = document.createElement("div");
    row.className = "settings-row rns-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.id = "save-rns-config";
    saveButton.textContent = "Save Reticulum config";
    saveButton.onclick = saveRnsConfig;
    row.appendChild(saveButton);

    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = "Reload from disk";
    reloadButton.onclick = () => {
      configState = null;
      loadError = "";
      rerenderActiveRnsEditor();
    };
    row.appendChild(reloadButton);

    return row;
  }

  function renderFieldControl({ field, value, onChange }) {
    const type = field.type || "text";

    if (type === "boolean") {
      const wrapper = document.createElement("label");
      wrapper.className = "rns-boolean-line";

      const label = document.createElement("span");
      label.textContent = field.label || field.key;
      wrapper.appendChild(label);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(value);
      input.onchange = () => onChange(input.checked);

      wrapper.appendChild(input);
      return wrapper;
    }

    const wrapper = document.createElement("label");
    wrapper.className = "rns-field";

    const label = document.createElement("span");
    label.textContent = field.label || field.key;
    wrapper.appendChild(label);

    if (type === "select") {
      const select = document.createElement("select");

      const choices = Array.isArray(field.choices) ? field.choices : [];

      for (const choice of choices) {
        const option = document.createElement("option");
        option.value = choice;
        option.textContent = choice === "" ? "-" : choice;

        if (String(value || "") === String(choice)) {
          option.selected = true;
        }

        select.appendChild(option);
      }

      select.onchange = () => onChange(select.value);
      wrapper.appendChild(select);

      return wrapper;
    }

    const input = document.createElement("input");
    input.type = type === "integer" ? "number" : "text";
    input.value = value === undefined || value === null ? "" : String(value);

    input.oninput = () => {
      if (type === "integer") {
        onChange(input.value === "" ? "" : Number(input.value));
      } else {
        onChange(input.value);
      }
    };

    wrapper.appendChild(input);
    return wrapper;
  }

  function renderAgeCell(age, emptyText) {
    const span = document.createElement("span");
    span.className = "rns-announce-age";
    span.textContent = formatAge(age, emptyText);
    return span;
  }

  function renderCountdownCell(remaining) {
    const span = document.createElement("span");
    span.className = "rns-announce-countdown";
    span.textContent = formatCountdown(remaining);
    return span;
  }

  function formatAge(age, emptyText) {
    if (age === null || age === undefined || age === "") {
      return emptyText;
    }

    const value = Number(age);

    if (!Number.isFinite(value) || value < 0) {
      return emptyText;
    }

    return `${formatDuration(value)} ago`;
  }

  function formatCountdown(remaining) {
    if (remaining === null || remaining === undefined || remaining === "") {
      return "-";
    }

    const value = Number(remaining);

    if (!Number.isFinite(value) || value < 0) {
      return "-";
    }

    return value <= 0 ? "ready" : formatDuration(value);
  }

  function formatDuration(seconds) {
    const total = Math.max(Math.floor(Number(seconds) || 0), 0);

    if (total < 60) {
      return `${total}s`;
    }

    const minutes = Math.floor(total / 60);
    const rest = total % 60;

    if (minutes < 60) {
      return `${minutes}m ${rest}s`;
    }

    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }

  async function makeReticulumAnnounce(target) {
    const button = document.querySelector(".rns-announce-actions button");

    if (button !== null) {
      button.disabled = true;
      button.textContent = "Announcing...";
    }

    try {
      const response = await fetch("/api/reticulum/announce", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ target }),
      });

      if (!response.ok) {
        throw new Error(`Announce request failed: HTTP ${response.status}`);
      }

      if (typeof window.FriendlyNodeRefreshStatus === "function") {
        await window.FriendlyNodeRefreshStatus();
      } else {
        rerenderActiveRnsEditor();
      }
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      rerenderActiveRnsEditor();
    } finally {
      const newButton = document.querySelector(".rns-announce-actions button");

      if (newButton !== null) {
        newButton.disabled = false;
        newButton.textContent = "Make Annonce";
      }
    }
  }

  function refreshAnnounceTimers() {
    if (typeof window.FriendlyNodeRefreshStatus === "function") {
      window.FriendlyNodeRefreshStatus();
    }
  }

  function addInterface() {
    if (configState === null) {
      return;
    }

    if (!Array.isArray(configState.interfaces)) {
      configState.interfaces = [];
    }

    const interfaceType = addInterfaceType || "BackboneInterface";
    const name = buildNewInterfaceName(interfaceType, addInterfaceOutgoing);

    const iface = {
      name,
      type: interfaceType,
      enabled: false,
      outgoing: addInterfaceOutgoing,
    };

    applyInterfaceTypeDefaults(iface);
    configState.interfaces.push(iface);
    lastAddedInterfaceName = name;
    rerenderActiveRnsEditor();

    window.setTimeout(() => {
      const element = document.querySelector("#last-added-interface");

      if (element !== null) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 0);
  }

  function removeInterface(index) {
    if (configState === null || !Array.isArray(configState.interfaces)) {
      return;
    }

    configState.interfaces.splice(index, 1);
    rerenderActiveRnsEditor();
  }

  function applyInterfaceTypeDefaults(iface) {
    if (iface.name === undefined || iface.name === "") {
      iface.name = buildNewInterfaceName(iface.type || "Interface", Boolean(iface.outgoing));
    }

    if (iface.enabled === undefined) {
      iface.enabled = false;
    }

    const commonFields = configState.schema?.common_interface_fields || [];
    const typeFields = configState.schema?.interface_type_fields?.[iface.type] || [];

    for (const field of [...commonFields, ...typeFields]) {
      if (iface[field.key] !== undefined) {
        continue;
      }

      if (field.type === "boolean") {
        iface[field.key] = false;
      } else {
        iface[field.key] = "";
      }
    }

    const presets = configState.schema?.interface_presets || {};
    const defaults = presets[iface.type] || {};

    for (const [key, value] of Object.entries(defaults)) {
      iface[key] = value;
    }
  }

  function buildNewInterfaceName(interfaceType, outgoing) {
    const direction = outgoing ? "Outgoing" : "Incoming";
    const baseName = `${direction}${interfaceType}New`;
    const interfaces = Array.isArray(configState?.interfaces) ? configState.interfaces : [];

    if (!interfaces.some((iface) => iface.name === baseName)) {
      return baseName;
    }

    let index = 2;

    while (interfaces.some((iface) => iface.name === `${baseName}${index}`)) {
      index += 1;
    }

    return `${baseName}${index}`;
  }

  function findField(fields, key) {
    for (const field of fields) {
      if (field.key === key) {
        return field;
      }
    }

    return null;
  }

  function rerenderActiveRnsEditor() {
    const activeTab = document.querySelector("nav button.active")?.textContent || "";

    if ((activeTab === "Settings" || activeTab === "Interfaces" || activeTab === "Transport") && typeof window.render === "function") {
      window.render(activeTab);
    }
  }

  window.FriendlyNodeRnsConfigEditor = {
    render,
    refreshAnnounceTimers,
  };
})();
