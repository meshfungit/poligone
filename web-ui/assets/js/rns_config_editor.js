(function () {
  let configState = null;
  let loading = false;
  let loadError = "";

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

    const grid = document.createElement("div");
    grid.className = "rns-field-grid";

    const fields = configState.schema?.reticulum_fields || [];

    for (const field of fields) {
      grid.appendChild(
        renderFieldControl({
          field,
          value: configState.reticulum?.[field.key],
          onChange: (value) => {
            configState.reticulum[field.key] = value;
          },
        })
      );
    }

    section.appendChild(grid);
    return section;
  }

  function renderInterfacesSection() {
    const section = document.createElement("div");
    section.className = "rns-section";

    const header = document.createElement("div");
    header.className = "rns-section-header";

    const title = document.createElement("h3");
    title.textContent = "[interfaces]";
    header.appendChild(title);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.textContent = "Add interface";
    addButton.onclick = addInterface;
    header.appendChild(addButton);

    section.appendChild(header);

    const interfaces = Array.isArray(configState.interfaces) ? configState.interfaces : [];

    for (let index = 0; index < interfaces.length; index += 1) {
      section.appendChild(renderInterfaceCard(index, interfaces[index]));
    }

    return section;
  }

  function renderInterfaceCard(index, iface) {
    const card = document.createElement("div");
    card.className = "rns-interface-card";

    const header = document.createElement("div");
    header.className = "rns-interface-header";

    const title = document.createElement("h4");
    title.textContent = `[[${iface.name || "Unnamed Interface"}]]`;
    header.appendChild(title);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.onclick = () => removeInterface(index);
    header.appendChild(removeButton);

    card.appendChild(header);

    const commonTitle = document.createElement("div");
    commonTitle.className = "rns-subtitle";
    commonTitle.textContent = "Common fields";
    card.appendChild(commonTitle);

    const commonGrid = document.createElement("div");
    commonGrid.className = "rns-field-grid";

    const commonFields = configState.schema?.common_interface_fields || [];

    for (const field of commonFields) {
      commonGrid.appendChild(
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

    card.appendChild(commonGrid);

    const typeName = iface.type || "AutoInterface";
    const typeTitle = document.createElement("div");
    typeTitle.className = "rns-subtitle";
    typeTitle.textContent = `${typeName} fields`;
    card.appendChild(typeTitle);

    const typeGrid = document.createElement("div");
    typeGrid.className = "rns-field-grid";

    const typeFields = configState.schema?.interface_type_fields?.[typeName] || [];

    for (const field of typeFields) {
      typeGrid.appendChild(
        renderFieldControl({
          field,
          value: iface[field.key],
          onChange: (value) => {
            iface[field.key] = value;
          },
        })
      );
    }

    card.appendChild(typeGrid);
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
    const wrapper = document.createElement("label");
    wrapper.className = "rns-field";

    const label = document.createElement("span");
    label.textContent = field.label || field.key;
    wrapper.appendChild(label);

    const type = field.type || "text";

    if (type === "boolean") {
      const checkboxRow = document.createElement("div");
      checkboxRow.className = "rns-checkbox-row";

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(value);
      input.onchange = () => onChange(input.checked);

      checkboxRow.appendChild(input);
      wrapper.appendChild(checkboxRow);

      return wrapper;
    }

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

    const types = configState.schema?.supported_interface_types || ["AutoInterface"];
    const interfaceType = types.includes("AutoInterface") ? "AutoInterface" : types[0];
    const interfaceNumber = configState.interfaces.length + 1;

    const iface = {
      name: `${interfaceType} ${interfaceNumber}`,
      type: interfaceType,
      enabled: false,
    };

    applyInterfaceTypeDefaults(iface);
    configState.interfaces.push(iface);
    rerenderSettings();
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
      iface.name = `${iface.type || "Interface"} ${Date.now()}`;
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