(function () {
  const multiCharacterSymbols = [":-)", ";-)", ":-/", ":-D", ":-P", ":-O", "<3"];
  const asciiSymbols = new Set(["+", "-", "*", "/", "\\", "|", "_", "=", "<", ">", "~"]);
  const explicitSymbols = new Set(multiCharacterSymbols);

  function collectPaletteSymbols() {
    const palette = window.FriendlyNodeMicronPalette;

    if (!palette || !Array.isArray(palette.symbolGroups)) {
      return;
    }

    for (const group of palette.symbolGroups) {
      if (!Array.isArray(group.symbols)) {
        continue;
      }

      for (const item of group.symbols) {
        if (typeof item === "string") {
          explicitSymbols.add(item);
          continue;
        }

        if (!item || typeof item.label !== "string") {
          continue;
        }

        if (typeof item.block === "string" || typeof item.insert === "string") {
          explicitSymbols.add(item.label);
        }
      }
    }
  }

  function createIcon(symbol) {
    const value = String(symbol);
    const icon = document.createElement("span");
    const profile = getIconProfile(value);
    icon.className = `micron-symbol micron-symbol-friendlynode micron-symbol-icon micron-symbol-${profile.kind}`;
    icon.dataset.micronSymbol = value;
    icon.dataset.iconLabel = profile.label;
    icon.dataset.iconTone = profile.tone;
    icon.dataset.iconShape = profile.shape;
    icon.dataset.iconWide = Array.from(value).length > 1 ? "true" : "false";
    icon.contentEditable = "false";
    icon.textContent = value;
    icon.title = value;
    icon.setAttribute("aria-label", value);
    return icon;
  }

  function supports(symbol) {
    const value = String(symbol);

    if (explicitSymbols.has(value)) {
      return true;
    }

    if (value.length === 1 && asciiSymbols.has(value)) {
      return true;
    }

    if (Array.from(value).length !== 1) {
      return false;
    }

    const code = value.codePointAt(0);
    return Number.isInteger(code) && (
      (code >= 0x2190 && code <= 0x21FF) ||
      (code >= 0x2300 && code <= 0x23FF) ||
      (code >= 0x2500 && code <= 0x27BF) ||
      (code >= 0x2B00 && code <= 0x2BFF) ||
      (code >= 0x1F300 && code <= 0x1FAFF) ||
      (code >= 0xFE49 && code <= 0xFE4F)
    );
  }

  function supportsText(symbol) {
    const value = String(symbol);

    if (multiCharacterSymbols.includes(value)) {
      return true;
    }

    if (Array.from(value).length !== 1) {
      return false;
    }

    const code = value.codePointAt(0);
    return Number.isInteger(code) && code > 0x7F && (
      (code >= 0x2190 && code <= 0x21FF) ||
      (code >= 0x2300 && code <= 0x23FF) ||
      (code >= 0x2500 && code <= 0x27BF) ||
      (code >= 0x2B00 && code <= 0x2BFF) ||
      (code >= 0x1F300 && code <= 0x1FAFF) ||
      (code >= 0xFE49 && code <= 0xFE4F)
    );
  }

  function getMultiCharacterSymbols() {
    return multiCharacterSymbols.slice();
  }

  function getIconProfile(symbol) {
    if (["♥", "♡", "❤", "❣", "<3"].includes(symbol)) {
      return { kind: "heart", label: symbol === "<3" ? "♥" : symbol, tone: "rose", shape: "circle" };
    }

    if (["☺", "☹", ":-)", ";-)", ":-/", ":-D", ":-P", ":-O"].includes(symbol)) {
      return { kind: "smile", label: symbol, tone: getSmileTone(symbol), shape: "circle" };
    }

    if (["✓", "✔"].includes(symbol)) {
      return { kind: "check", label: "✓", tone: "green", shape: "circle" };
    }

    if (["✕", "✖", "✗", "✘"].includes(symbol)) {
      return { kind: "cross", label: "×", tone: "red", shape: "circle" };
    }

    if (symbol === "⚠") {
      return { kind: "warning", label: "!", tone: "amber", shape: "triangle" };
    }

    if (symbol === "♻") {
      return { kind: "recycle", label: "♻", tone: "green", shape: "hex" };
    }

    if (symbol === "⚖") {
      return { kind: "scales", label: "⚖", tone: "violet", shape: "hex" };
    }

    if (symbol === "☄") {
      return { kind: "comet", label: "☄", tone: "orange", shape: "pill" };
    }

    if (["★", "☆", "✦", "✧", "✪", "✫", "✬", "✭", "✮", "✯", "✨"].includes(symbol)) {
      return { kind: "star", label: symbol, tone: "gold", shape: "burst" };
    }

    if (isArrow(symbol)) {
      return { kind: "arrow", label: symbol, tone: "cyan", shape: "pill" };
    }

    if (isBoxDrawing(symbol) || isLineSymbol(symbol)) {
      return { kind: "line", label: symbol, tone: "blue", shape: "rounded" };
    }

    if (isBlockSymbol(symbol)) {
      return { kind: "block", label: symbol, tone: "slate", shape: "square" };
    }

    if (["☀", "☁", "☂", "☃", "☽", "☾", "♨", "✿", "❀", "❁", "☘", "🍄", "🌿", "🌲", "🌳", "🌙", "⭐", "🔥", "💧", "❄", "🌊", "🌈", "💫", "🌱", "🌺"].includes(symbol)) {
      return { kind: "nature", label: symbol, tone: "teal", shape: "circle" };
    }

    if (["⌚", "⌛", "⏰", "⏱", "⏲", "⌨", "☎", "⚒", "⚔", "⚕", "⚙", "⚜", "📡", "📻", "🧭", "🗺", "✉", "📝", "💾", "🔒", "🔑", "🔧", "🔌", "💡", "🔍", "📦"].includes(symbol)) {
      return { kind: "object", label: symbol, tone: "indigo", shape: "rounded" };
    }

    if (isModernEmoji(symbol)) {
      return { kind: "emoji", label: symbol, tone: getFallbackTone(symbol), shape: "circle" };
    }

    if (["♠", "♣", "♦", "♤", "♧", "♢", "♪", "♫", "♬", "♭", "♮", "♯"].includes(symbol)) {
      return { kind: "symbol", label: symbol, tone: "pink", shape: "diamond" };
    }

    return { kind: "glyph", label: symbol, tone: getFallbackTone(symbol), shape: "rounded" };
  }

  function getSmileTone(symbol) {
    if (symbol === "☹" || symbol === ":-/") {
      return "blue";
    }

    if (symbol === ":-O") {
      return "violet";
    }

    return "gold";
  }

  function getFallbackTone(symbol) {
    const code = symbol.codePointAt(0) || 0;
    const tones = ["green", "cyan", "violet", "orange", "pink", "blue", "teal"];
    return tones[code % tones.length];
  }

  function isArrow(symbol) {
    const code = symbol.codePointAt(0);
    return Number.isInteger(code) && (
      (code >= 0x2190 && code <= 0x21FF) ||
      (code >= 0x27A0 && code <= 0x27BF) ||
      (code >= 0x2B05 && code <= 0x2B0B)
    );
  }

  function isBoxDrawing(symbol) {
    const code = symbol.codePointAt(0);
    return Number.isInteger(code) && code >= 0x2500 && code <= 0x257F;
  }

  function isLineSymbol(symbol) {
    return ["/", "\\", "╱", "╲", "╳", "‾", "_", "‗", "―", "‖", "¦", "|", "~", "∼", "≈", "∿"].includes(symbol);
  }

  function isBlockSymbol(symbol) {
    const code = symbol.codePointAt(0);
    return Number.isInteger(code) && (
      (code >= 0x2580 && code <= 0x259F) ||
      (code >= 0x25A0 && code <= 0x25FF)
    );
  }

  function isModernEmoji(symbol) {
    const code = symbol.codePointAt(0);
    return Number.isInteger(code) && code >= 0x1F300 && code <= 0x1FAFF;
  }

  collectPaletteSymbols();

  window.FriendlyNodeMicronIconPack = {
    createIcon,
    getMultiCharacterSymbols,
    supportsText,
    supports,
  };
})();
