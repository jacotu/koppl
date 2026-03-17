(function initFontPluginShared(global) {
  global.__fontPluginStage = "shared";
  const STORAGE_KEYS = ["fonts", "siteSettings", "theme", "recentFontIds", "favoriteFontIds", "defaultTypography", "targetNotFoundHosts", "showPageBadge", "globalOverride", "sitesSortBy"];
  const FONT_FORMAT_BY_EXTENSION = {
    woff2: "woff2",
    woff: "woff",
    ttf: "truetype",
    otf: "opentype"
  };
  const RESTRICTED_HOSTS = new Set([
    "chrome.google.com",
    "chromewebstore.google.com"
  ]);
  const ROOT_SCOPE = "html[data-font-plugin-active]";
  // Increase specificity without breaking the selector (no descendant combinator).
  const ROOT_SCOPE_DOUBLE = ROOT_SCOPE + "[data-font-plugin-active]";
  const TARGET_MODES = {
    PAGE: "page",
    CONTENT: "content",
    HEADINGS: "headings",
    SELECTOR: "selector"
  };
  const TARGET_MODE_LABELS = {
    [TARGET_MODES.PAGE]: "Whole page",
    [TARGET_MODES.CONTENT]: "Article, main, .content",
    [TARGET_MODES.HEADINGS]: "Headings only",
    [TARGET_MODES.SELECTOR]: "Picked element"
  };
  const MESSAGE_TYPES = {
    START_PICKER:        "font-plugin:start-picker",
    STOP_PICKER:         "font-plugin:stop-picker",
    PAUSE_PREVIEW:       "font-plugin:pause-preview",
    RESUME_PREVIEW:      "font-plugin:resume-preview",
    START_DIM_PICKER:    "font-plugin:start-dim-picker",
    DIM_CAPTURE_REQUEST: "font-plugin:dim-capture-request",
    FETCH_FONT_URL:      "font-plugin:fetch-font-url",
    INSPECT_FONTS:       "font-plugin:inspect-fonts",
    HIGHLIGHT_ELEMENT:   "font-plugin:highlight-element"
  };
  const DEFAULT_TYPOGRAPHY = {
    fontSizePx: null,
    fontSizePercent: 100,
    lineHeight: null,
    letterSpacingEm: 0,
    fontWeight: null,
    fontStyle: "normal",
    wordSpacingEm: 0,
    textTransform: "none",
    textColor: null,
    textDecoration: "none",
    textShadow: "none",
    textOpacity: 100
  };
  const CONTENT_SCOPE_SELECTORS = [
    "article",
    "main",
    '[role="main"]',
    ".content",
    ".post-content",
    ".entry-content",
    ".article-content",
    ".prose"
  ];
  const HEADING_SCOPE_SELECTORS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6"
  ];
  const RESET_BASE_SELECTORS = [
    "button",
    "button *",
    "input",
    "input *",
    "textarea",
    "textarea *",
    "select",
    "select *",
    "option",
    "optgroup",
    "svg",
    "svg *",
    "img",
    "picture",
    "video",
    "canvas",
    "iframe",
    "math",
    '[role="img"]',
    '[class*="icon"]',
    '[class*="icon"] *',
    '[class*="Icon"]',
    '[class*="Icon"] *',
    "[aria-hidden=\"true\"]",
    "[aria-hidden=\"true\"] *",
    ".fa",
    ".fa *",
    ".fas",
    ".fas *",
    ".far",
    ".far *",
    ".fab",
    ".fab *",
    ".material-icons",
    ".material-icons *",
    ".material-symbols-outlined",
    ".material-symbols-outlined *",
    ".material-symbols-rounded",
    ".material-symbols-rounded *",
    ".material-symbols-sharp",
    ".material-symbols-sharp *"
  ];
  const CODE_BASE_SELECTORS = [
    "code",
    "code *",
    "pre",
    "pre *",
    "samp",
    "samp *",
    "kbd",
    "kbd *"
  ];

  function getHostnameFromUrl(rawUrl) {
    if (!rawUrl) {
      return "";
    }

    try {
      return new URL(rawUrl).hostname;
    } catch (error) {
      return "";
    }
  }

  function isSupportedPageUrl(rawUrl) {
    if (!rawUrl) {
      return false;
    }

    try {
      const url = new URL(rawUrl);
      return /https?:/.test(url.protocol) && !RESTRICTED_HOSTS.has(url.hostname);
    } catch (error) {
      return false;
    }
  }

  function getFontFormat(fileName) {
    const extension = getFileExtension(fileName);
    return FONT_FORMAT_BY_EXTENSION[extension] || "";
  }

  function getFileExtension(fileName) {
    const segments = String(fileName || "").toLowerCase().split(".");
    return segments.length > 1 ? segments.pop() : "";
  }

  function getDisplayName(fileName) {
    return String(fileName || "Custom Font")
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Custom Font";
  }

  function getTableOffset(buffer, tableTag) {
    if (!buffer || buffer.byteLength < 12) return null;
    const buf = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const readU16 = (o) => view.getUint16(o, false);
    const readU32 = (o) => view.getUint32(o, false);
    const tag = (o) => String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    let numTables = 0;
    let entrySize = 16;
    let entryBase = 12;
    if (tag(0) === "wF2 ") return null;
    if (tag(0) === "wOFF") {
      numTables = readU16(12);
      entrySize = 20;
      entryBase = 44;
    } else {
      numTables = readU16(4);
    }
    for (let i = 0; i < numTables; i++) {
      const es = entryBase + i * entrySize;
      if (tag(es) !== tableTag) continue;
      if (entrySize === 20) {
        return { start: readU32(es + 4), length: readU32(es + 8) };
      }
      return { start: readU32(es + 8), length: readU32(es + 12) };
    }
    return null;
  }

  function parseNameTable(arrayBuffer) {
    const nameTable = getTableOffset(arrayBuffer, "name");
    if (!nameTable || nameTable.length < 6) return { byIndex: [], byId: {} };
    const buf = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const readU16 = (o) => view.getUint16(o, false);
    const start = nameTable.start;
    const count = readU16(start + 2);
    const stringOffset = readU16(start + 4);
    const byIndex = [];
    const byId = {};
    for (let i = 0; i < count; i++) {
      const recStart = start + 6 + i * 12;
      if (recStart + 12 > buf.length) break;
      const platformID = readU16(recStart);
      const nameID = readU16(recStart + 6);
      const length = readU16(recStart + 8);
      const offset = readU16(recStart + 10);
      const strStart = start + stringOffset + offset;
      if (strStart + length > buf.length) continue;
      let decoded = "";
      if (platformID === 3 && (readU16(recStart + 2) === 1 || readU16(recStart + 2) === 10)) {
        const u16 = new Uint16Array(buf.buffer, buf.byteOffset + strStart, length / 2);
        try {
          decoded = String.fromCharCode.apply(null, u16);
        } catch (_) {}
      } else if (platformID === 1) {
        try {
          decoded = String.fromCharCode.apply(null, buf.subarray(strStart, strStart + length));
        } catch (_) {}
      }
      if (decoded) {
        byIndex[i] = decoded;
        if (!byId[nameID]) byId[nameID] = decoded;
      }
    }
    return { byIndex, byId };
  }

  function parseGsubFeatureTags(arrayBuffer) {
    const result = [];
    if (!arrayBuffer || arrayBuffer.byteLength < 12) {
      return result;
    }
    const buf = new Uint8Array(arrayBuffer);
    const view = new DataView(arrayBuffer);
    const readU16 = (offset) => view.getUint16(offset, false);
    const gsubTable = getTableOffset(arrayBuffer, "GSUB");
    if (!gsubTable || gsubTable.length < 10) return result;
    const gsubStart = gsubTable.start;
    const gsubLength = gsubTable.length;
    const featureListStart = gsubStart + readU16(gsubStart + 6);
    if (featureListStart + 2 > buf.length) return result;
    const featureCount = readU16(featureListStart);
    const nameData = parseNameTable(arrayBuffer);
    for (let i = 0; i < featureCount; i++) {
      const recStart = featureListStart + 2 + i * 6;
      if (recStart + 6 > buf.length) break;
      const featureTag = String.fromCharCode(buf[recStart], buf[recStart + 1], buf[recStart + 2], buf[recStart + 3]);
      if (!/^ss\d{2}$/i.test(featureTag) && !/^cv\d{2}$/i.test(featureTag)) continue;
      const featureOffset = readU16(recStart + 4);
      let nameStr = "";
      const featureTableStart = featureListStart + featureOffset;
      if (featureTableStart + 4 <= buf.length) {
        const paramsOffset = readU16(featureTableStart);
        if (paramsOffset !== 0) {
          const paramsStart = featureListStart + paramsOffset;
          if (paramsStart + 4 <= buf.length) {
            const format = readU16(paramsStart);
            const nameIndex = readU16(paramsStart + 2);
            if (format === 0) {
              nameStr = nameData.byIndex[nameIndex] || nameData.byId[nameIndex] || "";
            }
          }
        }
      }
      result.push({ tag: featureTag.toLowerCase(), name: nameStr || "" });
    }
    result.sort((a, b) => a.tag.localeCompare(b.tag));
    const seen = new Set();
    return result.filter((r) => {
      if (seen.has(r.tag)) return false;
      seen.add(r.tag);
      return true;
    });
  }

  function getFontFeatureTagsFromDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.includes("base64,")) {
      return [];
    }
    try {
      const base64 = dataUrl.split(",")[1];
      if (!base64) return [];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return parseGsubFeatureTags(bytes.buffer);
    } catch (e) {
      return [];
    }
  }

  function makeFontId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return "font_" + global.crypto.randomUUID();
    }

    return "font_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function makeRuntimeFamilyName(fontId) {
    return "__font_plugin_" + String(fontId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function normalizeSiteSetting(rawSetting) {
    const setting = rawSetting || {};
    const typography = setting.typography || {};
    const targetMode = Object.values(TARGET_MODES).includes(setting.targetMode)
      ? setting.targetMode
      : TARGET_MODES.PAGE;

    return {
      enabled: Boolean(setting.enabled),
      fontId: typeof setting.fontId === "string" ? setting.fontId : "",
      targetMode,
      targetSelector: typeof setting.targetSelector === "string" ? setting.targetSelector : "",
      targetSelectorFallback: typeof setting.targetSelectorFallback === "string" ? setting.targetSelectorFallback : "",
      targetLabel: typeof setting.targetLabel === "string" ? setting.targetLabel : "",
      textOnly: typeof setting.textOnly === "boolean" ? setting.textOnly : false,
      fontFeatureSettings: typeof setting.fontFeatureSettings === "string" ? setting.fontFeatureSettings.trim() : "",
      typography: {
        fontSizePx: typeof typography.fontSizePx === "number" ? Math.min(200, Math.max(50, typography.fontSizePx)) : null,
        fontSizePercent: normalizeNumber(typography.fontSizePercent, DEFAULT_TYPOGRAPHY.fontSizePercent, 70, 200),
        lineHeight: normalizeOptionalNumber(typography.lineHeight, 0.8, 2.5),
        letterSpacingEm: normalizeNumber(typography.letterSpacingEm, DEFAULT_TYPOGRAPHY.letterSpacingEm, -0.12, 0.3),
        fontWeight: normalizeOptionalWeight(typography.fontWeight),
        fontStyle: /^(normal|italic|oblique)$/i.test(typography.fontStyle) ? typography.fontStyle : DEFAULT_TYPOGRAPHY.fontStyle,
        wordSpacingEm: normalizeNumber(typography.wordSpacingEm, DEFAULT_TYPOGRAPHY.wordSpacingEm, -0.2, 0.5),
        textTransform: /^(none|uppercase|lowercase|capitalize)$/i.test(typography.textTransform) ? typography.textTransform : DEFAULT_TYPOGRAPHY.textTransform,
        textColor: typeof typography.textColor === "string" ? typography.textColor : DEFAULT_TYPOGRAPHY.textColor,
        textDecoration: /^(none|underline|line-through|overline)$/i.test(typography.textDecoration) ? typography.textDecoration : DEFAULT_TYPOGRAPHY.textDecoration,
        textShadow: /^(none|soft|medium|hard)$/i.test(typography.textShadow) ? typography.textShadow : DEFAULT_TYPOGRAPHY.textShadow,
        textOpacity: normalizeNumber(typography.textOpacity, DEFAULT_TYPOGRAPHY.textOpacity, 0, 100)
      },
      relaxLayout: typeof setting.relaxLayout === "boolean" ? setting.relaxLayout : false,
      updatedAt: typeof setting.updatedAt === "number" ? setting.updatedAt : 0
    };
  }

  function getSiteRules(hostname, siteSettings) {
    const raw = hostname ? siteSettings[hostname] : null;
    if (!raw) {
      return [];
    }
    if (Array.isArray(raw.rules) && raw.rules.length > 0) {
      // Top-level `enabled` is the master on/off switch for the whole domain.
      // Individual rule.enabled may be stale (written before this contract was
      // established), so we always override it with the authoritative top-level value.
      const masterEnabled = typeof raw.enabled === "boolean" ? raw.enabled : true;
      return raw.rules.map((r) => {
        const n = normalizeSiteSetting(r);
        return masterEnabled === n.enabled ? n : { ...n, enabled: masterEnabled };
      });
    }
    // Legacy flat format: the whole entry IS the rule, enabled lives inside it.
    return [normalizeSiteSetting(raw)];
  }

  function getScopeSelectors(setting) {
    switch (setting.targetMode) {
      case TARGET_MODES.CONTENT:
        return CONTENT_SCOPE_SELECTORS.slice();
      case TARGET_MODES.HEADINGS:
        return HEADING_SCOPE_SELECTORS.slice();
      case TARGET_MODES.SELECTOR:
        return setting.targetSelector ? [setting.targetSelector] : ["body"];
      case TARGET_MODES.PAGE:
      default:
        return ["body"];
    }
  }

  function buildFontOverrideCss(fontRecord, rawSetting, ruleIndex) {
    const setting = normalizeSiteSetting(rawSetting);
    const isPageFont = fontRecord.pageFont && !fontRecord.dataUrl;
    const familyName = isPageFont ? fontRecord.name : makeRuntimeFamilyName(fontRecord.id);
    const varName = ruleIndex === undefined || ruleIndex === 0 ? "--font-plugin-family" : "--font-plugin-family-" + ruleIndex;
    const formatFragment = fontRecord.format ? ' format("' + fontRecord.format + '")' : "";
    const scopeSelectors = getScopeSelectors(setting);
    const prefix = (arr) => arr.map((s) => ROOT_SCOPE_DOUBLE + " " + s);
    let rootSelectors = prefix(scopeSelectors).join(",\n");
    const targetSelectors = scopeSelectors.flatMap((s) => [ROOT_SCOPE_DOUBLE + " " + s, ROOT_SCOPE_DOUBLE + " " + s + " *"]).join(",\n");
    const resetSelectors = setting.textOnly
      ? prefix(buildScopedSelectors(scopeSelectors, RESET_BASE_SELECTORS)).join(",\n")
      : "";
    const codeSelectors = prefix(buildScopedSelectors(scopeSelectors, CODE_BASE_SELECTORS)).join(",\n");
    const rootTypographyDeclarations = buildRootTypographyDeclarations(setting.typography);
    const targetTypographyDeclarations = buildTargetTypographyDeclarations(setting.typography);
    const blocks = isPageFont
      ? [
        ":root {",
        '  ' + varName + ': "' + familyName + '";',
        "}"
      ]
      : [
        '@font-face {',
        '  font-family: "' + familyName + '";',
        '  src: url("' + fontRecord.dataUrl + '")' + formatFragment + ";",
        "  font-display: swap;",
        "}",
        "",
        ":root {",
        '  ' + varName + ': "' + familyName + '";',
        "}"
      ];

    if (rootTypographyDeclarations) {
      // zoom must always be scoped to the html element so the whole layout scales;
      // for non-PAGE modes we still zoom the full page (user explicitly chose it).
      const rootBlock = setting.targetMode === TARGET_MODES.PAGE
        ? [ROOT_SCOPE_DOUBLE, rootSelectors].filter(Boolean).join(",\n")
        : ROOT_SCOPE_DOUBLE;
      blocks.push("", rootBlock + " {", rootTypographyDeclarations, "}");
    }

    const targetDeclarations = [
      "  font-family: var(" + varName + "), system-ui, sans-serif !important;",
      "  overflow-wrap: break-word !important;",
      "  word-break: break-word !important;",
      targetTypographyDeclarations
    ];
    if (setting.fontFeatureSettings) {
      targetDeclarations.push("  font-feature-settings: " + setting.fontFeatureSettings + " !important;");
    }
    blocks.push(
      "",
      targetSelectors + " {",
      ...targetDeclarations,
      "}"
    );

    // Relax layout mode: let containers grow to fit new font metrics
    if (setting.relaxLayout) {
      const relaxSelectors = scopeSelectors
        .flatMap((s) => [
          ROOT_SCOPE_DOUBLE + " " + s,
          ROOT_SCOPE_DOUBLE + " " + s + " p",
          ROOT_SCOPE_DOUBLE + " " + s + " div",
          ROOT_SCOPE_DOUBLE + " " + s + " li",
          ROOT_SCOPE_DOUBLE + " " + s + " td",
          ROOT_SCOPE_DOUBLE + " " + s + " th",
          ROOT_SCOPE_DOUBLE + " " + s + " blockquote",
          ROOT_SCOPE_DOUBLE + " " + s + " article",
          ROOT_SCOPE_DOUBLE + " " + s + " section",
          ROOT_SCOPE_DOUBLE + " " + s + " button",
          ROOT_SCOPE_DOUBLE + " " + s + " a",
          ROOT_SCOPE_DOUBLE + " " + s + " span",
          ROOT_SCOPE_DOUBLE + " " + s + " h1",
          ROOT_SCOPE_DOUBLE + " " + s + " h2",
          ROOT_SCOPE_DOUBLE + " " + s + " h3",
          ROOT_SCOPE_DOUBLE + " " + s + " h4",
          ROOT_SCOPE_DOUBLE + " " + s + " h5",
          ROOT_SCOPE_DOUBLE + " " + s + " h6",
        ])
        .join(",\n");
      blocks.push(
        "",
        "/* Relax layout — containers adapt to new font metrics */",
        relaxSelectors + " {",
        "  overflow: visible !important;",
        "  height: auto !important;",
        "  max-height: none !important;",
        "  white-space: normal !important;",
        "}"
      );
    }

    if (resetSelectors) {
      blocks.push(
        "",
        resetSelectors + " {",
        "  font-family: revert !important;",
        "  font-size: revert !important;",
        "  line-height: revert !important;",
        "  letter-spacing: revert !important;",
        "  font-weight: revert !important;",
        "}"
      );
    }

    blocks.push(
      "",
      codeSelectors + " {",
      "  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;",
      "}"
    );

    return blocks.join("\n");
  }

  function buildFontOverrideCssForShadow(fontRecord, rawSetting, ruleIndex) {
    const setting = normalizeSiteSetting(rawSetting);
    const isPageFont = fontRecord.pageFont && !fontRecord.dataUrl;
    const familyName = isPageFont ? fontRecord.name : makeRuntimeFamilyName(fontRecord.id);
    const varName = ruleIndex === undefined || ruleIndex === 0 ? "--font-plugin-family" : "--font-plugin-family-" + ruleIndex;
    const formatFragment = fontRecord.format ? ' format("' + fontRecord.format + '")' : "";
    const hostPrefix = (arr) => arr.map((s) => ":host " + s);
    const rootSelectors = ":host";
    const targetSelectors = ":host,\n:host *";
    const resetSelectors = setting.textOnly
      ? hostPrefix(RESET_BASE_SELECTORS).join(",\n")
      : "";
    const codeSelectors = hostPrefix(CODE_BASE_SELECTORS).join(",\n");
    const rootTypographyDeclarations = buildRootTypographyDeclarations(setting.typography);
    const targetTypographyDeclarations = buildTargetTypographyDeclarations(setting.typography);
    const blocks = isPageFont
      ? [
        ":root {",
        '  ' + varName + ': "' + familyName + '";',
        "}"
      ]
      : [
        '@font-face {',
        '  font-family: "' + familyName + '";',
        '  src: url("' + fontRecord.dataUrl + '")' + formatFragment + ";",
        "  font-display: swap;",
        "}",
        "",
        ":root {",
        '  ' + varName + ': "' + familyName + '";',
        "}"
      ];
    if (rootTypographyDeclarations) {
      blocks.push("", rootSelectors + " {", rootTypographyDeclarations, "}");
    }
    const shadowTargetDeclarations = ["  font-family: var(" + varName + "), system-ui, sans-serif !important;", targetTypographyDeclarations];
    if (setting.fontFeatureSettings) {
      shadowTargetDeclarations.push("  font-feature-settings: " + setting.fontFeatureSettings + " !important;");
    }
    blocks.push(
      "",
      targetSelectors + " {",
      ...shadowTargetDeclarations,
      "}"
    );
    if (resetSelectors) {
      blocks.push(
        "",
        resetSelectors + " {",
        "  font-family: revert !important;",
        "  font-size: revert !important;",
        "  line-height: revert !important;",
        "  letter-spacing: revert !important;",
        "  font-weight: revert !important;",
        "}"
      );
    }
    blocks.push(
      "",
      codeSelectors + " {",
      "  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;",
      "}"
    );
    return blocks.join("\n");
  }

  function buildRootTypographyDeclarations(typography) {
    const declarations = [];

    // fontSizePx is repurposed as page zoom percentage (50–200).
    // Applying zoom on :root/html scales the entire layout — images, containers,
    // spacing — exactly like browser zoom, so all elements scale proportionally.
    if (typeof typography.fontSizePx === "number") {
      declarations.push("  zoom: " + typography.fontSizePx + "% !important;");
    } else if (typography.fontSizePercent !== DEFAULT_TYPOGRAPHY.fontSizePercent) {
      // Legacy: old percent-based font size stored before zoom was introduced
      declarations.push("  font-size: " + typography.fontSizePercent + "% !important;");
    }

    return declarations.join("\n");
  }

  function buildTargetTypographyDeclarations(typography) {
    const declarations = [];

    if (typeof typography.lineHeight === "number") {
      declarations.push("  line-height: " + typography.lineHeight + " !important;");
    }

    if (typography.letterSpacingEm !== DEFAULT_TYPOGRAPHY.letterSpacingEm) {
      declarations.push("  letter-spacing: " + typography.letterSpacingEm + "em !important;");
    }

    if (typeof typography.fontWeight === "number") {
      declarations.push("  font-weight: " + typography.fontWeight + " !important;");
    }

    if (typography.fontStyle && typography.fontStyle !== "normal") {
      declarations.push("  font-style: " + typography.fontStyle + " !important;");
    }

    if (typeof typography.wordSpacingEm === "number" && typography.wordSpacingEm !== 0) {
      declarations.push("  word-spacing: " + typography.wordSpacingEm + "em !important;");
    }

    if (typography.textTransform && typography.textTransform !== "none") {
      declarations.push("  text-transform: " + typography.textTransform + " !important;");
    }

    // Color + opacity: combined so opacity applies only to text, never to backgrounds/images
    const hasCustomColor = typography.textColor && typography.textColor !== DEFAULT_TYPOGRAPHY.textColor;
    const hasOpacity = typeof typography.textOpacity === "number" && typography.textOpacity !== 100;
    if (hasCustomColor && hasOpacity) {
      // Merge hex color with alpha → rgba
      const hex = typography.textColor.replace(/^#/, "");
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = (typography.textOpacity / 100).toFixed(2);
      declarations.push("  color: rgba(" + r + ", " + g + ", " + b + ", " + a + ") !important;");
    } else if (hasCustomColor) {
      declarations.push("  color: " + typography.textColor + " !important;");
    } else if (hasOpacity) {
      // color-mix blends currentColor with transparent — affects only text, not backgrounds
      declarations.push("  color: color-mix(in srgb, currentColor " + typography.textOpacity + "%, transparent) !important;");
    }

    if (typography.textDecoration && typography.textDecoration !== "none") {
      declarations.push("  text-decoration: " + typography.textDecoration + " !important;");
    }

    if (typography.textShadow && typography.textShadow !== "none") {
      let shadowValue = "none";
      if (typography.textShadow === "soft") shadowValue = "2px 2px 4px rgba(0,0,0,0.15)";
      if (typography.textShadow === "medium") shadowValue = "3px 3px 6px rgba(0,0,0,0.25)";
      if (typography.textShadow === "hard") shadowValue = "4px 4px 8px rgba(0,0,0,0.35)";
      declarations.push("  text-shadow: " + shadowValue + " !important;");
    }

    return declarations.join("\n");
  }

  function buildScopedSelectors(scopeSelectors, baseSelectors) {
    const scoped = [];

    scopeSelectors.forEach((scopeSelector) => {
      baseSelectors.forEach((baseSelector) => {
        scoped.push(scopeSelector + " " + baseSelector);
      });
    });

    return Array.from(new Set(scoped));
  }

  function getTargetSummary(rawSetting) {
    const setting = normalizeSiteSetting(rawSetting);

    if (setting.targetMode === TARGET_MODES.SELECTOR) {
      return setting.targetLabel ? "Picked: " + setting.targetLabel : TARGET_MODE_LABELS[TARGET_MODES.SELECTOR];
    }

    return TARGET_MODE_LABELS[setting.targetMode];
  }

  function getTargetSummaryI18nKey(rawSetting) {
    const setting = normalizeSiteSetting(rawSetting);
    if (setting.targetMode === TARGET_MODES.SELECTOR) {
      return setting.targetLabel
        ? { key: "targetModePickedLabel", substitutions: [setting.targetLabel] }
        : { key: "pickedElement", substitutions: [] };
    }
    const keys = {
      [TARGET_MODES.PAGE]: "wholePage",
      [TARGET_MODES.CONTENT]: "articleMain",
      [TARGET_MODES.HEADINGS]: "headingsOnly",
      [TARGET_MODES.SELECTOR]: "pickedElement"
    };
    return { key: keys[setting.targetMode] || "wholePage", substitutions: [] };
  }

  function formatTimestamp(timestamp) {
    if (!timestamp) {
      return "";
    }

    try {
      return new Intl.DateTimeFormat(navigator.language || "en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(timestamp));
    } catch (error) {
      return "";
    }
  }

  function normalizeNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return clamp(parsed, min, max);
  }

  function normalizeOptionalNumber(value, min, max) {
    if (value === "" || value === null || typeof value === "undefined") {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return clamp(parsed, min, max);
  }

  function normalizeOptionalWeight(value) {
    if (value === "" || value === null || typeof value === "undefined") {
      return null;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return null;
    }

    return clamp(Math.round(parsed / 100) * 100, 100, 900);
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function parseFontFeatureSettings(str, featureTags) {
    const checked = {};
    (featureTags || []).forEach((f) => {
      checked[f.tag] = false;
    });
    const rest = [];
    const s = (str || "").trim();
    if (s) {
      s.split(",").forEach((part) => {
        const t = part.trim();
        let matched = false;
        for (const f of featureTags || []) {
          const tag = f.tag;
          if (t === '"' + tag + '" 1' || t === tag + " 1" || new RegExp("^[\"']?" + String(tag).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"']?\\s+1$", "i").test(t)) {
            checked[tag] = true;
            matched = true;
            break;
          }
        }
        if (!matched && t) rest.push(t);
      });
    }
    return { checked, other: rest.join(", ") };
  }

  function buildFontFeatureSettings(checkedMap, otherStr) {
    const parts = Object.keys(checkedMap || {}).filter((tag) => checkedMap[tag]).map((tag) => '"' + tag + '" 1');
    const other = (otherStr || "").trim();
    if (other) parts.push(other);
    return parts.join(", ");
  }

  function getCopyableCss(fontRecord, rawSetting) {
    if (!fontRecord || !fontRecord.dataUrl) {
      return "";
    }
    const setting = normalizeSiteSetting(rawSetting);
    const familyName = makeRuntimeFamilyName(fontRecord.id);
    const formatFragment = fontRecord.format ? ' format("' + fontRecord.format + '")' : "";
    const typo = setting.typography;
    const lines = [
      '@font-face {',
      '  font-family: "' + familyName + '";',
      '  src: url("' + fontRecord.dataUrl + '")' + formatFragment + ";",
      "  font-display: swap;",
      "}",
      "",
      "/* Apply to body or your selector */",
      "body {",
      '  font-family: "' + familyName + '", system-ui, sans-serif;'
    ];
    if (typo.fontSizePercent !== DEFAULT_TYPOGRAPHY.fontSizePercent) {
      lines.push("  font-size: " + typo.fontSizePercent + "%;");
    }
    if (typeof typo.lineHeight === "number") {
      lines.push("  line-height: " + typo.lineHeight + ";");
    }
    if (typo.letterSpacingEm !== DEFAULT_TYPOGRAPHY.letterSpacingEm) {
      lines.push("  letter-spacing: " + typo.letterSpacingEm + "em;");
    }
    if (typeof typo.fontWeight === "number") {
      lines.push("  font-weight: " + typo.fontWeight + ";");
    }
    if (typo.fontStyle && typo.fontStyle !== "normal") {
      lines.push("  font-style: " + typo.fontStyle + ";");
    }
    if (typeof typo.wordSpacingEm === "number" && typo.wordSpacingEm !== 0) {
      lines.push("  word-spacing: " + typo.wordSpacingEm + "em;");
    }
    if (typo.textTransform && typo.textTransform !== "none") {
      lines.push("  text-transform: " + typo.textTransform + ";");
    }
    if (typo.textColor && typo.textColor !== DEFAULT_TYPOGRAPHY.textColor) {
      lines.push("  color: " + typo.textColor + ";");
    }
    if (typo.textDecoration && typo.textDecoration !== "none") {
      lines.push("  text-decoration: " + typo.textDecoration + ";");
    }
    if (typo.textShadow && typo.textShadow !== "none") {
      let shadowValue = "none";
      if (typo.textShadow === "soft") shadowValue = "2px 2px 4px rgba(0,0,0,0.15)";
      if (typo.textShadow === "medium") shadowValue = "3px 3px 6px rgba(0,0,0,0.25)";
      if (typo.textShadow === "hard") shadowValue = "4px 4px 8px rgba(0,0,0,0.35)";
      lines.push("  text-shadow: " + shadowValue + ";");
    }
    if (typo.textOpacity && typo.textOpacity !== DEFAULT_TYPOGRAPHY.textOpacity) {
      lines.push("  opacity: " + (typo.textOpacity / 100) + ";");
    }
    if (setting.fontFeatureSettings) {
      lines.push("  font-feature-settings: " + setting.fontFeatureSettings + ";");
    }
    lines.push("}");
    return lines.join("\n");
  }

  global.FontPluginShared = {
    CONTENT_SCOPE_SELECTORS,
    DEFAULT_TYPOGRAPHY,
    MESSAGE_TYPES,
    STORAGE_KEYS,
    TARGET_MODES,
    TARGET_MODE_LABELS,
    buildFontOverrideCss,
    buildFontOverrideCssForShadow,
    formatTimestamp,
    getDisplayName,
    getFileExtension,
    getFontFormat,
    getFontFeatureTagsFromDataUrl,
    getHostnameFromUrl,
    buildFontFeatureSettings,
    getCopyableCss,
    getScopeSelectors,
    getSiteRules,
    getTargetSummary,
    getTargetSummaryI18nKey,
    isSupportedPageUrl,
    makeFontId,
    makeRuntimeFamilyName,
    normalizeSiteSetting,
    parseFontFeatureSettings,
    parseGsubFeatureTags
  };
})(globalThis);
