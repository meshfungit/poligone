(function () {
  let configState = null;
  let loading = false;
  let loadError = "";
  let addInterfaceType = "BackboneInterface";
  let addInterfaceOutgoing = true;
  let lastAddedInterfaceName = "";

  const PRESET_DEFAULTS = {
    AutoInterface: {
      mode: "",
      bitrate: "",
      announce_interval: "",
      outgoing: true,
    },
    BackboneInterface: {
      mode: "boundary",
      bitrate: 128000,
      announce_interval: 15,
      outgoing: true,
    },
    TCPClientInterface: {
      mode: "boundary",
      bitrate: 128000,
      announce_interval: 15,
      outgoing: true,
    },
    TCPServerInterface: {
      mode: "gateway",
      bitrate: 128000,
      announce_interval: 720,
      outgoing: true,
      listen_ip: "0.0.0.0",
      listen_port: 4242,
    },
    UDPInterface: {
      mode: "boundary",
      bitrate: 128000,
      announce_interval: 15,
      outgoing: true,
      listen_ip: "0.0.0.0",
    },
    I2PInterface: {
      mode: "boundary",
      bitrate: 128000,
      announce_interval: 15,
      outgoing: true,
      connectable: true,
    },
    PipeInterface: {
      mode: "",
      bitrate: "",
      announce_interval: "",
      outgoing: true,
    },
    CustomInterface: {
      mode: "",
      bitrate: "",
      announce_interval: "",
      outgoing: true,
    },
  };

  function render() {
    const block = document.createElement("section");
    block.className = "settings-block rns-config-editor";
    block.id = "rns-config-editor";

    const title = document.createElement("h2");
    title.textContent = "Reticulum config";
    block.appendChild(title);

    const hint = document.createElement("div");
    hint.className = "settings-hint";
    hint.textContent = "Visual editor for data/config/reticulum/config. Saving does not restart the engine automatically.";
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
    block.appendChild(renderReticulumSection());
    block.appendChild(renderInterfacesSection());
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
      rerenderSettings();
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
      rerenderSettings();
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
      rerenderSettings();
    } finally {
      const newButton = document.querySelector("#save-rns-config");

      if (newButton !== null) {
        newButton.disabled = false;
        newButton.textContent = "Save Reticulum config";
      }
    }
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

    const commonTitle = document.createElement("div");
    commonTitle.className = "rns-subtitle";
    commonTitle.textContent = "Common fields";
    card.appendChild(commonTitle);

    const commonFields = (configState.schema?.common_interface_fields || []).filter(
      (field) => field.key !== "enabled"
    );

    for (const field of commonFields) {
      card.appendChild(
        renderFieldControl({
          field,
          value: iface[field.key],
          onChange: (value) => {
            iface[field.key] = value;

            if (field.key === "type") {
              applyInterfaceTypeDefaults(iface);
              rerenderSettings();
            }
          },
        })
      );
    }

    const typeName = iface.type || "AutoInterface";
    const typeTitle = document.createElement("div");
    typeTitle.className = "rns-subtitle";
    typeTitle.textContent = `${typeName} fields`;
    card.appendChild(typeTitle);

    const typeFields = configState.schema?.interface_type_fields?.[typeName] || [];

    for (const field of typeFields) {
      card.appendChild(
        renderFieldControl({
          field,
          value: iface[field.key],
          onChange: (value) => {
            iface[field.key] = value;
          },
        })
      );
    }

    return card;
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
      rerenderSettings();
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
    rerenderSettings();

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
    rerenderSettings();
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

    const defaults = PRESET_DEFAULTS[iface.type] || {};

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

  function rerenderSettings() {
    const activeTab = document.querySelector("nav button.active")?.textContent || "";

    if (activeTab === "Settings" && typeof window.render === "function") {
      window.render("Settings");
    }
  }

  window.FriendlyNodeRnsConfigEditor = {
    render,
  };
})();
