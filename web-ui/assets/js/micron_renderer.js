(function () {
  const symbolGroups = [
    {
      name: "Micron",
      symbols: [
        { label: "B", style: "bold", placeholder: "bold", title: "Bold" },
        { label: "I", style: "italic", placeholder: "emphasis", title: "Italic" },
        { label: "U", style: "underline", placeholder: "underline", title: "Underline" },
        { label: "\u27F3", style: "reset", title: "Reset style" },
        { label: "\u2261", linePrefix: "`c", title: "Center align" },
        { label: "\u21E5", linePrefix: "`r", title: "Right align" },
        { label: "\u21E4", linePrefix: "`a", title: "Default align" },
        { label: "Aa", style: "foreground", colorCode: "ff8800", placeholder: "orange", title: "Orange text", color: "#ff8800" },
        { label: "Aa", style: "background", colorCode: "005555", placeholder: "background", title: "Blue background", background: "#005555" },
        { label: "H", linePrefix: ">", placeholder: "Heading", title: "Heading" },
        { label: "\u2500", block: "-\u223F", title: "Divider" },
      ],
    },
    {
      name: "Smile",
      symbols: ["\u263A", "\u2639", ":-)", ";-)", ":-/", ":-D", ":-P", ":-O", "<3"],
    },
    {
      name: "Arrows",
      symbols: ["\u2190", "\u2191", "\u2192", "\u2193", "\u21D2", "\u21D4", "\u21B5", "\u27A4"],
    },
    {
      name: "Graphics",
      symbols: ["\u2500", "\u2502", "\u250C", "\u2510", "\u2514", "\u2518", "\u251C", "\u2524", "\u252C", "\u2534", "\u253C", "\u2588"],
    },
  ];

  function render(source, options = {}) {
    const selection = normalizeSelection(options.selectionStart, options.selectionEnd);
    const root = document.createElement("div");
    root.className = "micron-content";
    const normalizedSource = String(source).replace(/\r\n/g, "\n");
    const lines = normalizedSource.split("\n");
    let literal = false;
    let rawOffset = 0;

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!literal && trimmed.startsWith("#")) {
        rawOffset += rawLine.length + 1;
        continue;
      }

      if (!literal && (trimmed === "-" || trimmed === "-\u223F" || trimmed === "-~")) {
        const divider = document.createElement("div");
        divider.className = "micron-divider";
        root.appendChild(divider);
        rawOffset += rawLine.length + 1;
        continue;
      }

      const line = document.createElement("div");
      const parsed = parseLinePrefix(rawLine);
      line.className = parsed.className;

      if (literal) {
        appendLiteral(line, rawLine, rawOffset, selection);
      } else {
        appendInline(line, parsed.text, rawOffset + parsed.offset, selection);
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

  function appendLiteral(parent, text, rawStart, selection) {
    let buffer = "";
    let selected = false;

    function flush() {
      if (buffer === "") {
        return;
      }

      const span = document.createElement("span");
      span.textContent = buffer;

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

  function appendInline(parent, text, rawStart, selection) {
    let index = 0;
    let buffer = "";
    let bufferSelected = false;
    const state = {
      bold: false,
      italic: false,
      underline: false,
      foreground: "",
      background: "",
    };

    function flush() {
      if (buffer === "") {
        return;
      }

      const span = document.createElement("span");
      span.textContent = buffer;

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
    symbolGroups,
  };
})();
