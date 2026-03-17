(function () {
  "use strict";
  globalThis.__fontPluginStage = "storage";
  const shared = globalThis.FontPluginShared;
  const popup = globalThis.FontPluginPopup;
  const state = popup.state;
  const elements = popup.elements;
  const getSortedFontRecords = popup.getSortedFontRecords;

  async function loadStoredState() {
    const stored = await chrome.storage.local.get(shared.STORAGE_KEYS);
    state.fonts = stored.fonts || {};
    state.siteSettings = stored.siteSettings || {};
    state.theme = ["system", "light", "dark"].includes(stored.theme) ? stored.theme : "system";
    state.recentFontIds = Array.isArray(stored.recentFontIds) ? stored.recentFontIds : [];
    state.favoriteFontIds = Array.isArray(stored.favoriteFontIds) ? stored.favoriteFontIds : [];
    state.targetNotFoundHosts = stored.targetNotFoundHosts && typeof stored.targetNotFoundHosts === "object" ? stored.targetNotFoundHosts : {};
    state.showPageBadge = stored.showPageBadge !== false;

    const dt = stored.defaultTypography;
    state.defaultTypography = dt && typeof dt === "object"
      ? {
          fontSizePx: typeof dt.fontSizePx === "number" ? Math.min(72, Math.max(8, dt.fontSizePx)) : null,
          lineHeight: typeof dt.lineHeight === "number" ? dt.lineHeight : null,
          letterSpacingEm: typeof dt.letterSpacingEm === "number" ? dt.letterSpacingEm : 0,
          fontWeight: typeof dt.fontWeight === "number" ? dt.fontWeight : null,
          fontFeatureSettings: typeof dt.fontFeatureSettings === "string" ? dt.fontFeatureSettings : "",
          fontStyle: /^(normal|italic|oblique)$/i.test(dt.fontStyle) ? dt.fontStyle : "normal",
          wordSpacingEm: typeof dt.wordSpacingEm === "number" ? dt.wordSpacingEm : 0,
          textTransform: /^(none|uppercase|lowercase|capitalize)$/i.test(dt.textTransform) ? dt.textTransform : "none"
        }
      : { ...shared.DEFAULT_TYPOGRAPHY, fontFeatureSettings: "" };

    const activeSetting = getActiveSiteSetting();
    const availableFontIds = getSortedFontRecords().map((r) => r.id);
    const hasSiteSetting = state.currentHostname && state.siteSettings[state.currentHostname];

    if (activeSetting.fontId && state.fonts[activeSetting.fontId]) {
      state.selectedFontId = activeSetting.fontId;
    } else if (!availableFontIds.includes(state.selectedFontId)) {
      state.selectedFontId = availableFontIds[0] || "";
    }

    state.draftSetting = {
      ...activeSetting,
      fontId: state.selectedFontId || activeSetting.fontId || "",
      fontFeatureSettings: hasSiteSetting ? (activeSetting.fontFeatureSettings || "") : (state.defaultTypography.fontFeatureSettings || ""),
      typography: hasSiteSetting ? activeSetting.typography : { ...state.defaultTypography }
    };

    if (elements.showPageBadgeCheckbox) {
      elements.showPageBadgeCheckbox.checked = state.showPageBadge;
    }

    state.siteRules = state.currentHostname ? shared.getSiteRules(state.currentHostname, state.siteSettings) : [];
    if (state.activeRuleIdx >= state.siteRules.length) state.activeRuleIdx = 0;

    state.sitesSortBy = ["domain", "date", "fontName", "recent"].includes(stored.sitesSortBy) ? stored.sitesSortBy : "domain";
    const go = stored.globalOverride && typeof stored.globalOverride === "object" ? stored.globalOverride : { enabled: false, fontId: "" };
    let globalFontId = typeof go.fontId === "string" ? go.fontId : "";
    if (globalFontId && !(stored.fonts || {})[globalFontId]) globalFontId = "";
    state.globalOverride = { enabled: !!go.enabled, fontId: globalFontId };
    if (globalFontId !== go.fontId) {
      chrome.storage.local.set({ globalOverride: state.globalOverride }).catch(() => {});
    }

    try {
      state.storageBytesUsed = await chrome.storage.local.getBytesInUse(null);
    } catch (_) {
      state.storageBytesUsed = 0;
    }
    popup.applyTheme(state.theme);
  }

  function getActiveSiteSetting() {
    if (!state.currentHostname) return shared.normalizeSiteSetting({});
    const raw = state.siteSettings[state.currentHostname];
    const rules = shared.getSiteRules(state.currentHostname, state.siteSettings);
    const rule = rules[0];
    if (!rule) return shared.normalizeSiteSetting({});
    // getSiteRules now propagates the master top-level enabled, but guard against
    // any pre-fix data in storage where the flags diverged.
    const masterEnabled = raw && typeof raw.enabled === "boolean" ? raw.enabled : rule.enabled;
    return masterEnabled === rule.enabled ? rule : { ...rule, enabled: masterEnabled };
  }

  popup.loadStoredState = loadStoredState;
  popup.getActiveSiteSetting = getActiveSiteSetting;
})();
