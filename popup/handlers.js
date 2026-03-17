(function () {
  "use strict";
  globalThis.__fontPluginStage = "handlers";
  const shared = globalThis.FontPluginShared;
  const popup = globalThis.FontPluginPopup;
  const state = popup.state;
  const elements = popup.elements;
  const msg = popup.msg;
  const setStatus = popup.setStatus;
  const getSortedFontRecords = popup.getSortedFontRecords;
  const getActiveSiteSetting = popup.getActiveSiteSetting;
  const loadStoredState = popup.loadStoredState;
  // renderSitesList is defined in render.js which loads AFTER handlers.js,
  // so we must call it via popup.renderSitesList() at runtime, not capture it here.
  function renderSitesList() { if (typeof popup.renderSitesList === "function") popup.renderSitesList(); }
  const applyTheme = popup.applyTheme;
  const fileToFontRecord = popup.fileToFontRecord;
  const parseOptionalNumber = popup.parseOptionalNumber;
  const parseOptionalWeight = popup.parseOptionalWeight;
  const clampNumber = popup.clampNumber;
  const STORAGE_WARN_BYTES = popup.STORAGE_WARN_BYTES;
  let sitesRenderTimer = null;

  function scheduleSitesListRender() {
    if (sitesRenderTimer) clearTimeout(sitesRenderTimer);
    sitesRenderTimer = setTimeout(() => {
      sitesRenderTimer = null;
      if (state.activeTab !== "sites") return;
      const run = () => {
        if (state.activeTab === "sites") renderSitesList();
      };
      if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 300 });
      else setTimeout(run, 0);
    }, 260);
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    const panels = [elements.panelInspect, elements.panelUpload, elements.panelApply, elements.panelSites];
    const tabs   = [elements.tabInspect, elements.tabUpload, elements.tabApply, elements.tabSites];
    const tabIds = ["inspect", "upload", "apply", "sites"];

    const nextPanel = panels[tabIds.indexOf(tabId)];
    // Find currently visible panel: has .active class (not hidden, not leaving)
    const curPanel  = panels.find(p => p && p.classList.contains("active") && !p.classList.contains("leave"));

    // ── Animate out current panel — mirrors preview's switchTab exactly ──
    if (curPanel && curPanel !== nextPanel) {
      curPanel.classList.remove("active");
      curPanel.classList.add("leave");
      // After leave animation (160ms) completes: set hidden and clean up class
      setTimeout(() => {
        curPanel.classList.remove("leave");
        curPanel.hidden = true;
      }, 320); // slight extra buffer matches preview's 320ms timeout
    }

    // ── Animate in next panel ──
    if (nextPanel) {
      nextPanel.classList.remove("leave");
      nextPanel.hidden = false;
      // Only trigger reflow + animation when the panel isn't already active
      // (render() calls switchTab on every update — skip reflow when tab unchanged)
      if (!nextPanel.classList.contains("active")) {
        void nextPanel.offsetWidth; // force reflow so CSS animation restarts cleanly
        nextPanel.classList.add("active");
      }
    }

    // Update tab aria states and .active class (for dual CSS support)
    tabs.forEach((tab, i) => {
      if (!tab) return;
      const isActive = tabIds[i] === tabId;
      tab.setAttribute("aria-selected", String(isActive));
      tab.classList.toggle("active", isActive);
    });

    // Defer heavy DOM ops — don't thrash layout during animation
    if (tabId === "sites")  scheduleSitesListRender();
    if (tabId === "upload") setTimeout(() => popup.updatePreview(state.selectedFontId ? state.fonts[state.selectedFontId] : null), 170);
  }

  function scheduleLiveApply() {
    clearTimeout(popup.liveApplyTimer);
    popup.liveApplyTimer = setTimeout(doLiveApply, 400);
  }

  async function applyCurrentDraft(options) {
    const silent = options && options.silent;
    if (!state.supportedPage || !state.currentHostname || !state.selectedFontId) return false;
    if (state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && !state.draftSetting.targetSelector) return false;
    const updatedActiveRule = shared.normalizeSiteSetting({
      ...state.draftSetting,
      enabled: true,
      fontId: state.selectedFontId,
      updatedAt: Date.now()
    });
    // Build full rules array — replace only the active slot
    const rules = state.siteRules.length === 0
      ? [updatedActiveRule]
      : state.siteRules.map((r, i) => i === state.activeRuleIdx
          ? updatedActiveRule
          : shared.normalizeSiteSetting({ ...r, enabled: true }));
    state.siteRules = rules;
    state.draftSetting = { ...updatedActiveRule };
    const nextSiteSettings = {
      ...state.siteSettings,
      [state.currentHostname]: { enabled: true, updatedAt: Date.now(), rules }
    };
    state.siteSettings = nextSiteSettings;
    const recent = [state.selectedFontId, ...state.recentFontIds.filter((id) => id !== state.selectedFontId)].slice(0, 5);
    state.recentFontIds = recent;
    await chrome.storage.local.set({ siteSettings: nextSiteSettings, recentFontIds: recent });
    await refreshCurrentTab();
    if (!silent) {
      setStatus(msg("statusApplied", [state.currentHostname]), true);
      elements.applyButton.classList.add("apply-button-success");
      setTimeout(() => {
        elements.applyButton.classList.remove("apply-button-success");
        elements.statusMessage.classList.remove("is-success");
        elements.statusMessage.textContent = "";
      }, 2200);
    }
    popup.render();
    return true;
  }

  async function autoApplyIfUnset() {
    if (!state.supportedPage || !state.currentHostname || !state.selectedFontId) return false;
    if (state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && !state.draftSetting.targetSelector) return false;
    const current = state.siteSettings[state.currentHostname];
    if (current && typeof current.enabled === "boolean") {
      if (current.enabled) await refreshCurrentTab();
      return false;
    }
    if (state.globalOverride && state.globalOverride.enabled) {
      await refreshCurrentTab();
      return false;
    }
    return applyCurrentDraft({ silent: true });
  }

  async function doLiveApply() {
    if (!state.supportedPage || !state.currentHostname || !state.selectedFontId) return;
    if (state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && !state.draftSetting.targetSelector) return;
    const site = state.siteSettings[state.currentHostname];
    if (!site || !site.enabled) return;
    try {
      const updatedActiveRule = shared.normalizeSiteSetting({
        ...state.draftSetting,
        enabled: true,
        fontId: state.selectedFontId,
        updatedAt: Date.now()
      });
      const rules = state.siteRules.length === 0
        ? [updatedActiveRule]
        : state.siteRules.map((r, i) => i === state.activeRuleIdx
            ? updatedActiveRule
            : shared.normalizeSiteSetting({ ...r, enabled: true }));
      const nextSiteSettings = {
        ...state.siteSettings,
        [state.currentHostname]: { enabled: true, updatedAt: Date.now(), rules }
      };
      state.siteSettings = nextSiteSettings;
      await chrome.storage.local.set({ siteSettings: nextSiteSettings });
      await refreshCurrentTab();
    } catch (_) {}
  }

  async function refreshCurrentTab() {
    if (!state.supportedPage || state.currentTabId === null) return;
    await ensureCurrentTabScripts();
    await chrome.scripting.executeScript({
      target: { tabId: state.currentTabId, allFrames: false },
      func: () => {
        if (globalThis.FontPluginRuntime && typeof globalThis.FontPluginRuntime.refresh === "function") {
          globalThis.FontPluginRuntime.refresh();
        }
      }
    });
  }

  async function sendMessageToCurrentTab(message) {
    if (state.currentTabId === null) throw new Error("No active tab");
    try {
      return await chrome.tabs.sendMessage(state.currentTabId, message);
    } catch (error) {
      await ensureCurrentTabScripts();
      return chrome.tabs.sendMessage(state.currentTabId, message);
    }
  }

  async function ensureCurrentTabScripts() {
    if (!state.supportedPage || state.currentTabId === null) return;
    await chrome.scripting.executeScript({
      target: { tabId: state.currentTabId, allFrames: false },
      files: ["shared.js", "content.js"]
    });
  }

  async function stopPickerIfRunning() {
    if (!state.supportedPage || state.currentTabId === null) return;
    try {
      await sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.STOP_PICKER });
    } catch (_) {}
  }

  function handleStorageChange(changes, areaName) {
    if (areaName !== "local") return;
    if (!changes.fonts && !changes.siteSettings && !changes.theme && !changes.recentFontIds && !changes.favoriteFontIds && !changes.defaultTypography && !changes.targetNotFoundHosts && !changes.showPageBadge && !changes.globalOverride && !changes.sitesSortBy) return;
    loadStoredState().then(() => { populatePairSelects(); popup.render(); }).catch(() => setStatus(msg("statusCouldNotRefresh")));
  }

  async function handleShowPageBadgeChange() {
    const show = !!elements.showPageBadgeCheckbox.checked;
    state.showPageBadge = show;
    await chrome.storage.local.set({ showPageBadge: show });
    if (state.currentHostname) await refreshCurrentTab();
  }

  // Remove all page fonts from memory (they are never in storage, so no storage write needed).
  // Page fonts are ephemeral — scoped to the hostname where they were captured.
  function purgeStalePageFonts() {
    const currentHostname = state.currentHostname;
    const next = {};
    let changed = false;
    Object.entries(state.fonts).forEach(function([id, r]) {
      // Any pageFont that belongs to a different site (or has no hostname) is dropped immediately.
      const isStale = r.pageFont && r.pageFontHostname !== currentHostname;
      if (isStale) { changed = true; }
      else { next[id] = r; }
    });
    if (!changed) return;
    state.fonts = next;
    // No storage update — page fonts were never written there.
  }

  async function init() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      state.currentTabId = activeTab && typeof activeTab.id === "number" ? activeTab.id : null;
      state.currentTabUrl = activeTab && activeTab.url ? activeTab.url : "";
      state.currentHostname = shared.getHostnameFromUrl(state.currentTabUrl);
      state.supportedPage = shared.isSupportedPageUrl(state.currentTabUrl);
      await loadStoredState();
      purgeStalePageFonts();
      // Only refresh the tab if this site already has an override enabled —
      // never silently apply a font to a site the user hasn't explicitly opted in to.
      if (state.currentHostname && state.siteSettings[state.currentHostname] && state.siteSettings[state.currentHostname].enabled) {
        await refreshCurrentTab();
      } else if (state.globalOverride && state.globalOverride.enabled) {
        await refreshCurrentTab();
      }
      // Always open Inspect first — unless user has no fonts, then show Upload
      state.activeTab = Object.keys(state.fonts).length === 0 ? "upload" : "inspect";
      // Resume any leftover before/after pause from previous session
      state.previewPaused = false;
      sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.RESUME_PREVIEW }).catch(() => {});
    } catch (e) {
      if (typeof popup.applyTheme === "function") popup.applyTheme(state.theme || "system");
      setStatus(msg("statusCouldNotRefresh") || "Could not load state");
    }
    if (typeof popup.render === "function") popup.render();
  }

  async function handleOverrideToggle() {
    if (!state.currentHostname) return;
    const enabled = elements.overrideCheckbox.checked;
    const current = state.siteSettings[state.currentHostname] || {};
    // Propagate enabled flag into each rule — getSiteRules() reads rule.enabled,
    // not the top-level enabled, so both must stay in sync.
    const updatedRules = Array.isArray(current.rules) && current.rules.length > 0
      ? current.rules.map((r) => ({ ...r, enabled }))
      : undefined;
    const nextEntry = updatedRules
      ? { ...current, enabled, updatedAt: Date.now(), rules: updatedRules }
      : { ...current, enabled, updatedAt: Date.now() };
    const nextSiteSettings = { ...state.siteSettings, [state.currentHostname]: nextEntry };
    state.siteSettings = nextSiteSettings;
    // Also update in-memory siteRules so render() reflects the change immediately
    state.siteRules = shared.getSiteRules(state.currentHostname, nextSiteSettings);
    await chrome.storage.local.set({ siteSettings: nextSiteSettings });
    await refreshCurrentTab();
    setStatus(enabled ? msg("statusOverrideOn") : msg("statusOverrideOff"));
    popup.render();
  }

  function handleThemeChange() {
    const theme = elements.themeSelect.value;
    state.theme = theme;
    applyTheme(theme);
    chrome.storage.local.set({ theme }).catch(() => {});
  }

  function handleFavoriteClick() {
    const id = state.selectedFontId;
    if (!id) return;
    const idx = state.favoriteFontIds.indexOf(id);
    const next = idx === -1 ? [...state.favoriteFontIds, id] : state.favoriteFontIds.filter((f) => f !== id);
    state.favoriteFontIds = next;
    chrome.storage.local.set({ favoriteFontIds: next }).catch(() => {});
    popup.render();
  }

  function handleSaveAsDefault() {
    state.defaultTypography = {
      fontSizePx: state.draftSetting.typography.fontSizePx ?? null,
      lineHeight: state.draftSetting.typography.lineHeight,
      letterSpacingEm: state.draftSetting.typography.letterSpacingEm,
      fontWeight: state.draftSetting.typography.fontWeight,
      fontFeatureSettings: state.draftSetting.fontFeatureSettings || "",
      fontStyle: state.draftSetting.typography.fontStyle || "normal",
      wordSpacingEm: state.draftSetting.typography.wordSpacingEm ?? 0,
      textTransform: state.draftSetting.typography.textTransform || "none"
    };
    chrome.storage.local.set({ defaultTypography: state.defaultTypography }).catch(() => {});
    setStatus(msg("statusDefaultSaved"));
    popup.render();
  }

  async function handleCopyCss() {
    const fontRecord = state.selectedFontId ? state.fonts[state.selectedFontId] : null;
    if (!fontRecord) { setStatus(msg("statusSelectFontFirst")); return; }
    const setting = shared.normalizeSiteSetting({ ...state.draftSetting, fontId: state.selectedFontId });
    const css = buildExportCss(fontRecord, setting);
    if (!css) { setStatus(msg("statusCouldNotGenerateCss")); return; }
    try {
      await navigator.clipboard.writeText(css);
      setStatus(msg("statusCssCopied"));
    } catch (e) {
      setStatus(msg("statusCouldNotCopy"));
    }
  }

  function buildExportCss(fontRecord, setting) {
    if (!fontRecord) return "";
    const typo = setting.typography || {};
    const familyName = (fontRecord.name || "CustomFont").replace(/"/g, "'");
    // Resolve target selector
    const targetSel = (function() {
      switch (setting.targetMode) {
        case shared.TARGET_MODES.CONTENT:  return "article, main, [role='main']";
        case shared.TARGET_MODES.HEADINGS: return "h1, h2, h3, h4, h5, h6";
        case shared.TARGET_MODES.SELECTOR: return setting.targetSelector || "body";
        default: return "body";
      }
    })();
    const fallback = "system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    const lines = ["/* Generated by Koppl — " + (fontRecord.name || "") + " */"];

    // ── For uploaded fonts: generate full @font-face block ──
    if (fontRecord.dataUrl) {
      const formatFragment = fontRecord.format ? ' format("' + fontRecord.format + '")' : "";
      lines.push("@font-face {");
      lines.push('  font-family: "' + familyName + '";');
      lines.push('  src: url("' + fontRecord.dataUrl + '")' + formatFragment + ";");
      lines.push("  font-display: swap;");
      lines.push("}");
      lines.push("");
    }

    // ── For page fonts: CSS variable approach (no @font-face needed) ──
    if (fontRecord.pageFont && !fontRecord.dataUrl) {
      lines.push(":root {");
      lines.push('  --koppl-font-family: "' + familyName + '";');
      lines.push("}");
      lines.push("");
    }

    // ── Target selector rule (works for both uploaded and page fonts) ──
    lines.push(targetSel + " {");
    lines.push('  font-family: ' + (fontRecord.pageFont && !fontRecord.dataUrl ? "var(--koppl-font-family)" : '"' + familyName + '"') + ", " + fallback + ";");
    if (typo.fontSizePx) lines.push("  font-size: " + typo.fontSizePx + "px;");
    if (typeof typo.lineHeight === "number") lines.push("  line-height: " + typo.lineHeight + ";");
    if (typo.letterSpacingEm) lines.push("  letter-spacing: " + typo.letterSpacingEm + "em;");
    if (typeof typo.fontWeight === "number") lines.push("  font-weight: " + typo.fontWeight + ";");
    if (typo.fontStyle && typo.fontStyle !== "normal") lines.push("  font-style: " + typo.fontStyle + ";");
    if (typo.wordSpacingEm) lines.push("  word-spacing: " + typo.wordSpacingEm + "em;");
    if (typo.textTransform && typo.textTransform !== "none") lines.push("  text-transform: " + typo.textTransform + ";");
    if (typo.textColor) lines.push("  color: " + typo.textColor + ";");
    if (typo.textDecoration && typo.textDecoration !== "none") lines.push("  text-decoration: " + typo.textDecoration + ";");
    if (setting.fontFeatureSettings) lines.push('  font-feature-settings: ' + setting.fontFeatureSettings + ";");
    lines.push("}");
    return lines.join("\n");
  }

  async function handleExport() {
    const data = await chrome.storage.local.get(["fonts", "siteSettings", "theme", "defaultTypography", "recentFontIds", "favoriteFontIds", "showPageBadge", "globalOverride", "sitesSortBy"]);
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      fonts: data.fonts || {},
      siteSettings: data.siteSettings || {},
      theme: data.theme,
      defaultTypography: data.defaultTypography,
      recentFontIds: data.recentFontIds || [],
      favoriteFontIds: data.favoriteFontIds || [],
      showPageBadge: data.showPageBadge,
      globalOverride: data.globalOverride,
      sitesSortBy: data.sitesSortBy
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "font-override-export-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    setStatus(msg("statusExported"));
  }

  async function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    let text;
    try { text = await file.text(); } catch (e) { setStatus(msg("statusCouldNotReadFile")); event.target.value = ""; return; }
    let data;
    try { data = JSON.parse(text); } catch (e) { setStatus(msg("statusInvalidJson")); event.target.value = ""; return; }
    if (data.version !== 1) { setStatus(msg("statusUnsupportedVersion")); event.target.value = ""; return; }
    const current = await chrome.storage.local.get(["fonts", "siteSettings", "theme", "defaultTypography", "recentFontIds", "favoriteFontIds", "showPageBadge", "globalOverride", "sitesSortBy"]);
    const mergedFonts = { ...(current.fonts || {}), ...(data.fonts || {}) };
    const mergedSiteSettings = { ...(current.siteSettings || {}), ...(data.siteSettings || {}) };
    const mergedRecent = [...new Set([...(data.recentFontIds || []), ...(current.recentFontIds || [])])];
    const mergedFavorites = [...new Set([...(data.favoriteFontIds || []), ...(current.favoriteFontIds || [])])];
    await chrome.storage.local.set({
      fonts: mergedFonts,
      siteSettings: mergedSiteSettings,
      theme: data.theme != null ? data.theme : current.theme,
      defaultTypography: data.defaultTypography || current.defaultTypography,
      recentFontIds: mergedRecent,
      favoriteFontIds: mergedFavorites,
      showPageBadge: data.showPageBadge != null ? data.showPageBadge : current.showPageBadge,
      globalOverride: data.globalOverride != null ? data.globalOverride : current.globalOverride,
      sitesSortBy: data.sitesSortBy != null ? data.sitesSortBy : current.sitesSortBy
    });
    await loadStoredState();
    popup.render();
    if (state.activeTab === "sites") renderSitesList();
    setStatus(msg("statusImported", [String(Object.keys(data.fonts || {}).length), String(Object.keys(data.siteSettings || {}).length)]));
    event.target.value = "";
  }

  async function handleSitesSortByChange() {
    const value = elements.sitesSortBy && elements.sitesSortBy.value;
    if (!["domain", "date", "fontName", "recent"].includes(value)) return;
    state.sitesSortBy = value;
    await chrome.storage.local.set({ sitesSortBy: value });
    if (state.activeTab === "sites") renderSitesList();
  }

  function handleCopyFromCurrent() {
    if (!state.currentHostname || !state.siteSettings[state.currentHostname]) return;
    const rules = shared.getSiteRules(state.currentHostname, state.siteSettings);
    state.copiedSiteSetting = rules[0] ? { ...rules[0] } : null;
    if (elements.sitesCopyHint) elements.sitesCopyHint.textContent = msg("copiedPasteBelow");
  }

  async function handlePasteToSite(hostname) {
    if (!state.copiedSiteSetting || !hostname) return;
    const normalized = shared.normalizeSiteSetting({ ...state.copiedSiteSetting, updatedAt: Date.now() });
    const next = { ...state.siteSettings, [hostname]: { enabled: true, updatedAt: Date.now(), rules: [normalized] } };
    state.siteSettings = next;
    await chrome.storage.local.set({ siteSettings: next });
    if (hostname === state.currentHostname) {
      state.draftSetting = { ...normalized, fontId: normalized.fontId || state.selectedFontId };
      await refreshCurrentTab();
    }
    setStatus(msg("statusPasteApplied", [hostname]));
    popup.render();
    if (state.activeTab === "sites") renderSitesList();
  }

  async function handleCleanupUnused() {
    const used = new Set();
    Object.keys(state.siteSettings || {}).forEach((hostname) => {
      shared.getSiteRules(hostname, state.siteSettings).forEach((r) => { if (r.fontId) used.add(r.fontId); });
    });
    if (state.globalOverride && state.globalOverride.enabled && state.globalOverride.fontId) used.add(state.globalOverride.fontId);
    const toRemove = Object.keys(state.fonts).filter((id) => !used.has(id));
    if (toRemove.length === 0) { setStatus(msg("statusNoUnusedFonts")); return; }
    if (!globalThis.confirm(msg("removeUnusedConfirm", [String(toRemove.length)]))) return;
    const nextFonts = { ...state.fonts };
    toRemove.forEach((id) => delete nextFonts[id]);
    state.fonts = nextFonts;
    state.recentFontIds = state.recentFontIds.filter((id) => nextFonts[id]);
    state.favoriteFontIds = state.favoriteFontIds.filter((id) => nextFonts[id]);
    if (!nextFonts[state.selectedFontId]) {
      state.selectedFontId = getSortedFontRecords(nextFonts)[0]?.id || "";
      state.draftSetting.fontId = state.selectedFontId;
    }
    await chrome.storage.local.set({ fonts: nextFonts, recentFontIds: state.recentFontIds, favoriteFontIds: state.favoriteFontIds });
    setStatus(msg("statusRemovedUnused", [String(toRemove.length)]));
    popup.render();
  }

  async function handleGlobalOverrideChange() {
    const enabled = !!elements.globalOverrideCheckbox && elements.globalOverrideCheckbox.checked;
    state.globalOverride = { enabled, fontId: enabled ? (state.selectedFontId || state.globalOverride.fontId) : "" };
    await chrome.storage.local.set({ globalOverride: state.globalOverride });
    if (state.currentHostname) await refreshCurrentTab();
    setStatus(enabled ? msg("statusGlobalOn") : msg("statusGlobalOff"));
    popup.render();
  }

  async function handleUseWholePage() {
    if (!state.currentHostname) return;
    const now = Date.now();
    const updatedDraft = {
      ...state.draftSetting,
      targetMode: shared.TARGET_MODES.PAGE,
      targetSelector: "",
      targetSelectorFallback: "",
      targetLabel: "",
      enabled: true,
      updatedAt: now
    };
    state.draftSetting = updatedDraft;
    // Build the updated rule and wrap in rules[] format (never flatten to legacy)
    const updatedRule = shared.normalizeSiteSetting(updatedDraft);
    const existing = state.siteSettings[state.currentHostname];
    let nextRules;
    if (Array.isArray(existing && existing.rules) && existing.rules.length > 1) {
      // Preserve multi-rule setup — only replace the active slot
      nextRules = existing.rules.map((r, i) => i === state.activeRuleIdx ? updatedRule : r);
    } else {
      nextRules = [updatedRule];
    }
    const nextEntry = { enabled: true, updatedAt: now, rules: nextRules };
    const nextSiteSettings = { ...state.siteSettings, [state.currentHostname]: nextEntry };
    const hosts = { ...state.targetNotFoundHosts };
    delete hosts[state.currentHostname];
    state.siteSettings = nextSiteSettings;
    state.siteRules = shared.getSiteRules(state.currentHostname, nextSiteSettings);
    state.targetNotFoundHosts = hosts;
    await chrome.storage.local.set({ siteSettings: nextSiteSettings, targetNotFoundHosts: hosts });
    await refreshCurrentTab();
    setStatus(msg("statusUseWholePage"));
    popup.render();
  }

  async function handleRepickTarget() {
    if (!state.supportedPage || state.currentTabId === null) return;
    const hosts = { ...state.targetNotFoundHosts };
    delete hosts[state.currentHostname];
    state.targetNotFoundHosts = hosts;
    await chrome.storage.local.set({ targetNotFoundHosts: hosts });
    setStatus("");
    popup.render();
    await handleStartPicker();
  }

  async function handleSiteToggle(hostname, enabled) {
    const current = state.siteSettings[hostname] || {};
    // Propagate the master toggle into each rule so content.js sees consistent state.
    const updatedRules = Array.isArray(current.rules) && current.rules.length > 0
      ? current.rules.map((r) => ({ ...r, enabled }))
      : undefined;
    const nextEntry = updatedRules
      ? { ...current, enabled, updatedAt: Date.now(), rules: updatedRules }
      : { ...current, enabled, updatedAt: Date.now() };
    const next = { ...state.siteSettings, [hostname]: nextEntry };
    state.siteSettings = next;
    if (hostname === state.currentHostname) {
      // Keep in-memory siteRules in sync so render() reflects the change immediately.
      state.siteRules = shared.getSiteRules(hostname, next);
    }
    await chrome.storage.local.set({ siteSettings: next });
    if (hostname === state.currentHostname) await refreshCurrentTab();
    popup.render();
    if (state.activeTab === "sites") renderSitesList();
  }

  async function handleSiteRemove(hostname) {
    const next = { ...state.siteSettings };
    delete next[hostname];
    state.siteSettings = next;
    await chrome.storage.local.set({ siteSettings: next });
    if (hostname === state.currentHostname) {
      state.draftSetting = shared.normalizeSiteSetting({});
      state.draftSetting.fontId = state.selectedFontId;
      await refreshCurrentTab();
    }
    popup.render();
    if (state.activeTab === "sites") renderSitesList();
  }

  function morphPreviewText() {
    const text = document.getElementById("applyPreviewText");
    const detail = document.getElementById("applyPreviewDetail");
    if (!text) return;
    text.classList.add("morphing");
    if (detail) detail.classList.add("morphing");
    setTimeout(function() {
      text.classList.remove("morphing");
      if (detail) detail.classList.remove("morphing");
    }, 300);
  }

  function handleFontSelectionChange(event) {
    morphPreviewText();
    state.selectedFontId = event.target.value;
    state.draftSetting.fontId = state.selectedFontId;
    if (state.globalOverride.enabled && elements.globalOverrideCheckbox && elements.globalOverrideCheckbox.checked) {
      state.globalOverride.fontId = state.selectedFontId;
      chrome.storage.local.set({ globalOverride: state.globalOverride }).catch(() => {});
    }
    // scheduleLiveApply already updates the page if this site has an active override.
    // Do NOT call autoApplyIfUnset here — selecting a font should never silently
    // create an override for a site the user hasn't explicitly opted in to.
    scheduleLiveApply();
    popup.render();
  }

  async function handleTargetModeChange(event) {
    const previousMode = state.draftSetting.targetMode;
    state.draftSetting.targetMode = event.target.value;
    if (previousMode === shared.TARGET_MODES.SELECTOR && state.draftSetting.targetMode !== shared.TARGET_MODES.SELECTOR) {
      await stopPickerIfRunning();
    }
    if (state.draftSetting.targetMode !== shared.TARGET_MODES.SELECTOR) setStatus("");
    else if (!state.draftSetting.targetSelector) setStatus(msg("statusPickElementFirst"));
    scheduleLiveApply();
    popup.render();
  }

  function handleTextOnlyChange(event) {
    state.draftSetting.textOnly = event.target.checked;
    scheduleLiveApply();
    popup.render();
  }

  function handleRelaxLayoutChange(event) {
    state.draftSetting.relaxLayout = event.target.checked;
    scheduleLiveApply();
    popup.render();
  }

  function handleTypographyInput() {
    state.draftSetting.typography = {
      fontSizePx: parseOptionalNumber(elements.fontSizeInput.value, 50, 200),
      lineHeight: parseOptionalNumber(elements.lineHeightInput.value, 0.8, 2.5),
      letterSpacingEm: clampNumber(elements.letterSpacingInput.value, shared.DEFAULT_TYPOGRAPHY.letterSpacingEm, -0.12, 0.3),
      fontWeight: parseOptionalWeight(elements.fontWeightSelect.value),
      fontStyle: elements.fontStyleSelect && /^(normal|italic|oblique)$/i.test(elements.fontStyleSelect.value) ? elements.fontStyleSelect.value : "normal",
      wordSpacingEm: elements.wordSpacingInput ? clampNumber(elements.wordSpacingInput.value, 0, -0.2, 0.5) : 0,
      textColor: elements.textColorInput ? elements.textColorInput.value : null,
      textDecoration: elements.textDecorationSelect ? elements.textDecorationSelect.value : "none",
      textShadow: elements.textShadowSelect ? elements.textShadowSelect.value : "none",
      textOpacity: elements.textOpacityInput ? clampNumber(elements.textOpacityInput.value, 100, 0, 100) : 100,
      textTransform: elements.textTransformSelect && /^(none|uppercase|lowercase|capitalize)$/i.test(elements.textTransformSelect.value) ? elements.textTransformSelect.value : "none"
    };
    scheduleLiveApply();
    popup.render();
  }

  // ── Import font from URL (Google Fonts / direct CDN link) ──────────────
  async function handleImportFromUrl() {
    const input  = document.getElementById("urlImportInput");
    const btn    = document.getElementById("urlImportButton");
    const rawUrl = input ? input.value.trim() : "";

    if (!rawUrl) { setStatus(msg("statusPasteUrlFirst")); return; }
    try { new URL(rawUrl); } catch (_) { setStatus(msg("statusInvalidUrl")); return; }

    if (btn) { btn.disabled = true; btn.textContent = "…"; }
    setStatus(msg("statusFetchingFont"));

    try {
      const resp = await chrome.runtime.sendMessage({
        type: shared.MESSAGE_TYPES.FETCH_FONT_URL,
        url: rawUrl,
      });
      if (!resp || !resp.success) throw new Error(resp && resp.error || "Fetch failed");

      const fetched = Array.isArray(resp.fonts) ? resp.fonts : [];
      if (fetched.length === 0) throw new Error("No fonts found at that URL");

      // Build full font records (OT feature parsing included)
      const fontRecords = fetched.map(({ name, dataUrl }) =>
        popup.dataUrlToFontRecord(dataUrl, name)
      );

      const nextFonts = { ...state.fonts };
      fontRecords.forEach((fr) => { nextFonts[fr.id] = fr; });
      const newId  = fontRecords[fontRecords.length - 1].id;
      const recent = [newId, ...state.recentFontIds.filter((id) => id !== newId)].slice(0, 5);

      try {
        await chrome.storage.local.set({ fonts: nextFonts, recentFontIds: recent });
      } catch (_) { setStatus(msg("statusCouldNotSaveFonts")); return; }

      state.fonts          = nextFonts;
      state.selectedFontId = newId;
      state.draftSetting.fontId = newId;
      state.recentFontIds  = recent;

      if (input) input.value = "";
      setStatus(fontRecords.length === 1
        ? msg("statusFontSaved")
        : msg("statusFontsSaved", [String(fontRecords.length)]));
      switchTab("apply");
      try { popup.render(); } catch (_) { if (popup.renderFontSelect) popup.renderFontSelect(); }
      // Font saved — user must press Apply to activate it on a site.
    } catch (err) {
      setStatus(msg("statusCouldNotFetchFont") + (err && err.message ? ": " + err.message : ""));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = msg("importFromUrl"); }
    }
  }

  async function handleUpload(droppedFiles) {
    const files = Array.isArray(droppedFiles) ? droppedFiles : Array.from(elements.fontFile.files || []);
    if (files.length === 0) { setStatus(msg("statusSelectFilesFirst")); return; }
    try {
      const used = await chrome.storage.local.getBytesInUse(null);
      if (used >= STORAGE_WARN_BYTES && !globalThis.confirm(msg("storageHighConfirm"))) return;
    } catch (_) {}
    // Use allSettled so one bad font doesn't block the rest from loading
    const results = await Promise.allSettled(files.map(fileToFontRecord));
    const uploadedFonts = results.filter(r => r.status === "fulfilled").map(r => r.value);
    const failedCount = results.filter(r => r.status === "rejected").length;
    if (uploadedFonts.length === 0) {
      const firstErr = results[0] && results[0].reason;
      setStatus(firstErr && firstErr.message ? firstErr.message : msg("statusCouldNotReadFont"));
      return;
    }
    if (failedCount > 0) {
      setStatus(`${failedCount} file(s) could not be read — continuing with ${uploadedFonts.length}`);
    }
    const nextFonts = { ...state.fonts };
    uploadedFonts.forEach((fontRecord) => { nextFonts[fontRecord.id] = fontRecord; });
    const newId = uploadedFonts[uploadedFonts.length - 1].id;
    const recent = [newId, ...state.recentFontIds.filter((id) => id !== newId)].slice(0, 5);
    try {
      await chrome.storage.local.set({ fonts: nextFonts, recentFontIds: recent });
    } catch (_) {
      setStatus(msg("statusCouldNotSaveFonts"));
      return;
    }
    state.fonts = nextFonts;
    state.selectedFontId = newId;
    state.draftSetting.fontId = newId;
    state.recentFontIds = recent;
    if (elements.fontFile) elements.fontFile.value = "";
    setStatus(uploadedFonts.length === 1 ? msg("statusFontSaved") : msg("statusFontsSaved", [String(uploadedFonts.length)]));
    switchTab("apply");
    try {
      popup.render();
    } catch (_) {
      if (popup.renderFontSelect) popup.renderFontSelect();
    }
    // Font saved — user must press Apply to activate it on a site.
  }

  async function handleApply() {
    try {
      if (!state.supportedPage || !state.currentHostname || !state.selectedFontId) { setStatus(msg("statusNothingToApply")); return; }
      if (state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && !state.draftSetting.targetSelector) { setStatus(msg("statusPickElementBeforeApply")); return; }
      const ok = await applyCurrentDraft({ silent: false });
      if (!ok) setStatus(msg("statusCouldNotApply"));
    } catch (error) {
      setStatus(msg("statusCouldNotApply"));
    }
  }

  async function handleReset() {
    if (!state.currentHostname || !state.siteSettings[state.currentHostname]) { setStatus(msg("statusNoSavedSetting")); return; }
    try {
      await stopPickerIfRunning();
      const nextSiteSettings = { ...state.siteSettings };
      delete nextSiteSettings[state.currentHostname];
      state.siteSettings = nextSiteSettings;
      state.draftSetting = shared.normalizeSiteSetting({});
      state.draftSetting.fontId = state.selectedFontId;
      await chrome.storage.local.set({ siteSettings: nextSiteSettings });
      await refreshCurrentTab();
      setStatus(msg("statusDomainReset"));
      popup.render();
    } catch (error) {
      setStatus(msg("statusCouldNotReset"));
    }
  }

  async function handleDeleteSelectedFont() {
    const fontId = state.selectedFontId;
    if (!fontId || !state.fonts[fontId]) { setStatus(msg("statusNoFontToDelete")); return; }
    const fontName = state.fonts[fontId].name || state.fonts[fontId].originalFileName || "";
    if (!globalThis.confirm(msg("deleteFontConfirm", [fontName]))) return;
    try {
      const nextFonts = { ...state.fonts };
      delete nextFonts[fontId];
      const nextSiteSettings = { ...state.siteSettings };
      Object.keys(nextSiteSettings).forEach((hostname) => {
        const entry = nextSiteSettings[hostname];
        if (Array.isArray(entry.rules) && entry.rules.length > 0) {
          // New format: font references live inside rules[]
          const newRules = entry.rules.map((r) =>
            r.fontId === fontId ? { ...r, enabled: false, fontId: "" } : r
          );
          const anyFont = newRules.some((r) => !!r.fontId);
          nextSiteSettings[hostname] = {
            ...entry,
            enabled: anyFont ? entry.enabled : false,
            updatedAt: Date.now(),
            rules: newRules
          };
        } else {
          // Legacy flat format
          const normalized = shared.normalizeSiteSetting(entry);
          if (normalized.fontId === fontId) {
            nextSiteSettings[hostname] = { ...normalized, enabled: false, fontId: "", updatedAt: Date.now() };
          }
        }
      });
      state.fonts = nextFonts;
      state.siteSettings = nextSiteSettings;
      state.recentFontIds = state.recentFontIds.filter((id) => id !== fontId);
      state.favoriteFontIds = state.favoriteFontIds.filter((id) => id !== fontId);
      state.selectedFontId = getSortedFontRecords(nextFonts)[0]?.id || "";
      state.draftSetting.fontId = state.selectedFontId;
      await chrome.storage.local.set({ fonts: nextFonts, siteSettings: nextSiteSettings, recentFontIds: state.recentFontIds, favoriteFontIds: state.favoriteFontIds });
      await refreshCurrentTab();
      setStatus(msg("statusFontRemoved"));
      popup.render();
    } catch (error) {
      setStatus(msg("statusCouldNotDelete"));
    }
  }

  async function handleStartPicker() {
    if (!state.supportedPage || state.currentTabId === null) { setStatus(msg("statusOpenWebsiteFirst")); return; }
    try {
      await stopPickerIfRunning();
      await sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.START_PICKER });
      // Close the popup immediately so the user can click elements on the page.
      // The content script shows a picker badge with instructions.
      // When an element is picked, the font is auto-applied and saved to storage.
      // Reopening the plugin will show the selected element.
      window.close();
    } catch (error) {
      setStatus(msg("statusCouldNotStartPicker"));
    }
  }

  // ── Before / After toggle ──────────────────────────────────────
  async function handleTogglePreview() {
    if (!state.supportedPage || state.currentTabId === null) return;
    state.previewPaused = !state.previewPaused;
    const type = state.previewPaused
      ? shared.MESSAGE_TYPES.PAUSE_PREVIEW
      : shared.MESSAGE_TYPES.RESUME_PREVIEW;
    try { await sendMessageToCurrentTab({ type }); } catch (_) {}
    popup.render();
  }

  // ── Snapshot ───────────────────────────────────────────────────
  async function handleSnapshot() {
    const btn = elements.snapshotButton;
    if (!state.currentTabId) { flashSnapBtn(btn, false); return; }
    try {
      // Must use the tab's windowId — captureVisibleTab(null) would capture the popup window itself
      const tab = await chrome.tabs.get(state.currentTabId);
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
      const filename = (state.currentHostname || "snapshot") + "-" + Date.now() + ".png";
      await chrome.downloads.download({ url: dataUrl, filename });
      flashSnapBtn(btn, true);
    } catch (e) {
      flashSnapBtn(btn, false);
      setStatus(String(e && e.message || msg("statusScreenshotFailed")));
    }
  }

  function flashSnapBtn(btn, ok) {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = ok ? "✓" : "✗";
    btn.style.color = ok ? "#2a6e42" : "#c0392b";
    btn.style.fontWeight = "700";
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.color = "";
      btn.style.fontWeight = "";
    }, 1500);
  }

  // ── Focus capture (dim-and-capture picker) ─────────────────────
  async function handleStartFocusCapture() {
    if (!state.supportedPage || state.currentTabId === null) {
      setStatus(msg("statusOpenWebsiteFirst"));
      return;
    }
    try {
      await sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.START_DIM_PICKER });
      window.close();
    } catch (e) {
      setStatus(msg("statusCouldNotStartFocusCapture"));
    }
  }

  // ── Font Inspector ──────────────────────────────────────────────
  async function handleInspectFonts() {
    const btn = document.getElementById("inspectScanBtn");
    const resultsWrap = document.getElementById("inspectResults");
    if (!state.supportedPage || state.currentTabId === null) {
      setStatus(msg("statusOpenWebsiteFirst"));
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = "Scanning…"; }

    // Temporarily pause the font override so we see the page's original fonts
    const overrideActive = !state.previewPaused && (
      (state.globalOverride && state.globalOverride.enabled) ||
      (state.currentHostname && state.siteSettings[state.currentHostname] && state.siteSettings[state.currentHostname].enabled)
    );
    if (overrideActive) {
      await sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.PAUSE_PREVIEW }).catch(() => {});
    }

    try {
      const data = await sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.INSPECT_FONTS });
      renderInspectorResults(data);
      if (resultsWrap) resultsWrap.hidden = false;
    } catch(e) {
      setStatus("Could not inspect page — try reloading the tab.");
    } finally {
      // Always restore the override after scan
      if (overrideActive) {
        await sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.RESUME_PREVIEW }).catch(() => {});
      }
      if (btn) { btn.disabled = false; btn.textContent = msg("inspectScan") || "Scan page"; }
    }
  }

  function calcWcagContrast(textColor, bgColor) {
    var m1 = (textColor || "").match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    var m2 = (bgColor  || "").match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m1 || !m2) return null;
    function lin(c) { var v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    function lum(r, g, b) { return 0.2126 * lin(+r) + 0.7152 * lin(+g) + 0.0722 * lin(+b); }
    var L1 = lum(m1[1], m1[2], m1[3]), L2 = lum(m2[1], m2[2], m2[3]);
    return Math.round((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05) * 10) / 10;
  }

  function renderInspectorResults(data) {
    if (!data) return;

    // If document.fonts was empty (e.g. cross-origin web fonts) AND fontFaceRules is empty,
    // synthesize fontsLoaded from whatever we do have: @font-face rules + computed element styles.
    // This works even with cached old content script versions.
    if (!data.fontsLoaded || data.fontsLoaded.length === 0) {
      var genericSet = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "inherit", "initial", "unset", ""]);
      var synthesized = [];
      var synthSeen = new Set();
      (data.fontFaceRules || []).forEach(function(r) {
        if (!r.family || synthSeen.has(r.family.toLowerCase())) return;
        synthSeen.add(r.family.toLowerCase());
        synthesized.push({ family: r.family, style: r.style || "normal", weight: r.weight || "400", status: "css" });
      });
      (data.elementFonts || []).forEach(function(item) {
        (item.fontFamily || "").split(",").forEach(function(raw) {
          var fam = raw.replace(/['"]/g, "").trim();
          if (!fam || genericSet.has(fam.toLowerCase()) || synthSeen.has(fam.toLowerCase())) return;
          synthSeen.add(fam.toLowerCase());
          synthesized.push({ family: fam, style: "normal", weight: "400", status: "computed" });
        });
      });
      if (synthesized.length > 0) data.fontsLoaded = synthesized;
    }

    // ── Loaded fonts ──────────────────────────────────────────────
    const secLoaded = document.getElementById("inspectSectionLoaded");
    const fontList  = document.getElementById("inspectFontList");
    const loadedCnt = document.getElementById("inspectLoadedCount");
    var previewImages = data.previewImages || {};
    var nameImages = data.nameImages || {};

    if (secLoaded && fontList && data.fontsLoaded && data.fontsLoaded.length > 0) {
      fontList.innerHTML = "";
      // Group by family name
      var byFamily = {};
      data.fontsLoaded.forEach(function(ff) {
        var fam = ff.family || "Unknown";
        if (!byFamily[fam]) byFamily[fam] = [];
        byFamily[fam].push(ff);
      });
      var families = Object.keys(byFamily);
      if (loadedCnt) loadedCnt.textContent = families.length;
      families.forEach(function(family) {
        var variants = byFamily[family];
        var li = document.createElement("li");
        li.className = "inspect-font-item";

        // Inspector card: canvas name image (actual page font) or plain text fallback
        if (nameImages[family]) {
          var nameImg = document.createElement("img");
          nameImg.className = "inspect-font-preview-img";
          nameImg.src = nameImages[family];
          nameImg.alt = family;
          li.appendChild(nameImg);
        } else {
          var previewEl = document.createElement("span");
          previewEl.className = "inspect-font-preview";
          previewEl.textContent = family;
          li.appendChild(previewEl);
        }

        var pillsWrap = document.createElement("span");
        pillsWrap.className = "inspect-font-variants";
        var seen = new Set();
        variants.forEach(function(v) {
          var wLabel = v.weight && v.weight !== "normal" && v.weight !== "400" ? v.weight : "";
          var sLabel = v.style && v.style !== "normal" ? v.style : "";
          var label = [wLabel, sLabel].filter(Boolean).join(" ") || "regular";
          if (!seen.has(label)) {
            seen.add(label);
            var pill = document.createElement("span");
            pill.className = "inspect-variant-pill";
            pill.textContent = label;
            pillsWrap.appendChild(pill);
          }
        });
        li.appendChild(pillsWrap);

        // Top-right action buttons row
        var actionsRow = document.createElement("div");
        actionsRow.className = "inspect-font-actions";

        var detailsToggle = document.createElement("button");
        detailsToggle.type = "button";
        detailsToggle.className = "inspect-details-toggle";
        detailsToggle.setAttribute("aria-expanded", "false");
        detailsToggle.setAttribute("data-family", family);
        detailsToggle.textContent = "Details";
        actionsRow.appendChild(detailsToggle);

        var useBtn = document.createElement("button");
        useBtn.className = "inspect-use-btn";
        useBtn.textContent = "Use";
        useBtn.type = "button";
        useBtn.setAttribute("data-family", family);
        actionsRow.appendChild(useBtn);
        li.appendChild(actionsRow);

        // Details panel (hidden by default) — case-insensitive lookup for fontUsageMap
        var usageEntry = null;
        var _fum = data.fontUsageMap || {};
        var _famLow = family.toLowerCase();
        Object.keys(_fum).forEach(function(k) { if (k.toLowerCase() === _famLow) usageEntry = _fum[k]; });
        var detailsPanel = document.createElement("div");
        detailsPanel.className = "inspect-details-panel";
        detailsPanel.hidden = true;

        // Usage map row
        if (usageEntry && usageEntry.elements && usageEntry.elements.length > 0) {
          var usageRow = document.createElement("div");
          usageRow.className = "inspect-usage-row";
          var usageLabel = document.createElement("span");
          usageLabel.className = "inspect-usage-label";
          usageLabel.textContent = "Used by";
          usageRow.appendChild(usageLabel);
          var tagsWrap = document.createElement("div");
          tagsWrap.className = "inspect-usage-tags";
          usageEntry.elements.forEach(function(item) {
            var tagBtn = document.createElement("button");
            tagBtn.type = "button";
            tagBtn.className = "inspect-usage-tag";
            tagBtn.setAttribute("data-family", family);
            tagBtn.setAttribute("data-tag", item.tag);
            tagBtn.textContent = item.tag + " \u00d7 " + item.count;
            tagsWrap.appendChild(tagBtn);
          });
          usageRow.appendChild(tagsWrap);
          detailsPanel.appendChild(usageRow);
        }

        li.appendChild(detailsPanel);
        fontList.appendChild(li);
      });

      // Single delegated click handler — reads family from data attribute
      fontList.addEventListener("click", async function(e) {
        // Details toggle
        var toggleBtn = e.target.closest(".inspect-details-toggle");
        if (toggleBtn) {
          var panel = toggleBtn.closest(".inspect-font-item").querySelector(".inspect-details-panel");
          if (panel) {
            var expanded = panel.hidden;
            panel.hidden = !expanded;
            toggleBtn.setAttribute("aria-expanded", String(expanded));
            toggleBtn.classList.toggle("is-open", expanded);
          }
          return;
        }
        // Usage tag — highlight on page
        var tagBtn = e.target.closest(".inspect-usage-tag");
        if (tagBtn) {
          var highlightFamily = tagBtn.getAttribute("data-family");
          var highlightTag = tagBtn.getAttribute("data-tag");
          sendMessageToCurrentTab({ type: shared.MESSAGE_TYPES.HIGHLIGHT_ELEMENT, fontFamily: highlightFamily, tag: highlightTag }).catch(function() {});
          return;
        }
        // Use button
        var btn = e.target.closest(".inspect-use-btn");
        if (!btn) return;
        var fam = btn.getAttribute("data-family");
        if (!fam) return;
        var refId = "page-" + fam.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();
        var fontRecord = { id: refId, name: fam, dataUrl: null, format: null, pageFont: true, pageFontHostname: state.currentHostname };
        // Page fonts live in memory only — NOT persisted to storage.
        // They are ephemeral: visible only while on this hostname.
        var nextFonts = Object.assign({}, state.fonts);
        nextFonts[refId] = fontRecord;
        state.fonts = nextFonts;
        state.fonts[refId]._pagePreviewImg = previewImages[fam] || null;
        state.selectedFontId = refId;
        state.draftSetting.fontId = refId;
        // NOTE: no chrome.storage.local.set for page fonts — memory-only
        switchTab("apply");
        popup.render();
        // Apply immediately — don't wait for user to confirm in dropdown
        await applyCurrentDraft({ silent: true }).catch(function() {});
        setStatus('Page font "' + fam + '" applied.');
      });
      secLoaded.hidden = false;
    } else if (secLoaded) {
      secLoaded.hidden = true;
    }

    // ── Element typography ────────────────────────────────────────
    const secElems = document.getElementById("inspectSectionElements");
    const elemGrid = document.getElementById("inspectElemGrid");
    if (secElems && elemGrid && data.elementFonts && data.elementFonts.length > 0) {
      elemGrid.innerHTML = "";
      data.elementFonts.forEach(function(item) {
        const row = document.createElement("div");
        row.className = "inspect-elem-row";

        const tag = document.createElement("span");
        tag.className = "inspect-elem-tag";
        tag.textContent = item.label;
        row.appendChild(tag);

        const fam = document.createElement("span");
        fam.className = "inspect-elem-family";
        // First font in the stack, unquoted
        fam.textContent = (item.fontFamily || "").split(",")[0].replace(/['"]/g, "").trim() || "—";
        fam.title = item.fontFamily;
        row.appendChild(fam);

        const meta = document.createElement("span");
        meta.className = "inspect-elem-meta";
        meta.textContent = item.fontWeight + " · " + item.fontSize;
        row.appendChild(meta);

        elemGrid.appendChild(row);
      });
      secElems.hidden = false;
    } else if (secElems) {
      secElems.hidden = true;
    }

    // ── @font-face rules ──────────────────────────────────────────
    const secFaces = document.getElementById("inspectSectionFaces");
    const faceList = document.getElementById("inspectFaceList");
    const faceCnt  = document.getElementById("inspectFaceCount");
    if (secFaces && faceList && data.fontFaceRules && data.fontFaceRules.length > 0) {
      faceList.innerHTML = "";
      if (faceCnt) faceCnt.textContent = data.fontFaceRules.length;
      data.fontFaceRules.forEach(function(r) {
        const li = document.createElement("li");
        li.className = "inspect-face-item";

        const fam = document.createElement("span");
        fam.className = "inspect-face-family";
        fam.textContent = r.family;
        li.appendChild(fam);

        const meta = document.createElement("span");
        meta.className = "inspect-face-meta";
        const wLabel = r.weight && r.weight !== "normal" && r.weight !== "400" ? r.weight : "400";
        const sLabel = r.style && r.style !== "normal" ? " " + r.style : "";
        meta.textContent = wLabel + sLabel;
        li.appendChild(meta);

        faceList.appendChild(li);
      });
      secFaces.hidden = false;
    } else if (secFaces) {
      secFaces.hidden = true;
    }

    // Empty state
    const emptyEl = document.getElementById("inspectEmpty");
    const hasData = (data.fontsLoaded && data.fontsLoaded.length > 0) ||
                    (data.elementFonts && data.elementFonts.length > 0) ||
                    (data.fontFaceRules && data.fontFaceRules.length > 0);
    if (emptyEl) emptyEl.hidden = hasData;
  }

  // ── Share site ─────────────────────────────────────────────────
  function handleShareSite() {
    const hostname = state.currentHostname;
    const dialog = elements.shareDialog;
    if (!hostname || !state.siteSettings[hostname]) { setStatus(msg("statusNoSiteSettings")); return; }
    if (!dialog) return;
    const rules = shared.getSiteRules(hostname, state.siteSettings);
    const fontNames = [...new Set(rules.map(r => r.fontId && state.fonts[r.fontId] ? state.fonts[r.fontId].name : "").filter(Boolean))];
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      fonts: {},
      siteSettings: { [hostname]: state.siteSettings[hostname] },
      recentFontIds: [], favoriteFontIds: []
    };
    let code;
    try { code = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); } catch (e) { code = btoa(JSON.stringify(payload)); }
    const shareHost = document.getElementById("shareDialogHost");
    const fontNote = document.getElementById("shareFontNote");
    if (shareHost) shareHost.textContent = hostname;
    if (fontNote) fontNote.textContent = fontNames.length ? "Font: " + fontNames.join(", ") + " — recipient must upload this font." : "";
    if (elements.shareCode) { elements.shareCode.value = code; elements.shareCode.select(); }
    dialog.hidden = false;
  }

  function handleCloseShare() {
    if (elements.shareDialog) elements.shareDialog.hidden = true;
  }

  async function handleCopyShareCode() {
    if (!elements.shareCode) return;
    try {
      await navigator.clipboard.writeText(elements.shareCode.value);
      const btn = elements.copyShareCodeBtn;
      if (btn) { const prev = btn.textContent; btn.textContent = "✓ Copied"; setTimeout(() => { btn.textContent = prev; }, 1500); }
    } catch (e) { setStatus(msg("statusCouldNotCopy")); }
  }

  function handleDownloadShare() {
    const hostname = state.currentHostname;
    if (!hostname || !state.siteSettings[hostname]) return;
    const rules = shared.getSiteRules(hostname, state.siteSettings);
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      fonts: {},
      siteSettings: { [hostname]: state.siteSettings[hostname] },
      recentFontIds: [], favoriteFontIds: []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = hostname.replace(/[^a-z0-9.-]/gi, "_") + "-font-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Multiple rules ─────────────────────────────────────────────
  function handleAddRule() {
    // Save current draft into active slot first
    if (state.siteRules.length > 0) {
      state.siteRules[state.activeRuleIdx] = shared.normalizeSiteSetting({
        ...state.draftSetting, fontId: state.selectedFontId, updatedAt: Date.now()
      });
    }
    const newRule = shared.normalizeSiteSetting({
      enabled: true,
      fontId: state.selectedFontId,
      targetMode: shared.TARGET_MODES.HEADINGS,
      updatedAt: Date.now()
    });
    state.siteRules = [...state.siteRules, newRule];
    state.activeRuleIdx = state.siteRules.length - 1;
    state.draftSetting = { ...newRule };
    popup.render();
  }

  function handleSelectRule(idx) {
    if (idx < 0 || idx >= state.siteRules.length) return;
    // Save current draft into active slot
    state.siteRules[state.activeRuleIdx] = shared.normalizeSiteSetting({
      ...state.draftSetting, fontId: state.selectedFontId, updatedAt: Date.now()
    });
    state.activeRuleIdx = idx;
    const rule = state.siteRules[idx];
    state.draftSetting = { ...rule };
    state.selectedFontId = rule.fontId || state.selectedFontId;
    popup.render();
  }

  function handleDeleteRule(idx) {
    if (state.siteRules.length <= 1) { setStatus(msg("statusMustKeepOneRule")); return; }
    state.siteRules = state.siteRules.filter((_, i) => i !== idx);
    if (state.activeRuleIdx >= state.siteRules.length) state.activeRuleIdx = state.siteRules.length - 1;
    const rule = state.siteRules[state.activeRuleIdx];
    state.draftSetting = { ...rule };
    state.selectedFontId = rule.fontId || state.selectedFontId;
    popup.render();
  }

  function addListener(el, event, fn) {
    if (el && typeof el.addEventListener === "function") el.addEventListener(event, fn);
  }

  function bindEvents() {
    addListener(elements.applyButton, "click", handleApply);
    addListener(elements.deleteButton, "click", handleDeleteSelectedFont);
    addListener(elements.favoriteButton, "click", handleFavoriteClick);
    addListener(elements.fontFile, "change", () => popup.render());
    addListener(elements.fontSelect, "change", handleFontSelectionChange);
    if (elements.fontSearch) {
      elements.fontSearch.addEventListener("input", function() {
        state.fontSearchQuery = elements.fontSearch.value;
        popup.render();
      });
      elements.fontSearch.addEventListener("keydown", function(e) {
        // Enter or Escape clears search and selects top result
        if (e.key === "Escape") { state.fontSearchQuery = ""; elements.fontSearch.value = ""; popup.render(); }
      });
    }
    addListener(elements.fontSizeInput, "input", handleTypographyInput);
    addListener(elements.fontWeightSelect, "change", handleTypographyInput);
    addListener(elements.letterSpacingInput, "input", handleTypographyInput);
    addListener(elements.lineHeightInput, "input", handleTypographyInput);
    addListener(elements.fontStyleSelect, "change", handleTypographyInput);
    addListener(elements.wordSpacingInput, "input", handleTypographyInput);
    addListener(elements.textTransformSelect, "change", handleTypographyInput);
    addListener(elements.textColorInput, "input", handleTypographyInput);
    addListener(elements.textDecorationSelect, "change", handleTypographyInput);
    addListener(elements.textShadowSelect, "change", handleTypographyInput);
    addListener(elements.textOpacityInput, "input", handleTypographyInput);
    addListener(elements.copyCssButton, "click", handleCopyCss);
    addListener(elements.overrideCheckbox, "change", handleOverrideToggle);
    addListener(elements.pickerButton, "click", handleStartPicker);
    addListener(elements.resetButton, "click", handleReset);
    addListener(elements.repickTargetButton, "click", handleRepickTarget);
    addListener(elements.saveAsDefaultButton, "click", handleSaveAsDefault);
    addListener(elements.tabApply, "click", () => switchTab("apply"));
    addListener(elements.tabSites, "click", () => switchTab("sites"));
    addListener(elements.tabUpload, "click", () => switchTab("upload"));
    addListener(elements.tabInspect, "click", () => switchTab("inspect"));
    addListener(elements.useWholePageButton, "click", handleUseWholePage);
    addListener(elements.targetModeSelect, "change", handleTargetModeChange);
    addListener(elements.textOnlyCheckbox, "change", handleTextOnlyChange);
    addListener(elements.relaxLayoutCheckbox, "change", handleRelaxLayoutChange);
    addListener(elements.themeSelect, "change", handleThemeChange);
    addListener(elements.showPageBadgeCheckbox, "change", handleShowPageBadgeChange);
    addListener(elements.uploadButton, "click", handleUpload);
    addListener(document.getElementById("urlImportButton"), "click", handleImportFromUrl);
    const urlInput = document.getElementById("urlImportInput");
    if (urlInput) urlInput.addEventListener("keydown", function(e) {
      if (e.key === "Enter") { e.preventDefault(); handleImportFromUrl(); }
    });
    if (elements.sitesSearch) {
      elements.sitesSearch.addEventListener("input", () => {
        state.sitesSearchQuery = elements.sitesSearch.value;
        if (state.activeTab === "sites") renderSitesList();
      });
    }
    if (elements.exportButton) elements.exportButton.addEventListener("click", handleExport);
    if (elements.importFile) elements.importFile.addEventListener("change", handleImport);
    function updateDraftOpenTypeFromForm() {
      const checkedMap = {};
      if (elements.opentypeFeaturesWrap) {
        elements.opentypeFeaturesWrap.querySelectorAll("input[type=checkbox][data-tag]").forEach((cb) => {
          checkedMap[cb.getAttribute("data-tag")] = cb.checked;
        });
      }
      const other = elements.fontFeatureSettingsInput ? elements.fontFeatureSettingsInput.value : "";
      state.draftSetting.fontFeatureSettings = shared.buildFontFeatureSettings(checkedMap, other);
      scheduleLiveApply();
    }
    if (elements.opentypeFeaturesWrap) {
      elements.opentypeFeaturesWrap.addEventListener("change", (e) => {
        if (e.target.matches("input[type=checkbox]")) updateDraftOpenTypeFromForm();
      });
    }
    if (elements.fontFeatureSettingsInput) elements.fontFeatureSettingsInput.addEventListener("input", updateDraftOpenTypeFromForm);
    if (elements.sitesSortBy) elements.sitesSortBy.addEventListener("change", handleSitesSortByChange);
    if (elements.copyFromCurrentButton) elements.copyFromCurrentButton.addEventListener("click", handleCopyFromCurrent);
    if (elements.cleanupUnusedButton) elements.cleanupUnusedButton.addEventListener("click", handleCleanupUnused);
    if (elements.globalOverrideCheckbox) elements.globalOverrideCheckbox.addEventListener("change", handleGlobalOverrideChange);
    // Snapshot, Focus capture, Share, Rules
    if (elements.snapshotButton) elements.snapshotButton.addEventListener("click", handleSnapshot);
    if (elements.focusCaptureButton) elements.focusCaptureButton.addEventListener("click", handleStartFocusCapture);
    const inspectScanBtn = document.getElementById("inspectScanBtn");
    if (inspectScanBtn) inspectScanBtn.addEventListener("click", handleInspectFonts);
    if (elements.shareSiteButton) elements.shareSiteButton.addEventListener("click", handleShareSite);
    if (elements.shareCloseBtn) elements.shareCloseBtn.addEventListener("click", handleCloseShare);
    if (elements.copyShareCodeBtn) elements.copyShareCodeBtn.addEventListener("click", handleCopyShareCode);
    if (elements.downloadShareBtn) elements.downloadShareBtn.addEventListener("click", handleDownloadShare);
    if (elements.addRuleBtn) elements.addRuleBtn.addEventListener("click", handleAddRule);
    if (elements.rulesChips) {
      elements.rulesChips.addEventListener("click", function(e) {
        const delSpan = e.target.closest("[data-del-idx]");
        if (delSpan) { e.stopPropagation(); handleDeleteRule(Number(delSpan.getAttribute("data-del-idx"))); return; }
        const chip = e.target.closest("[data-rule-idx]");
        if (chip) handleSelectRule(Number(chip.getAttribute("data-rule-idx")));
      });
    }
    chrome.storage.onChanged.addListener(handleStorageChange);
    const uploadArea = document.querySelector(".upload-area");
    if (uploadArea) {
      uploadArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        uploadArea.classList.add("drag-over");
      });
      uploadArea.addEventListener("dragleave", (e) => {
        if (!uploadArea.contains(e.relatedTarget)) uploadArea.classList.remove("drag-over");
      });
      uploadArea.addEventListener("drop", (e) => {
        e.preventDefault();
        uploadArea.classList.remove("drag-over");
        const files = Array.from(e.dataTransfer.files).filter((f) => /\.(woff2?|ttf|otf)$/i.test(f.name));
        if (files.length > 0) handleUpload(files);
      });
    }
  }

  // ═══════════════════════════════════════
  // NEW FEATURE HANDLERS
  // ═══════════════════════════════════════

  // Undo/Redo handlers
  function handleUndo() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.undoRedoManager) return;
    const prevState = features.undoRedoManager.undo();
    if (prevState) {
      Object.assign(state.draftSetting, prevState.draftSetting);
      popup.render();
      popup.setStatus("Undo", false);
    }
  }

  function handleRedo() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.undoRedoManager) return;
    const nextState = features.undoRedoManager.redo();
    if (nextState) {
      Object.assign(state.draftSetting, nextState.draftSetting);
      popup.render();
      popup.setStatus("Redo", false);
    }
  }

  // Presets handlers
  async function handleSavePreset() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.presetsManager) return;
    const nameInput = document.getElementById("presetNameInput");
    if (!nameInput || !nameInput.value.trim()) {
      setStatus(msg("statusSelectFilesFirst"));
      return;
    }
    const name = nameInput.value.trim();
    await features.presetsManager.savePreset(name, state.draftSetting.typography);
    nameInput.value = "";
    setStatus(msg("statusPresetSaved").replace("$1", name));
    renderPresets();
  }

  async function renderPresets() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.presetsManager) return;
    const presets = await features.presetsManager.loadPresets();
    const grid = document.getElementById("presetsGrid");
    if (!grid) return;

    grid.innerHTML = "";
    Object.entries(presets).forEach(([name]) => {
      const btn = document.createElement("button");
      btn.className = "preset-item abt abt-sm";
      btn.textContent = name;
      btn.addEventListener("click", async () => {
        if (!features.presetsManager) return;
        await features.presetsManager.applyPreset(name);
        setStatus(msg("statusPresetApplied").replace("$1", name));
      });
      grid.appendChild(btn);
    });
  }

  // Font Pairs handlers
  async function handleApplyFontPair() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.fontPairsManager) return;
    const ok = await features.fontPairsManager.applyCurrentPair();
    if (!ok) { setStatus(msg("statusSelectFontFirst")); return; }
    setStatus(msg("statusPairApplied"));
    await refreshCurrentTab();
    popup.render();
  }

  async function handleClearFontPair() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.fontPairsManager) return;
    await features.fontPairsManager.clearPair();
    setStatus(msg("statusPairCleared"));
    await refreshCurrentTab();
    popup.render();
  }

  function populatePairSelects() {
    const features = globalThis.FontPluginFeatures;
    if (features && features.fontPairsManager) features.fontPairsManager.populateSelects();
  }

  // Accessibility checker handler
  async function handleCheckAccessibility() {
    const features = globalThis.FontPluginFeatures;
    if (!features || !features.accessibilityChecker) return;
    await features.accessibilityChecker.displayCheck();
  }

  // Bind new feature handlers
  function bindNewFeatureHandlers() {
    const undoBtn         = document.getElementById("undoButton");
    const redoBtn         = document.getElementById("redoButton");
    const savePresetBtn   = document.getElementById("savePresetButton");
    const applyPairBtn    = document.getElementById("applyFontPairButton");
    const clearPairBtn    = document.getElementById("clearFontPairButton");
    const checkAccessBtn  = document.getElementById("checkAccessibilityButton");

    if (undoBtn)        undoBtn.addEventListener("click", handleUndo);
    if (redoBtn)        redoBtn.addEventListener("click", handleRedo);
    if (savePresetBtn)  savePresetBtn.addEventListener("click", handleSavePreset);
    if (applyPairBtn)   applyPairBtn.addEventListener("click", handleApplyFontPair);
    if (clearPairBtn)   clearPairBtn.addEventListener("click", handleClearFontPair);
    if (checkAccessBtn) checkAccessBtn.addEventListener("click", handleCheckAccessibility);

    // Initialize features — guard each sub-manager individually
    const features = globalThis.FontPluginFeatures;
    if (features) {
      if (features.shortcutsManager && typeof features.shortcutsManager.init === "function") features.shortcutsManager.init();
      if (features.persistenceManager && typeof features.persistenceManager.init === "function") features.persistenceManager.init();
      if (features.enhancedPicker && typeof features.enhancedPicker.init === "function") features.enhancedPicker.init();
    }

    // Populate pair font selects and presets
    populatePairSelects();
    renderPresets();
  }

  popup.handleUndo = handleUndo;
  popup.handleRedo = handleRedo;
  popup.handleSavePreset = handleSavePreset;
  popup.handleApplyFontPair = handleApplyFontPair;
  popup.handleClearFontPair = handleClearFontPair;
  popup.handleCheckAccessibility = handleCheckAccessibility;
  popup.bindNewFeatureHandlers = bindNewFeatureHandlers;

  popup.handleTogglePreview = handleTogglePreview;
  popup.handleSnapshot = handleSnapshot;
  popup.handleShareSite = handleShareSite;
  popup.handleAddRule = handleAddRule;
  popup.handleSelectRule = handleSelectRule;
  popup.handleDeleteRule = handleDeleteRule;
  popup.scheduleLiveApply = scheduleLiveApply;
  popup.doLiveApply = doLiveApply;
  popup.refreshCurrentTab = refreshCurrentTab;
  popup.sendMessageToCurrentTab = sendMessageToCurrentTab;
  popup.ensureCurrentTabScripts = ensureCurrentTabScripts;
  popup.stopPickerIfRunning = stopPickerIfRunning;
  popup.handleSiteToggle = handleSiteToggle;
  popup.handlePasteToSite = handlePasteToSite;
  popup.handleSiteRemove = handleSiteRemove;
  popup.switchTab = switchTab;
  popup.bindEvents = bindEvents;
  popup.init = init;
})();
