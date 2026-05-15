(function () {
  function render(source, options = {}) {
    const selection = normalizeSelection(options.selectionStart, options.selectionEnd);
    const root = document.createElement("div");
    root.className = "micron-content";
    root.dataset.symbolStyle = normalizeSymbolStyle(options.symbolStyle);
    const normalizedSource = String(source).replace(/\r\n/g, "\n");
    const lines = normalizedSource.split("\n");
    let literal = false;
    let rawOffset = 0;
    const inlineState = createInlineState();

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!literal && trimmed.startsWith("#")) {
        rawOffset += rawLine.length + 1;
        continue;
      }

      if (!literal && isDividerLine(trimmed)) {
        const divider = document.createElement("div");
        divider.className = "micron-divider";
        divider.dataset.micronSource = trimmed;
        const dividerText = renderDividerText(trimmed);

        if (dividerText !== "") {
          divider.textContent = dividerText;
        }

        root.appendChild(divider);
        rawOffset += rawLine.length + 1;
        continue;
      }

      const line = document.createElement("div");
      const parsed = parseLinePrefix(rawLine);
      line.className = parsed.className;

      if (literal) {
        appendLiteral(line, rawLine, rawOffset, selection, options);
      } else {
        appendInline(line, parsed.text, rawOffset + parsed.offset, selection, inlineState, options);
      }

      if (parsed.toggleLiteral) {
        literal = !literal;
      }

      root.appendChild(line);
      rawOffset += rawLine.length + 1;
    }

    return root;
  }

  function parseLinePrefix(line) {
    let text = line;
    let offset = 0;
    const classes = ["micron-line"];
    let toggleLiteral = false;

    if (text.startsWith("`=")) {
      classes.push("micron-literal");
      text = text.slice(2).trimStart();
      offset += 2;
      offset += line.slice(2).length - text.length;
      toggleLiteral = true;
    }

    const alignment = text.match(/^`([clra])\s*/);

    if (alignment) {
      classes.push(`micron-align-${alignment[1]}`);
      text = text.slice(alignment[0].length);
      offset += alignment[0].length;
    }

    const section = text.match(/^(>+)\s*(.*)$/);

    if (section) {
      const level = Math.min(section[1].length, 6);
      classes.push("micron-heading", `micron-heading-${level}`);
      text = section[2];
      offset += section[0].length - section[2].length;
    }

    return {
      className: classes.join(" "),
      text,
      offset,
      toggleLiteral,
    };
  }

  function isDividerLine(line) {
    return line === "-" || (line.length === 2 && line[0] === "-");
  }

  function renderDividerText(line) {
    if (line === "-") {
      return "";
    }

    return line[1].repeat(32);
  }

  function appendLiteral(parent, text, rawStart, selection, options) {
    let buffer = "";
    let selected = false;

    function flush() {
      if (buffer === "") {
        return;
      }

      const span = document.createElement("span");
      appendRenderedText(span, buffer, options);

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

  function appendInline(parent, text, rawStart, selection, state = createInlineState(), options = {}) {
    let index = 0;
    let buffer = "";
    let bufferSelected = false;

    function flush() {
      if (buffer === "") {
        return;
      }

      const span = document.createElement("span");
      appendRenderedText(span, buffer, options);

      if (bufferSelected) {
        span.classList.add("micron-selected");
      }

      if (state.bold) {
        span.classList.add("micron-bold");
      }

      if (state.italic) {
        span.classList.add("micron-italic");
      }

      if (state.underline) {
        span.classList.add("micron-underline");
      }

      if (state.foreground !== "") {
        span.style.color = state.foreground;
      }

      if (state.background !== "") {
        span.style.backgroundColor = state.background;
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

      if (char !== "`" || index + 1 >= text.length) {
        appendVisible(char, index, index + 1);
        index += 1;
        continue;
      }

      const command = text[index + 1];

      if (command === "`") {
        flush();
        state.bold = false;
        state.italic = false;
        state.underline = false;
        state.foreground = "";
        state.background = "";
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

      index += 1;
      buffer += char;
    }

    flush();
  }

  function appendRenderedText(parent, text, options) {
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
