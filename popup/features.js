(function () {
  "use strict";
  globalThis.__fontPluginStage = "features";
  const shared = globalThis.FontPluginShared;
  const popup = globalThis.FontPluginPopup;
  const state = popup.state;
  const elements = popup.elements;

  // ═══════════════════════════════════════
  // 1. HISTORY / UNDO-REDO SYSTEM
  // ═══════════════════════════════════════
  const undoRedoManager = {
    history: [],
    currentIndex: -1,
    maxStackSize: 50,

    addState(stateSnapshot) {
      this.history = this.history.slice(0, this.currentIndex + 1);
      this.history.push(JSON.parse(JSON.stringify(stateSnapshot)));
      this.currentIndex++;
      if (this.history.length > this.maxStackSize) {
        this.history.shift();
        this.currentIndex--;
      }
      this.updateButtons();
    },

    undo() {
      if (this.currentIndex > 0) {
        this.currentIndex--;
        return this.history[this.currentIndex];
      }
      return null;
    },

    redo() {
      if (this.currentIndex < this.history.length - 1) {
        this.currentIndex++;
        return this.history[this.currentIndex];
      }
      return null;
    },

    canUndo() {
      return this.currentIndex > 0;
    },

    canRedo() {
      return this.currentIndex < this.history.length - 1;
    },

    updateButtons() {
      const undoBtn = document.getElementById("undoButton");
      const redoBtn = document.getElementById("redoButton");
      if (undoBtn) undoBtn.disabled = !this.canUndo();
      if (redoBtn) redoBtn.disabled = !this.canRedo();
    },

    clear() {
      this.history = [];
      this.currentIndex = -1;
      this.updateButtons();
    }
  };

  // ═══════════════════════════════════════
  // 2. KEYBOARD SHORTCUTS FOR FAVORITES
  // ═══════════════════════════════════════
  const shortcutsManager = {
    initialized: false,

    init() {
      if (this.initialized) return;
      document.addEventListener("keydown", (e) => this.handleKeydown(e));
      this.initialized = true;
    },

    handleKeydown(e) {
      if (!state.selectedFontId || !state.supportedPage) return;

      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      // Alt/Cmd + Number to switch between recent fonts
      if ((e.altKey || cmdKey) && !e.shiftKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const num = parseInt(e.key);
        const fontIndex = num === 0 ? 9 : num - 1;
        const recent = [state.selectedFontId, ...state.recentFontIds.filter((id) => id !== state.selectedFontId)].slice(0, 10);

        if (fontIndex < recent.length && state.fonts[recent[fontIndex]]) {
          state.selectedFontId = recent[fontIndex];
          if (elements.fontSelect) {
            elements.fontSelect.value = state.selectedFontId;
          }
          popup.render();
          popup.setStatus(`Font switched to ${state.fonts[state.selectedFontId].family || "unknown"}`, true);
        }
      }
    }
  };

  // ═══════════════════════════════════════
  // 3. ACCESSIBILITY CHECKER
  // ═══════════════════════════════════════
  const accessibilityChecker = {
    // WCAG AA minimum contrast ratio
    minContrastRatio: 4.5,

    async checkContrast(foreground, background) {
      const fg = this.hexToRgb(foreground);
      const bg = this.hexToRgb(background);

      if (!fg || !bg) return null;

      const contrast = this.calculateContrast(fg, bg);
      const passed = contrast >= this.minContrastRatio;

      return {
        ratio: contrast.toFixed(2),
        passed,
        level: contrast >= 7 ? "AAA" : contrast >= 4.5 ? "AA" : "Failed"
      };
    },

    calculateContrast(rgb1, rgb2) {
      const l1 = this.calculateLuminance(rgb1);
      const l2 = this.calculateLuminance(rgb2);
      const lighter = Math.max(l1, l2);
      const darker = Math.min(l1, l2);
      return (lighter + 0.05) / (darker + 0.05);
    },

    calculateLuminance(rgb) {
      const [r, g, b] = rgb.map((c) => {
        c = c / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    },

    hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
        : null;
    },

    getColors() {
      const fg = (document.getElementById("accFgInput") || {}).value || "#0E0E0C";
      const bg = (document.getElementById("accBgInput") || {}).value || "#FAFAF6";
      return { fg, bg };
    },

    syncSwatches() {
      const { fg, bg } = this.getColors();
      const fgSwatch = document.getElementById("accFgSwatch");
      const bgSwatch = document.getElementById("accBgSwatch");
      const band  = document.getElementById("accPreviewBand");
      const text  = document.getElementById("accPreviewText");
      if (fgSwatch && this.hexToRgb(fg)) fgSwatch.style.background = fg;
      if (bgSwatch && this.hexToRgb(bg)) bgSwatch.style.background = bg;
      if (band  && this.hexToRgb(bg)) band.style.background = bg;
      if (text  && this.hexToRgb(fg)) text.style.color = fg;
      // Apply current font to preview text
      if (text && state.selectedFontId && state.fonts[state.selectedFontId]) {
        const fontRec = state.fonts[state.selectedFontId];
        text.style.fontFamily = '"' + fontRec.name + '", system-ui, sans-serif';
      }
    },

    autoFill() {
      const fgIn = document.getElementById("accFgInput");
      const bgIn = document.getElementById("accBgInput");
      if (fgIn) fgIn.value = (elements.textColorInput && elements.textColorInput.value) || "#0E0E0C";
      // Detect popup's current --paper CSS variable as background
      const computedBg = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
      if (bgIn) bgIn.value = computedBg && computedBg.startsWith("#") ? computedBg : "#FAFAF6";
      this.syncSwatches();
    },

    setBadge(id, pass, label) {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = pass ? "Pass" : "Fail";
      el.className = "acc-result-badge " + (pass ? "acc-pass" : "acc-fail");
    },

    calcReadabilityScore(typo, contrast) {
      let score = 100;
      const issues = [];
      const recs = [];   // { label, key, value } — apply-able recommendations

      // ── Font size ──
      const sizePx = (typo && typo.fontSizePx != null) ? typo.fontSizePx : null;
      if (sizePx !== null) {
        if      (sizePx < 11)            { score -= 25; issues.push({ sev: "warn", txt: "Font too small (" + sizePx + "px) — unreadable for most users" }); recs.push({ label: "Set size to 16px", key: "fontSizePx", value: 16 }); }
        else if (sizePx < 14)            { score -= 12; issues.push({ sev: "info", txt: "Font size " + sizePx + "px — consider 16–18px for body text" }); recs.push({ label: "Set size to 16px", key: "fontSizePx", value: 16 }); }
        else if (sizePx >= 15 && sizePx <= 20) { score +=  0; issues.push({ sev: "ok",   txt: "Good body size (" + sizePx + "px)" }); }
        else if (sizePx > 28)            {               issues.push({ sev: "info", txt: "Large size (" + sizePx + "px) — ok for headings, check body text" }); }
      }

      // ── Line height ──
      const lh = (typo && typo.lineHeight != null) ? typo.lineHeight : null;
      if (lh !== null) {
        if      (lh < 1.2)              { score -= 18; issues.push({ sev: "warn", txt: "Line height " + lh + " too tight — text lines merge visually" }); recs.push({ label: "Set line-height to 1.5", key: "lineHeight", value: 1.5 }); }
        else if (lh < 1.35)             { score -= 8;  issues.push({ sev: "info", txt: "Line height " + lh + " — slightly tight, try 1.4+" }); recs.push({ label: "Set line-height to 1.5", key: "lineHeight", value: 1.5 }); }
        else if (lh >= 1.4 && lh <= 1.65) {            issues.push({ sev: "ok",   txt: "Optimal line height (" + lh + ")" }); }
        else if (lh > 2.0)              { score -= 8;  issues.push({ sev: "info", txt: "Very loose line height (" + lh + ") — may feel disconnected" }); recs.push({ label: "Set line-height to 1.5", key: "lineHeight", value: 1.5 }); }
      } else {
        issues.push({ sev: "info", txt: "Line height not set — recommend 1.4–1.6 for body text" });
        recs.push({ label: "Set line-height to 1.5", key: "lineHeight", value: 1.5 });
      }

      // ── Letter spacing ──
      const ls = (typo && typo.letterSpacingEm != null) ? typo.letterSpacingEm : 0;
      if      (ls < -0.05)             { score -= 10; issues.push({ sev: "warn", txt: "Tight letter-spacing (" + ls + "em) — reduces legibility" }); recs.push({ label: "Set letter-spacing to 0", key: "letterSpacingEm", value: 0 }); }
      else if (ls > 0.12 && sizePx && sizePx < 16) {  issues.push({ sev: "info", txt: "Wide letter-spacing at small size — ok for headers only" }); }

      // ── Contrast ──
      if      (contrast < 3.0)         { score -= 25; issues.push({ sev: "warn", txt: "Very low contrast (" + contrast.toFixed(1) + ":1) — fails WCAG AA/AAA" }); }
      else if (contrast < 4.5)         { score -= 15; issues.push({ sev: "info", txt: "Passes large text only (" + contrast.toFixed(1) + ":1) — WCAG AA needs 4.5:1" }); }
      else if (contrast >= 7.0)        {              issues.push({ sev: "ok",   txt: "Excellent contrast (" + contrast.toFixed(1) + ":1) — WCAG AAA ✓" }); }
      else                             {              issues.push({ sev: "ok",   txt: "Good contrast (" + contrast.toFixed(1) + ":1) — WCAG AA ✓" }); }

      // ── Font weight ──
      const fw = typo && typo.fontWeight;
      if      (fw && fw <= 200)        { score -= 10; issues.push({ sev: "warn", txt: "Very thin weight (" + fw + ") — stroke contrast becomes critical" }); }
      else if (fw && fw >= 900)        {              issues.push({ sev: "info", txt: "Heavy weight (" + fw + ") — works well for display/headings" }); }

      // ── Text transform ──
      if (typo && typo.textTransform === "uppercase") { score -= 5; issues.push({ sev: "info", txt: "All-caps slows reading by ~10% — use sparingly" }); }

      score = Math.max(0, Math.min(100, score));
      let grade;
      if      (score >= 90) grade = { label: "Excellent", cls: "rd-grade-a" };
      else if (score >= 75) grade = { label: "Good",      cls: "rd-grade-b" };
      else if (score >= 55) grade = { label: "Fair",      cls: "rd-grade-c" };
      else                  grade = { label: "Poor",      cls: "rd-grade-d" };

      return { score, grade, issues, recs };
    },

    async displayCheck() {
      const { fg, bg } = this.getColors();
      this.syncSwatches();
      const result = await this.checkContrast(fg, bg);
      if (!result) return;
      const ratio = parseFloat(result.ratio);

      const ratioEl = document.getElementById("accRatioVal");
      if (ratioEl) {
        ratioEl.textContent = ratio.toFixed(2) + ":1";
        ratioEl.className = "acc-result-val " + (ratio >= 4.5 ? "acc-pass" : ratio >= 3 ? "acc-warn" : "acc-fail");
      }
      this.setBadge("accNormalBadge", ratio >= 4.5);
      this.setBadge("accLargeBadge",  ratio >= 3.0);
      this.setBadge("accAAABadge",    ratio >= 7.0);

      // ── Readability score + recommendations ──
      const hintsEl = document.getElementById("accHints");
      if (!hintsEl) return;
      const typo = (state.draftSetting && state.draftSetting.typography) ? state.draftSetting.typography : {};
      const rd = this.calcReadabilityScore(typo, ratio);

      const sevCls = { ok: "acc-hint-ok", warn: "acc-hint-warn", info: "acc-hint-info" };
      let html = '<div class="rd-score-row">'
        + '<span class="rd-label">Readability</span>'
        + '<span class="rd-bar-wrap"><span class="rd-bar" style="width:' + rd.score + '%"></span></span>'
        + '<span class="rd-grade ' + rd.grade.cls + '">' + rd.grade.label + ' (' + rd.score + ')</span>'
        + '</div>';

      html += rd.issues.map(function(h) {
        return '<p class="acc-hint ' + (sevCls[h.sev] || "acc-hint-info") + '">' + h.txt + '</p>';
      }).join("");

      // Apply-able recommendations
      if (rd.recs.length > 0) {
        html += '<div class="rd-recs">';
        rd.recs.forEach(function(rec) {
          html += '<button type="button" class="rd-rec-btn" data-key="' + rec.key + '" data-value="' + rec.value + '">' + rec.label + '</button>';
        });
        html += '</div>';
      }

      hintsEl.innerHTML = html;

      // Wire up recommendation buttons
      hintsEl.querySelectorAll(".rd-rec-btn").forEach(function(btn) {
        btn.addEventListener("click", function() {
          const key = btn.getAttribute("data-key");
          const val = parseFloat(btn.getAttribute("data-value"));
          if (!state.draftSetting.typography) return;
          state.draftSetting.typography[key] = isNaN(val) ? null : val;
          // Sync to UI input if present
          const inputMap = {
            fontSizePx:      document.getElementById("fontSizeInput"),
            lineHeight:      document.getElementById("lineHeightInput"),
            letterSpacingEm: document.getElementById("letterSpacingInput")
          };
          if (inputMap[key]) { inputMap[key].value = isNaN(val) || val === 0 ? "" : val; }
          if (typeof popup.handleTypographyInput === "function") popup.handleTypographyInput();
          else if (typeof popup.scheduleLiveApply === "function") popup.scheduleLiveApply();
          // Re-run check after applying
          setTimeout(function() { accessibilityChecker.displayCheck(); }, 300);
        });
      });
    }
  };

  // Wire up live accessibility inputs
  (function() {
    function onColorChange() {
      accessibilityChecker.syncSwatches();
    }
    var fgIn = document.getElementById("accFgInput");
    var bgIn = document.getElementById("accBgInput");
    var autoBtn = document.getElementById("accAutoFillBtn");
    if (fgIn) fgIn.addEventListener("input", onColorChange);
    if (bgIn) bgIn.addEventListener("input", onColorChange);
    if (autoBtn) autoBtn.addEventListener("click", function() { accessibilityChecker.autoFill(); });
    // Initial swatch sync
    accessibilityChecker.syncSwatches();
  })();

  // ═══════════════════════════════════════
  // 4. PRESETS / STYLE COLLECTIONS
  // ═══════════════════════════════════════
  const presetsManager = {
    async loadPresets() {
      const stored = await chrome.storage.local.get("presets");
      return stored.presets || {};
    },

    async savePreset(name, typographyData) {
      const presets = await this.loadPresets();
      presets[name] = {
        typography: typographyData,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      await chrome.storage.local.set({ presets });
      return name;
    },

    async deletePreset(name) {
      const presets = await this.loadPresets();
      delete presets[name];
      await chrome.storage.local.set({ presets });
    },

    async applyPreset(name) {
      const presets = await this.loadPresets();
      const preset = presets[name];
      if (!preset) return false;

      const { typography } = preset;
      if (typography.fontSizePx != null && elements.fontSizeInput) {
        elements.fontSizeInput.value = typography.fontSizePx;
      }
      if (typography.fontWeight && elements.fontWeightSelect) {
        elements.fontWeightSelect.value = typography.fontWeight || "";
      }
      if (typography.lineHeight && elements.lineHeightInput) {
        elements.lineHeightInput.value = typography.lineHeight;
      }
      if (typography.letterSpacingEm && elements.letterSpacingInput) {
        elements.letterSpacingInput.value = typography.letterSpacingEm;
      }
      if (typography.wordSpacingEm && elements.wordSpacingInput) {
        elements.wordSpacingInput.value = typography.wordSpacingEm;
      }
      if (typography.textColor && elements.textColorInput) {
        elements.textColorInput.value = typography.textColor;
      }

      popup.render();
      return true;
    }
  };

  // ═══════════════════════════════════════
  // 5. FONT PAIRS (HEADING + BODY)
  // ═══════════════════════════════════════
  const fontPairsManager = {
    // Populate both pair font selects with the current font library
    populateSelects() {
      const headingSel = document.getElementById("pairHeadingFont");
      const bodySel    = document.getElementById("pairBodyFont");
      if (!headingSel || !bodySel) return;

      const fonts = state.fonts || {};
      const ids = Object.keys(fonts);

      [headingSel, bodySel].forEach(function(sel) {
        const prevVal = sel.value;
        sel.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "— none —";
        sel.appendChild(placeholder);
        ids.forEach(function(id) {
          const opt = document.createElement("option");
          opt.value = id;
          opt.textContent = fonts[id].name || id;
          sel.appendChild(opt);
        });
        if (prevVal && fonts[prevVal]) sel.value = prevVal;
      });
    },

    // Apply heading + body font to current site using the multi-rule architecture
    async applyCurrentPair() {
      const headingSel = document.getElementById("pairHeadingFont");
      const bodySel    = document.getElementById("pairBodyFont");
      if (!headingSel || !bodySel) return false;

      const headingId = headingSel.value;
      const bodyId    = bodySel.value;
      if (!headingId && !bodyId) return false;

      const hostname = state.currentHostname;
      if (!hostname) return false;

      const stored = await chrome.storage.local.get("siteSettings");
      const siteSettings = stored.siteSettings || {};

      const rules = [];
      if (headingId && state.fonts[headingId]) {
        rules.push(shared.normalizeSiteSetting({
          enabled: true,
          fontId: headingId,
          targetMode: shared.TARGET_MODES.HEADINGS,
          targetSelector: "",
          targetSelectorFallback: "",
          targetLabel: "",
          textOnly: false,
          updatedAt: Date.now()
        }));
      }
      if (bodyId && state.fonts[bodyId]) {
        rules.push(shared.normalizeSiteSetting({
          enabled: true,
          fontId: bodyId,
          targetMode: shared.TARGET_MODES.PAGE,
          targetSelector: "",
          targetSelectorFallback: "",
          targetLabel: "",
          textOnly: false,
          updatedAt: Date.now()
        }));
      }

      siteSettings[hostname] = { enabled: true, rules: rules, updatedAt: Date.now() };
      await chrome.storage.local.set({ siteSettings: siteSettings });
      return true;
    },

    // Clear the font pair for the current site (restore to single-rule mode)
    async clearPair() {
      const hostname = state.currentHostname;
      if (!hostname) return;
      const stored = await chrome.storage.local.get("siteSettings");
      const siteSettings = stored.siteSettings || {};
      delete siteSettings[hostname];
      await chrome.storage.local.set({ siteSettings: siteSettings });
    }
  };

  // ═══════════════════════════════════════
  // 6. ENHANCED PICK ON PAGE
  // ═══════════════════════════════════════
  const enhancedPicker = {
    enabled: false,
    originalElement: null,
    overlayStyles: `
      .font-picker-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        cursor: crosshair;
      }
      .font-picker-highlight {
        outline: 2px solid #ff6b35;
        outline-offset: 2px;
        background-color: rgba(255, 107, 53, 0.1) !important;
        box-shadow: 0 0 0 4px rgba(255, 107, 53, 0.2);
      }
      .font-picker-info {
        position: fixed;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 12px;
        z-index: 2147483648;
        pointer-events: none;
        max-width: 400px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
    `,

    init() {
      this.injectStyles();
    },

    injectStyles() {
      if (document.getElementById("font-picker-styles")) return;
      const style = document.createElement("style");
      style.id = "font-picker-styles";
      style.textContent = this.overlayStyles;
      document.head.appendChild(style);
    },

    enable() {
      this.enabled = true;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "startElementPicker" });
        }
      });
    },

    disable() {
      this.enabled = false;
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "stopElementPicker" });
        }
      });
    }
  };

  // ═══════════════════════════════════════
  // 7. PLUGIN PERSISTENCE
  // ═══════════════════════════════════════
  const persistenceManager = {
    // Prevent auto-closing by tracking user interactions
    hasUserInteraction: false,
    inactivityTimeout: null,
    inactivityDuration: 30000, // 30 seconds

    init() {
      document.addEventListener("mousedown", () => {
        this.hasUserInteraction = true;
        this.resetInactivityTimer();
      });
      document.addEventListener("keydown", () => {
        this.hasUserInteraction = true;
        this.resetInactivityTimer();
      });
    },

    resetInactivityTimer() {
      clearTimeout(this.inactivityTimeout);
      this.inactivityTimeout = setTimeout(() => {
        this.hasUserInteraction = false;
      }, this.inactivityDuration);
    },

    shouldKeepOpen() {
      return this.hasUserInteraction;
    }
  };

  // ═══════════════════════════════════════
  // EXPORT MANAGERS
  // ═══════════════════════════════════════
  popup.undoRedoManager = undoRedoManager;
  popup.shortcutsManager = shortcutsManager;
  popup.accessibilityChecker = accessibilityChecker;
  popup.presetsManager = presetsManager;
  popup.fontPairsManager = fontPairsManager;
  popup.enhancedPicker = enhancedPicker;
  popup.persistenceManager = persistenceManager;

  globalThis.FontPluginFeatures = {
    undoRedoManager,
    shortcutsManager,
    accessibilityChecker,
    presetsManager,
    fontPairsManager,
    enhancedPicker,
    persistenceManager
  };
})();
