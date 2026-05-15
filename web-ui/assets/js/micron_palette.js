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
        { label: "\u2500", block: "-", title: "Divider" },
      ],
    },
    {
      name: "Dividers",
      symbols: [
        { label: "\u2500", block: "-", title: "Simple line" },
        { label: "=", block: "-=", title: "Equal signs" },
        { label: "\u2501", block: "-\u2501", title: "Heavy line" },
        { label: "\u2550", block: "-\u2550", title: "Double line" },
        { label: "\u223F", block: "-\u223F", title: "Wavy line" },
        { label: "~", block: "-~", title: "Tildes" },
        { label: "\u2022", block: "-\u2022", title: "Bullets" },
        { label: "\u2219", block: "-\u2219", title: "Dots" },
        { label: "\u25AA", block: "-\u25AA", title: "Small squares" },
        { label: "\u25AB", block: "-\u25AB", title: "White small squares" },
        { label: "\u25A0", block: "-\u25A0", title: "Squares" },
        { label: "\u25A1", block: "-\u25A1", title: "White squares" },
        { label: "\u25CF", block: "-\u25CF", title: "Circles" },
        { label: "\u25CB", block: "-\u25CB", title: "White circles" },
        { label: "\u25C6", block: "-\u25C6", title: "Diamonds" },
        { label: "\u25C7", block: "-\u25C7", title: "White diamonds" },
        { label: "\u2605", block: "-\u2605", title: "Stars" },
        { label: "\u2606", block: "-\u2606", title: "White stars" },
        { label: "\u25B2", block: "-\u25B2", title: "Triangles" },
        { label: "\u2756", block: "-\u2756", title: "Diamond stars" },
        { label: "\u2550 \u2550", insert: "\u2550\u2550\u2550 \u2550\u2550\u2550 \u2550\u2550\u2550", title: "Segmented double line" },
        { label: "\u2605 \u2605", insert: "\u2605 \u2605 \u2605 \u2605 \u2605", title: "Spaced stars" },
      ],
    },
    {
      name: "Smileys",
      symbols: ["\u263A", "\u2639", ":-)", ";-)", ":-/", ":-D", ":-P", ":-O", "<3", "\u2665", "\u2661", "\u2764", "\u2763"],
    },
    {
      name: "Emoji Faces",
      symbols: ["\u{1F600}", "\u{1F601}", "\u{1F602}", "\u{1F605}", "\u{1F60A}", "\u{1F609}", "\u{1F60D}", "\u{1F60E}", "\u{1F610}", "\u{1F615}", "\u{1F622}", "\u{1F62D}", "\u{1F621}", "\u{1F914}", "\u{1F44D}", "\u{1F44E}", "\u{1F91D}", "\u{1F64F}"],
    },
    {
      name: "Status",
      symbols: ["\u2713", "\u2714", "\u2715", "\u2716", "\u2717", "\u2718", "\u2605", "\u2606", "\u2728", "\u26A1", "\u26A0", "\u267B", "\u2699", "\u269C"],
    },
    {
      name: "Objects",
      symbols: ["\u231A", "\u231B", "\u23F0", "\u23F1", "\u23F2", "\u2328", "\u260E", "\u2692", "\u2694", "\u2695", "\u2696", "\u2697", "\u2698"],
    },
    {
      name: "Emoji Objects",
      symbols: ["\u{1F4E1}", "\u{1F4FB}", "\u{1F9ED}", "\u{1F5FA}", "\u2709", "\u{1F4DD}", "\u{1F4BE}", "\u{1F512}", "\u{1F511}", "\u{1F527}", "\u{1F50C}", "\u{1F4A1}", "\u{1F50D}", "\u{1F4E6}"],
    },
    {
      name: "Nature",
      symbols: ["\u2600", "\u2601", "\u2602", "\u2603", "\u2604", "\u263D", "\u263E", "\u2668", "\u273F", "\u2740", "\u2741", "\u2618", "\u2663", "\u2667"],
    },
    {
      name: "Emoji Nature",
      symbols: ["\u{1F344}", "\u{1F33F}", "\u{1F332}", "\u{1F333}", "\u{1F319}", "\u2B50", "\u{1F525}", "\u{1F4A7}", "\u2744", "\u{1F30A}", "\u{1F308}", "\u{1F4AB}", "\u{1F331}", "\u{1F33A}"],
    },
    {
      name: "Box Drawing",
      symbols: [
        "\u250C", "\u2510", "\u2514", "\u2518", "\u251C", "\u2524", "\u252C", "\u2534", "\u253C", "\u2500", "\u2502", "\u2501", "\u2503",
        "\u250F", "\u2513", "\u2517", "\u251B", "\u2554", "\u2557", "\u255A", "\u255D", "\u2560", "\u2563", "\u2566", "\u2569", "\u256C", "\u2550", "\u2551",
        "\u256D", "\u256E", "\u2570", "\u256F",
      ],
    },
    {
      name: "Lines",
      symbols: [
        "\u2500", "\u2502", "\u2501", "\u2503", "\u2550", "\u2551", "\u2504", "\u2505", "\u2508", "\u2509", "\u254D", "\u254E", "\u254F",
        "/", "\\", "\u2571", "\u2572", "\u2573", "\u203E", "_", "\u2017", "\u2015", "\u2016", "\u00A6", "|", "~", "\u223C", "\u2248", "\u223F",
        "\u2307", "\uFE49", "\uFE4A", "\uFE4B", "\uFE4C",
      ],
    },
    {
      name: "Blocks",
      symbols: ["\u2591", "\u2592", "\u2593", "\u2588", "\u2580", "\u2584", "\u258C", "\u2590", "\u25A0", "\u25A1", "\u25AA", "\u25AB", "\u25AC", "\u25AD", "\u25AE", "\u25AF", "\u25C6", "\u25C7"],
    },
    {
      name: "Arrows",
      symbols: [
        "\u2190", "\u2192", "\u2191", "\u2193", "\u2194", "\u2195", "\u2196", "\u2197", "\u2198", "\u2199", "\u21D0", "\u21D2", "\u21D1", "\u21D3", "\u21D4", "\u21D5",
        "\u27F5", "\u27F6", "\u27F7", "\u2B05", "\u27A1", "\u2B06", "\u2B07", "\u2B08", "\u2B09", "\u2B0A", "\u2B0B", "\u25C0", "\u25B6", "\u25C1", "\u25B7", "\u27A4",
      ],
    },
    {
      name: "Symbols",
      symbols: [
        "\u2605", "\u2606", "\u2726", "\u2727", "\u272A", "\u272B", "\u272C", "\u272D", "\u272E", "\u272F", "\u2660", "\u2663", "\u2665", "\u2666", "\u2664", "\u2667", "\u2661", "\u2662",
        "\u2669", "\u266A", "\u266B", "\u266C", "\u266D", "\u266E", "\u266F", "+", "-", "\u00D7", "\u00F7", "=", "\u2260", "<", ">",
      ],
    },
  ];

  window.FriendlyNodeMicronPalette = {
    symbolGroups,
  };
})();
