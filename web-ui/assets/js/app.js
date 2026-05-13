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
let symbolPaletteOpen = false;
let messageEditorSelection = null;
let showMessageUnprintable = false;

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
    bubble.appendChild(renderMessageContent(message.content || ""));
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
      document.execCommand("insertLineBreak");
      messageDraft = serializeMessageEditor(input);
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

function renderMessageSymbolPalette(input) {
  const palette = document.createElement("div");
  palette.className = "message-symbol-palette";
  palette.onmousedown = (event) => {
    event.preventDefault();
  };
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
      item.textContent = symbolLabel;
      item.title = symbolTitle;

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

function insertMessageText(input, text) {
  input.focus();
  document.execCommand("insertText", false, text);
  messageDraft = serializeMessageEditor(input);
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
  restoreVisibleSelection(input, restoreSelection);
  resizeMessageInput(input);
}

function toggleHeadingLine(input, placeholder) {
  const selection = getEditorSelectionOffsets(input);
  const restoreSelection = selection === null ? null : { ...selection };
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
  restoreVisibleSelection(input, restoreSelection);
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
  const lineIndex = getEditorSelectedLineIndex(input, selection);
  let start = 0;

  for (let index = 0; index < lineIndex; index += 1) {
    const nextBreak = serialized.indexOf("\n", start);

    if (nextBreak === -1) {
      return {
        start: serialized.length,
        end: serialized.length,
      };
    }

    start = nextBreak + 1;
  }

  const endIndex = serialized.indexOf("\n", start);

  return {
    start,
    end: endIndex === -1 ? serialized.length : endIndex,
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
  const selection = getEditorSelectionOffsets(input);
  const value = getMessagePlainText(input);
  const start = selection === null ? value.length : selection.start;
  const end = selection === null ? start : selection.end;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before === "" || before.endsWith("\n") ? "" : "\n";
  const suffix = after === "" || after.startsWith("\n") ? "" : "\n";
  const text = `${prefix}${block}${suffix}`;
  messageDraft = `${before}${text}${after}`;
  renderMessageEditorContent(input, messageDraft);
  input.focus();
  resizeMessageInput(input);
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

  input.appendChild(renderMessageContent(source));
}

function serializeMessageEditor(input) {
  if (input.dataset.raw === "true") {
    return getMessagePlainText(input);
  }

  const content = input.querySelector(".micron-content");
  const root = content || input;
  const lines = [];
  const lineNodes = Array.from(root.querySelectorAll(".micron-line"));

  if (lineNodes.length === 0) {
    return getMessagePlainText(input);
  }

  for (const line of lineNodes) {
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
  const lines = Array.from(root.querySelectorAll(".micron-line"));

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
  const lines = Array.from(input.querySelectorAll(".micron-line"));

  if (lines.length === 0) {
    return null;
  }

  const start = getEditorLinePoint(lines, range.startContainer, range.startOffset);
  const end = getEditorLinePoint(lines, range.endContainer, range.endOffset);

  if (start === null || end === null) {
    return null;
  }

  return { start, end };
}

function getEditorLinePoint(lines, node, offset) {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.contains(node)) {
      return {
        lineIndex: index,
        offset: normalizeEditorLineOffset(line, getLineDomTextOffset(line, node, offset), index),
      };
    }
  }

  return null;
}

function setEditorLinePointSelection(input, lineIndex, lineOffset) {
  const lines = Array.from(input.querySelectorAll(".micron-line"));
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

function normalizeEditorLineOffset(line, offset, lineIndex) {
  const lineLength = getVisibleLineTextLength(line);

  if (offset <= 0 || lineLength === 0) {
    return 0;
  }

  return Math.max(0, Math.min(lineLength, offset - lineIndex));
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

function getPlainDomTextOffset(root, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function getLineDomTextOffset(line, node, offset) {
  let total = 0;
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);

  while (true) {
    const current = walker.nextNode();

    if (current === null) {
      break;
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

    total += current.nodeValue.length;
  }

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

function getStyleVisibleChars(chars) {
  return chars.filter((char) => !char.hidden && char.value !== "\n");
}

function rememberMessageEditorSelection(input) {
  messageEditorSelection = getEditorSelectionOffsets(input);
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

function restoreMessageEditorSelection(input) {
  if (messageEditorSelection === null) {
    return;
  }

  setEditorSelectionOffsets(input, messageEditorSelection.start, messageEditorSelection.end);
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
  const lines = Array.from(root.querySelectorAll(".micron-line"));

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

function resizeMessageInput(input) {
  const messageList = document.querySelector(".message-list");
  const listHeight = messageList instanceof HTMLElement ? messageList.clientHeight : 240;
  const maxHeight = Math.max(48, Math.floor(listHeight / 3));

  input.style.height = "auto";
  input.style.maxHeight = `${maxHeight}px`;
  input.style.height = `${Math.min(input.scrollHeight, maxHeight)}px`;
  input.style.overflowY = input.scrollHeight > maxHeight ? "auto" : "hidden";
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

  if (symbolPaletteOpen) {
    symbolPaletteOpen = false;
    render("Client");
  }
});

document.addEventListener("selectionchange", () => {
  const editor = document.querySelector(".message-rich-input");

  if (editor === null) {
    return;
  }

  const activeElement = document.activeElement;

  if (activeElement !== null && activeElement.closest(".message-symbol-palette") !== null) {
    return;
  }

  const selection = getEditorSelectionOffsets(editor);

  if (selection !== null) {
    messageEditorSelection = selection;
  }
});
window.render = render;
