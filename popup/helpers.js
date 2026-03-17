(function () {
  "use strict";
  globalThis.__fontPluginStage = "helpers";
  const shared = globalThis.FontPluginShared;
  const popup = globalThis.FontPluginPopup;
  const state = popup.state;
  const elements = popup.elements;

  function msg(key, substitutions) {
    try {
      const s = substitutions ? chrome.i18n.getMessage(key, substitutions) : chrome.i18n.getMessage(key);
      return s || key;
    } catch (_) {
      return key;
    }
  }

  function getLocalizedTargetSummary(setting) {
    const { key, substitutions } = shared.getTargetSummaryI18nKey(setting);
    return msg(key, substitutions);
  }

  function getSortedFontRecords(fontMap) {
    const currentHostname = state.currentHostname;
    return Object.values(fontMap || state.fonts)
      .filter(function(r) {
        // Page fonts are ephemeral — only show them on the hostname they were captured from
        if (r.pageFont && r.pageFontHostname && r.pageFontHostname !== currentHostname) return false;
        return true;
      })
      .sort((left, right) => {
        const dateDelta = (right.uploadedAt || 0) - (left.uploadedAt || 0);
        if (dateDelta !== 0) return dateDelta;
        return left.name.localeCompare(right.name, "en");
      });
  }

  function setStatus(message, isSuccess) {
    elements.statusMessage.textContent = message;
    elements.statusMessage.classList.toggle("is-success", !!isSuccess);
  }

  function parseOptionalNumber(value, min, max) {
    if (value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return clampNumber(parsed, null, min, max);
  }

  function parseOptionalWeight(value) {
    if (value === "") return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return clampNumber(Math.round(parsed / 100) * 100, 400, 100, 900);
  }

  function clampNumber(value, fallback, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  function fileToFontRecord(file) {
    const format = shared.getFontFormat(file.name);
    if (!format) throw new Error("Unsupported font format: " + file.name);
    const id = shared.makeFontId();
    const name = shared.getDisplayName(file.name);
    const originalFileName = file.name;

    // Read file as DataURL (required for CSS @font-face src).
    // Also try arrayBuffer for GSUB feature parsing — failure here must NOT block the upload.
    return readFileAsDataUrl(file).then((dataUrl) => {
      let openTypeFeatures = [];
      try {
        // arrayBuffer() is sync-like after the file is already read; wrap in its own try-catch
        // because parseGsubFeatureTags can throw on CFF/non-TrueType OTF or malformed tables.
        const ab = dataUrl
          ? (function() {
              try { const b64 = dataUrl.split(",")[1]; if (!b64) return null;
                const bin = atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                return bytes.buffer;
              } catch (_) { return null; }
            })()
          : null;
        if (shared.parseGsubFeatureTags && ab) {
          openTypeFeatures = shared.parseGsubFeatureTags(ab) || [];
        }
      } catch (_) {
        // GSUB parsing failure is non-fatal — font still loads fine without OT feature list
        openTypeFeatures = [];
      }
      return {
        dataUrl,
        format,
        id,
        name,
        originalFileName,
        uploadedAt: Date.now(),
        openTypeFeatures
      };
    });
  }

  function applyTheme(theme) {
    const c = "theme-" + theme;
    ["theme-system", "theme-light", "theme-dark"].forEach((cls) => {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    });
    document.documentElement.classList.add(c);
    document.body.classList.add(c);
    // CSS uses [data-theme="dark"] / [data-theme="light"] selectors
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    if (elements.themeSelect) elements.themeSelect.value = theme;
  }

  // Create a full font record from an already-fetched data URL (used by URL import).
  // Mirrors fileToFontRecord but starts from a data URL instead of a File object.
  function dataUrlToFontRecord(dataUrl, name) {
    // Detect format from MIME type embedded in the data URL
    var mime = "";
    try { mime = dataUrl.substring(5, dataUrl.indexOf(";")); } catch (_) {}
    var formatMap = {
      "font/woff2": "woff2", "font/woff": "woff",
      "font/ttf": "truetype", "font/otf": "opentype",
      "application/font-woff2": "woff2", "application/font-woff": "woff",
      "application/x-font-ttf": "truetype", "application/x-font-otf": "opentype",
    };
    var format = formatMap[mime]
      || (dataUrl.includes("woff2") ? "woff2"
        : dataUrl.includes("/woff") ? "woff"
        : dataUrl.includes("ttf")   ? "truetype" : "opentype");

    // Parse OT features from base64 data (same logic as fileToFontRecord)
    var openTypeFeatures = [];
    try {
      var b64 = dataUrl.split(",")[1];
      if (b64 && shared.parseGsubFeatureTags) {
        var bin = atob(b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        openTypeFeatures = shared.parseGsubFeatureTags(bytes.buffer) || [];
      }
    } catch (_) { openTypeFeatures = []; }

    var displayName = (name || "Imported Font").trim();
    return {
      dataUrl,
      format,
      id: shared.makeFontId(),
      name: displayName,
      originalFileName: displayName + "." + format,
      uploadedAt: Date.now(),
      openTypeFeatures,
    };
  }

  popup.msg = msg;
  popup.applyTheme = applyTheme;
  popup.getLocalizedTargetSummary = getLocalizedTargetSummary;
  popup.getSortedFontRecords = getSortedFontRecords;
  popup.setStatus = setStatus;
  popup.parseOptionalNumber = parseOptionalNumber;
  popup.parseOptionalWeight = parseOptionalWeight;
  popup.clampNumber = clampNumber;
  popup.readFileAsDataUrl = readFileAsDataUrl;
  popup.fileToFontRecord = fileToFontRecord;
  popup.dataUrlToFontRecord = dataUrlToFontRecord;
})();
