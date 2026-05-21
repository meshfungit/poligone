(function () {
  const MICRON_DEFAULT_FIELD_WIDTH = 24;
  const MICRON_MAX_FIELD_WIDTH = 256;
  const MICRON_DIVIDER_REPEAT = 512;

  function render(source, options = {}) {
    const selection = normalizeSelection(options.selectionStart, options.selectionEnd);
    const root = document.createElement("div");
    root.className = "micron-content";
    root.dataset.symbolStyle = normalizeSymbolStyle(options.symbolStyle);

    const normalizedSource = String(source).replace(/\r\n/g, "\n");
    const lines = normalizedSource.split("\n");
    const inlineState = createInlineState();
    const renderState = {
      literal: false,
      sectionDepth: 0,
      alignment: "a",
      defaultAlignment: "a",
      pageHeaders: {},
      radioPrefix: createRadioPrefix(),
    };

    let rawOffset = 0;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!renderState.literal && trimmed.startsWith("#!")) {
        parsePageHeader(root, renderState, trimmed);
        rawOffset += rawLine.length + 1;
        continue;
      }

      if (!renderState.literal && trimmed.startsWith("#")) {
        rawOffset += rawLine.length + 1;
        continue;
      }

      if (!renderState.literal && trimmed === "<") {
        renderState.sectionDepth = 0;
        rawOffset += rawLine.length + 1;
        continue;
      }

      if (!renderState.literal && isDividerLine(trimmed)) {
        root.appendChild(renderDividerElement(trimmed, renderState.sectionDepth, renderState.alignment, inlineState));
        rawOffset += rawLine.length + 1;
        continue;
      }

      if (renderState.literal) {
        const literalExit = parseLiteralExitLine(rawLine, renderState.sectionDepth, renderState.alignment);

        if (literalExit !== null) {
          renderState.literal = false;
          const line = document.createElement("div");
          line.className = literalExit.className;
          line.dataset.depth = String(literalExit.depth);
          appendInline(line, literalExit.text, rawOffset + literalExit.offset, selection, inlineState, options, renderState);

          if (line.childNodes.length > 0) {
            root.appendChild(line);
          }

          rawOffset += rawLine.length + 1;
          continue;
        }

        const line = document.createElement("div");
        const literalClasses = ["micron-line", "micron-literal"];
        addAlignmentClassName(literalClasses, renderState.alignment);
        addDepthClassName(literalClasses, renderState.sectionDepth);
        line.className = literalClasses.join(" ");
        line.dataset.depth = String(renderState.sectionDepth);
        appendLiteral(line, rawLine, rawOffset, selection, options, inlineState);
        root.appendChild(line);
        rawOffset += rawLine.length + 1;
        continue;
      }

      const parsed = parseLinePrefix(rawLine, renderState.sectionDepth, renderState.alignment);
      renderState.alignment = parsed.alignment;

      const parsedTrimmed = parsed.text.trim();

      if (isDividerLine(parsedTrimmed)) {
        const divider = renderDividerElement(parsedTrimmed, parsed.depth, parsed.alignment, inlineState);
        copyAlignmentClasses(parsed.className, divider);
        root.appendChild(divider);
        rawOffset += rawLine.length + 1;
        continue;
      }

      const partial = parseMicronPartialFromLine(parsedTrimmed);
      if (partial !== null) {
        const line = document.createElement("div");
        line.className = parsed.className;
        line.dataset.depth = String(parsed.depth);
        line.appendChild(partial.element);
        root.appendChild(line);
        rawOffset += rawLine.length + 1;
        continue;
      }

      const line = document.createElement("div");
      line.className = parsed.className;
      line.dataset.depth = String(parsed.depth);
      appendInline(line, parsed.text, rawOffset + parsed.offset, selection, inlineState, options, renderState);

      if (parsed.nextSectionDepth !== null) {
        renderState.sectionDepth = parsed.nextSectionDepth;
      }

      if (line.childNodes.length > 0 || rawLine === "") {
        root.appendChild(line);
      }

      rawOffset += rawLine.length + 1;
    }

    return root;
  }

  function parsePageHeader(root, renderState, line) {
    const body = line.slice(2).trim();
    const equals = body.indexOf("=");

    if (equals <= 0) {
      return;
    }

    const key = body.slice(0, equals).trim();
    const value = body.slice(equals + 1).trim();

    if (key === "") {
      return;
    }

    renderState.pageHeaders[key] = value;
    root.dataset[`header${key.charAt(0).toUpperCase()}${key.slice(1)}`] = value;
  }

  function parseLinePrefix(line, currentDepth, currentAlignment = "a") {
    let text = line;
    let offset = 0;
    let depth = currentDepth;
    let nextSectionDepth = null;
    let alignment = normalizeAlignment(currentAlignment);
    const classes = ["micron-line"];
    const alignmentPrefix = text.match(/^`([clra])\s*/);
    if (alignmentPrefix) {
      alignment = normalizeAlignment(alignmentPrefix[1]);
      text = text.slice(alignmentPrefix[0].length);
      offset += alignmentPrefix[0].length;
    }

    const section = text.match(/^(>+)\s*(.*)$/);
    if (section) {
      const level = Math.min(section[1].length, 6);
      classes.push("micron-heading", `micron-heading-${level}`);
      depth = level;
      nextSectionDepth = level;
      text = section[2];
      offset += section[0].length - section[2].length;
    }

    addAlignmentClassName(classes, alignment);
    addDepthClassName(classes, depth);

    return {
      className: classes.join(" "),
      text,
      offset,
      depth,
      alignment,
      nextSectionDepth,
    };
  }

  function parseLiteralExitLine(line, currentDepth, currentAlignment = "a") {
    if (!line.startsWith("`=")) {
      return null;
    }

    let text = line.slice(2);
    let offset = 2;
    let alignment = normalizeAlignment(currentAlignment);
    const classes = ["micron-line"];

    const alignmentPrefix = text.match(/^`([clra])\s*/);
    if (alignmentPrefix) {
      alignment = normalizeAlignment(alignmentPrefix[1]);
      text = text.slice(alignmentPrefix[0].length);
      offset += alignmentPrefix[0].length;
    }

    addAlignmentClassName(classes, alignment);
    addDepthClassName(classes, currentDepth);

    return {
      className: classes.join(" "),
      text,
      offset,
      depth: currentDepth,
      alignment,
    };
  }

  function normalizeAlignment(value) {
    return ["c", "l", "r", "a"].includes(value) ? value : "a";
  }

  function addAlignmentClass(element, alignment) {
    element.classList.remove("micron-align-c", "micron-align-l", "micron-align-r", "micron-align-a");
    element.classList.add(`micron-align-${normalizeAlignment(alignment)}`);
  }

  function addAlignmentClassName(classes, alignment) {
    classes.push(`micron-align-${normalizeAlignment(alignment)}`);
  }

  function addDepthClass(element, depth) {
    if (depth > 0) {
      element.classList.add(`micron-depth-${Math.min(depth, 6)}`);
    }
  }

  function addDepthClassName(classes, depth) {
    if (depth > 0) {
      classes.push(`micron-depth-${Math.min(depth, 6)}`);
    }
  }

  function isDividerLine(line) {
    return line === "-" || (line.length === 2 && line[0] === "-");
  }

  function renderDividerText(line) {
    if (line === "-") {
      return "";
    }

    return line[1].repeat(MICRON_DIVIDER_REPEAT);
  }

  function renderDividerElement(line, depth, alignment = "a", state = createInlineState()) {
    const divider = document.createElement("div");
    divider.className = "micron-divider";
    divider.dataset.micronSource = line;
    divider.dataset.depth = String(depth);
    addAlignmentClass(divider, alignment);
    addDepthClass(divider, depth);
    applyInlineState(divider, state);

    const dividerText = renderDividerText(line);
    if (dividerText !== "") {
      divider.dataset.micronDividerChar = line[1];
      divider.textContent = dividerText;
    }

    return divider;
  }

  function copyAlignmentClasses(className, element) {
    for (const name of String(className || "").split(/\s+/)) {
      if (name.startsWith("micron-align-")) {
        element.classList.add(name);
      }
    }
  }

  function appendLiteral(parent, text, rawStart, selection, options, state = createInlineState()) {
    let buffer = "";
    let selected = false;
    const cellMode = shouldRenderTextAsCells(text);

    if (cellMode && parent instanceof HTMLElement) {
      parent.classList.add("micron-cell-line");
    }

    function flush() {
      if (buffer === "") {
        return;
      }

      const span = document.createElement("span");
      appendRenderedText(span, buffer, {
        ...options,
        micronCellMode: cellMode,
      });
      applyInlineState(span, state);

      if (selected) {
        span.classList.add("micron-selected");
      }

      parent.appendChild(span);
      buffer = "";
    }

    for (let index = 0; index < text.length; index += 1) {
      const nextSelected = isRawSelected(rawStart + index, rawStart + index + 1, selection);

      if (buffer !== "" && selected !== nextSelected) {
        flush();
      }

      selected = nextSelected;
      buffer += text[index];
    }

    flush();
  }

  function createInlineState() {
    return {
      bold: false,
      italic: false,
      underline: false,
      foreground: "",
      background: "",
    };
  }

  function appendInline(parent, text, rawStart, selection, state = createInlineState(), options = {}, renderState = {}) {
    let index = 0;
    let buffer = "";
    let bufferSelected = false;
    const cellMode = shouldRenderTextAsCells(text);

    if (cellMode && parent instanceof HTMLElement) {
      parent.classList.add("micron-cell-line");
    }

    function flush() {
      if (buffer === "") {
        return;
      }

      const span = document.createElement("span");
      appendRenderedText(span, buffer, {
        ...options,
        micronCellMode: cellMode,
      });
      applyInlineState(span, state);

      if (bufferSelected) {
        span.classList.add("micron-selected");
      }

      parent.appendChild(span);
      buffer = "";
    }

    function appendVisible(value, start, end) {
      const selected = isRawSelected(rawStart + start, rawStart + end, selection);

      if (buffer !== "" && bufferSelected !== selected) {
        flush();
      }

      bufferSelected = selected;
      buffer += value;
    }

    while (index < text.length) {
      const char = text[index];

      if (char === "\\" && index + 1 < text.length) {
        appendVisible(text[index + 1], index, index + 2);
        index += 2;
        continue;
      }

      if (char !== "`") {
        appendVisible(char, index, index + 1);
        index += 1;
        continue;
      }

      if (index + 1 >= text.length) {
        flush();
        index += 1;
        continue;
      }

      const command = text[index + 1];

      if (command === "[" || command === "<" || command === "{") {
        const parsed = command === "["
          ? parseMicronLink(text, index)
          : command === "<"
            ? parseMicronField(text, index, renderState)
            : parseMicronPartial(text, index);

        if (parsed !== null) {
          flush();
          applyInlineState(parsed.element, state);

          if (isRawSelected(rawStart + index, rawStart + parsed.nextIndex, selection)) {
            parsed.element.classList.add("micron-selected");
          }

          parent.appendChild(parsed.element);
          index = parsed.nextIndex;
          continue;
        }
      }

      if (["c", "l", "r", "a"].includes(command)) {
        flush();
        applyInlineAlignment(parent, command, renderState);
        index += 2;
        continue;
      }

      if (command === "=") {
        flush();

        if (renderState && typeof renderState === "object") {
          renderState.literal = !renderState.literal;

          if (renderState.literal) {
            parent.classList.add("micron-literal");
            const rest = text.slice(index + 2);

            if (rest !== "") {
              appendLiteral(parent, rest, rawStart + index + 2, selection, options, state);
            }

            index = text.length;
            continue;
          }
        }

        index += 2;
        continue;
      }

      if (command === "`") {
        flush();
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.foreground = "";
        state.background = "";
        if (renderState && typeof renderState === "object") {
          renderState.alignment = normalizeAlignment(renderState.defaultAlignment);
          addAlignmentClass(parent, renderState.alignment);
        }
        index += 2;
        continue;
      }

      if (command === "!") {
        flush();
        state.bold = !state.bold;
        index += 2;
        continue;
      }

      if (command === "*") {
        flush();
        state.italic = !state.italic;
        index += 2;
        continue;
      }

      if (command === "_") {
        flush();
        state.underline = !state.underline;
        index += 2;
        continue;
      }

      if (command === "f") {
        flush();
        state.foreground = "";
        index += 2;
        continue;
      }

      if (command === "b") {
        flush();
        state.background = "";
        index += 2;
        continue;
      }

      if (command === "F" || command === "B") {
        const color = readColor(text, index + 2);

        if (color.hex !== "") {
          flush();

          if (command === "F") {
            state.foreground = color.hex;
          } else {
            state.background = color.hex;
          }

          index = color.nextIndex;
          continue;
        }
      }

      flush();
      index += 1;
      continue;
    }

    flush();
  }

  function applyInlineAlignment(element, command, renderState = null) {
    const alignment = normalizeAlignment(command);
    addAlignmentClass(element, alignment);

    if (renderState && typeof renderState === "object") {
      renderState.alignment = alignment;
    }
  }

  function applyInlineState(element, state) {
    if (state.bold) {
      element.classList.add("micron-bold");
    }

    if (state.italic) {
      element.classList.add("micron-italic");
    }

    if (state.underline) {
      element.classList.add("micron-underline");
    }

    if (state.foreground !== "") {
      element.style.color = state.foreground;
    }

    if (state.background !== "") {
      element.style.backgroundColor = state.background;
    }
  }

  function parseMicronLink(text, startIndex) {
    const endIndex = findUnescaped(text, "]", startIndex + 2);

    if (endIndex === -1) {
      return null;
    }

    const body = text.slice(startIndex + 2, endIndex);
    const parts = splitMicronParts(body, "`");
    const target = parts.length >= 2 ? parts[1] : parts[0];
    const label = parts.length >= 2 ? parts[0] : target;
    const fields = parts.length >= 3 ? parts.slice(2).join("`") : "";
    const request = fields !== "";
    const element = document.createElement(request ? "button" : "a");

    element.className = request ? "micron-link micron-request-link" : "micron-link";

    if (request) {
      element.type = "button";
    } else {
      element.href = "#";
    }

    element.dataset.micronTarget = target;
    element.dataset.micronLabel = label;
    element.dataset.micronFields = fields;
    element.dataset.micronRequest = request ? "true" : "false";
    element.appendChild(document.createTextNode(label || target || "link"));

    element.onclick = (event) => {
      event.preventDefault();
      console.debug("Micron link", {
        label,
        target,
        fields,
        request,
      });
    };

    return {
      element,
      nextIndex: endIndex + 1,
    };
  }

  function parseMicronPartialFromLine(line) {
    if (!line.startsWith("`{")) {
      return null;
    }

    const parsed = parseMicronPartial(line, 0);

    if (parsed === null || parsed.nextIndex !== line.length) {
      return null;
    }

    return parsed;
  }

  function parseMicronPartial(text, startIndex) {
    const endIndex = findUnescaped(text, "}", startIndex + 2);

    if (endIndex === -1) {
      return null;
    }

    const body = text.slice(startIndex + 2, endIndex);
    const parts = splitMicronParts(body, "`");
    const target = parts[0] || "";
    const refresh = parts.length >= 2 ? parts[1] : "";
    const fields = parts.length >= 3 ? parts.slice(2).join("`") : "";

    if (target === "") {
      return null;
    }

    const element = document.createElement("span");
    element.className = "micron-partial";
    element.dataset.micronTarget = target;
    element.dataset.micronRefresh = refresh;
    element.dataset.micronFields = fields;
    element.title = refresh === "" ? `Partial: ${target}` : `Partial: ${target}, refresh ${refresh}s`;

    const marker = document.createElement("span");
    marker.className = "micron-partial-marker";
    marker.textContent = "⧖";
    element.appendChild(marker);

    const label = document.createElement("span");
    label.className = "micron-partial-label";
    label.textContent = target;
    element.appendChild(label);

    element.onclick = (event) => {
      event.preventDefault();
      console.debug("Micron partial", { target, refresh, fields });
    };

    return { element, nextIndex: endIndex + 1 };
  }

  function parseMicronField(text, startIndex, renderState) {
    const endIndex = findUnescaped(text, ">", startIndex + 2);

    if (endIndex === -1) {
      return null;
    }

    const body = text.slice(startIndex + 2, endIndex);
    const [spec, label = ""] = splitMicronParts(body, "`", 2);

    if (spec.startsWith("?")) {
      return {
        element: createMicronChoice("checkbox", spec.slice(1), label),
        nextIndex: endIndex + 1,
      };
    }

    if (spec.startsWith("^")) {
      return {
        element: createMicronChoice("radio", spec.slice(1), label, renderState),
        nextIndex: endIndex + 1,
      };
    }

    return {
      element: createMicronTextField(spec, label),
      nextIndex: endIndex + 1,
    };
  }

  function createMicronTextField(spec, value) {
    let body = spec;
    let masked = false;
    let width = MICRON_DEFAULT_FIELD_WIDTH;

    if (body.startsWith("!")) {
      masked = true;
      body = body.slice(1);
    }

    const widthMatch = body.match(/^(\d+)\|(.*)$/);
    if (widthMatch !== null) {
      width = Math.max(1, Math.min(MICRON_MAX_FIELD_WIDTH, Number(widthMatch[1]) || MICRON_DEFAULT_FIELD_WIDTH));
      body = widthMatch[2];
    }

    const name = body.trim();
    const input = document.createElement("input");
    input.className = "micron-field micron-text-field";
    input.type = masked ? "password" : "text";
    input.name = name;
    input.value = value;
    input.size = width;
    input.dataset.micronFieldType = masked ? "password" : "text";
    input.dataset.micronName = name;
    input.dataset.micronWidth = String(width);
    input.onchange = () => {
      console.debug("Micron field", {
        name,
        value: input.value,
        type: input.dataset.micronFieldType,
      });
    };
    return input;
  }

  function createMicronChoice(kind, spec, label, renderState = {}) {
    const parts = spec.split("|");
    const cleanParts = parts[0] === "" ? parts.slice(1) : parts;
    const name = cleanParts[0] || "";
    const value = cleanParts[1] || "";
    const checked = cleanParts.includes("*");
    const wrapper = document.createElement("label");
    wrapper.className = `micron-choice micron-${kind}`;

    const input = document.createElement("input");
    input.type = kind;
    input.value = value;
    input.checked = checked;
    input.dataset.micronName = name;
    input.dataset.micronValue = value;
    input.dataset.micronFieldType = kind;
    applyChoiceAccentColor(input, value);

    if (kind === "radio") {
      input.name = `${renderState.radioPrefix || "micron"}-${name}`;
    } else {
      input.name = name;
    }

    input.onchange = () => {
      console.debug("Micron choice", {
        type: kind,
        name,
        value,
        checked: input.checked,
      });
    };

    wrapper.appendChild(input);

    if (label !== "") {
      const text = document.createElement("span");
      text.className = "micron-choice-label";
      text.textContent = label;
      wrapper.appendChild(text);
    }

    return wrapper;
  }

  function applyChoiceAccentColor(input, value) {
    const color = String(value || "").trim();

    if (color === "") {
      return;
    }

    const isHex = /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(color);
    const cssColor = isHex && !color.startsWith("#") ? `#${color}` : color;

    if (typeof CSS !== "undefined" && typeof CSS.supports === "function" && !CSS.supports("color", cssColor)) {
      return;
    }

    input.style.accentColor = cssColor;
  }

  function findUnescaped(text, needle, startIndex) {
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === needle) {
        return index;
      }
    }

    return -1;
  }

  function splitMicronParts(text, separator, limit = 0) {
    const parts = [];
    let buffer = "";
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (escaped) {
        buffer += char;
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === separator && (limit <= 0 || parts.length < limit - 1)) {
        parts.push(buffer);
        buffer = "";
        continue;
      }

      buffer += char;
    }

    parts.push(buffer);
    return parts;
  }

  function createRadioPrefix() {
    return `micron-${Math.random().toString(36).slice(2, 10)}`;
  }

  function appendRenderedText(parent, text, options) {
    if (options && options.micronCellMode) {
      appendCellText(parent, text);
      return;
    }

    const style = normalizeSymbolStyle(options.symbolStyle);

    if (style === "system") {
      appendSymbolAwareText(parent, text, "micron-symbol micron-symbol-system");
      return;
    }

    if (style === "text") {
      appendSymbolAwareText(parent, text, "micron-symbol micron-symbol-text");
      return;
    }

    appendFriendlyNodeText(parent, text);
  }


  function shouldRenderTextAsCells(text) {
    return /[─-╿]/u.test(String(text || ""));
  }

  function appendCellText(parent, text) {
    for (const char of Array.from(String(text))) {
      const cell = document.createElement("span");
      cell.className = "micron-cell";
      cell.textContent = char === " " ? " " : char;
      parent.appendChild(cell);
    }
  }

  function appendFriendlyNodeText(parent, text) {
    const iconPack = window.FriendlyNodeMicronIconPack;

    if (!iconPack || typeof iconPack.createIcon !== "function" || typeof iconPack.supports !== "function") {
      appendSymbolAwareText(parent, text, "micron-symbol micron-symbol-friendlynode");
      return;
    }

    let buffer = "";

    function flushBuffer() {
      if (buffer === "") {
        return;
      }

      parent.appendChild(document.createTextNode(buffer));
      buffer = "";
    }

    for (const token of tokenizeFriendlyNodeSymbols(text, iconPack)) {
      if (token.symbol) {
        flushBuffer();
        parent.appendChild(iconPack.createIcon(token.value));
        continue;
      }

      buffer += token.value;
    }

    flushBuffer();
  }

  function tokenizeFriendlyNodeSymbols(text, iconPack) {
    const tokens = [];
    const multiSymbols = typeof iconPack.getMultiCharacterSymbols === "function"
      ? iconPack.getMultiCharacterSymbols().sort((a, b) => b.length - a.length)
      : [];
    let index = 0;

    while (index < text.length) {
      const multi = multiSymbols.find((symbol) => text.startsWith(symbol, index) && supportsFriendlyNodeTextSymbol(iconPack, symbol));

      if (multi) {
        tokens.push({ value: multi, symbol: true });
        index += multi.length;
        continue;
      }

      const char = Array.from(text.slice(index))[0];

      if (!char) {
        break;
      }

      tokens.push({
        value: char,
        symbol: supportsFriendlyNodeTextSymbol(iconPack, char),
      });
      index += char.length;
    }

    return tokens;
  }

  function supportsFriendlyNodeTextSymbol(iconPack, symbol) {
    if (typeof iconPack.supportsText === "function") {
      return iconPack.supportsText(symbol);
    }

    return iconPack.supports(symbol);
  }

  function appendSymbolAwareText(parent, text, symbolClassName) {
    let buffer = "";

    function flushBuffer() {
      if (buffer === "") {
        return;
      }

      parent.appendChild(document.createTextNode(buffer));
      buffer = "";
    }

    for (const char of Array.from(text)) {
      if (!isEmojiLikeSymbol(char)) {
        buffer += char;
        continue;
      }

      flushBuffer();
      const span = document.createElement("span");
      span.className = symbolClassName;
      span.textContent = char;
      parent.appendChild(span);
    }

    flushBuffer();
  }

  function normalizeSymbolStyle(value) {
    return ["system", "friendlynode", "text"].includes(value) ? value : "system";
  }

  function isEmojiLikeSymbol(char) {
    const code = char.codePointAt(0);

    if (!Number.isInteger(code)) {
      return false;
    }

    return (code >= 0x2600 && code <= 0x27BF) || (code >= 0x2B00 && code <= 0x2BFF);
  }

  function normalizeSelection(selectionStart, selectionEnd) {
    if (!Number.isInteger(selectionStart) || !Number.isInteger(selectionEnd) || selectionStart === selectionEnd) {
      return null;
    }

    return {
      start: Math.min(selectionStart, selectionEnd),
      end: Math.max(selectionStart, selectionEnd),
    };
  }

  function isRawSelected(rawStart, rawEnd, selection) {
    return selection !== null && selection.start < rawEnd && selection.end > rawStart;
  }

  function readColor(text, startIndex) {
    let index = startIndex;
    let value = "";

    while (index < text.length && value.length < 6 && /[0-9a-fA-F]/.test(text[index])) {
      value += text[index];
      index += 1;
    }

    if (value.length === 3 || value.length === 4) {
      return {
        hex: `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`,
        nextIndex: index,
      };
    }

    if (value.length === 6) {
      return {
        hex: `#${value}`,
        nextIndex: index,
      };
    }

    return {
      hex: "",
      nextIndex: startIndex,
    };
  }

  window.FriendlyNodeMicron = {
    render,
    symbolGroups: window.FriendlyNodeMicronPalette && Array.isArray(window.FriendlyNodeMicronPalette.symbolGroups)
      ? window.FriendlyNodeMicronPalette.symbolGroups
      : [],
  };
})();
