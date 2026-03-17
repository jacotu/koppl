(function () {
  "use strict";
  globalThis.__fontPluginStage = "render";
  const shared = globalThis.FontPluginShared;
  const popup = globalThis.FontPluginPopup;
  const state = popup.state;
  const elements = popup.elements;
  const msg = popup.msg;
  const getLocalizedTargetSummary = popup.getLocalizedTargetSummary;
  const getSortedFontRecords = popup.getSortedFontRecords;
  const setStatus = popup.setStatus;
  const getActiveSiteSetting = popup.getActiveSiteSetting;
  const switchTab = popup.switchTab;
  const STORAGE_WARN_BYTES = popup.STORAGE_WARN_BYTES;

  function ensureFontOpenTypeFeatures(fontRecord) {
    if (!fontRecord) return Promise.resolve([]);
    if (Array.isArray(fontRecord.openTypeFeatures)) return Promise.resolve(fontRecord.openTypeFeatures);
    if (!fontRecord.dataUrl || !shared.getFontFeatureTagsFromDataUrl) return Promise.resolve([]);
    const features = shared.getFontFeatureTagsFromDataUrl(fontRecord.dataUrl);
    fontRecord.openTypeFeatures = features;
    return Promise.resolve(features);
  }

  function buildSiteLabel(activeSetting) {
    // Show only the domain name — clean and minimal
    return state.currentHostname || "—";
  }

  // Only update an input's value when the user isn't actively typing in it.
  // Without this guard, parseOptionalNumber clamps mid-entry (e.g. typing "20"
  // fires on "2" → clamp → state=6 → render overwrites input to "6"),
  // making it impossible to type any value whose first digit is 1-5.
  function setVal(el, value) {
    if (!el || document.activeElement === el) return;
    el.value = value;
  }

  function syncFormValuesFromState() {
    elements.targetModeSelect.value = state.draftSetting.targetMode;
    elements.textOnlyCheckbox.checked = state.draftSetting.textOnly;
    if (elements.relaxLayoutCheckbox) elements.relaxLayoutCheckbox.checked = !!state.draftSetting.relaxLayout;
    const featureTags = state.selectedFontId && state.fonts[state.selectedFontId] ? (state.fonts[state.selectedFontId].openTypeFeatures || []) : [];
    const parsed = shared.parseFontFeatureSettings(state.draftSetting.fontFeatureSettings || "", featureTags);
    if (elements.opentypeFeaturesWrap) {
      elements.opentypeFeaturesWrap.querySelectorAll("input[type=checkbox][data-tag]").forEach((cb) => {
        cb.checked = !!parsed.checked[cb.getAttribute("data-tag")];
      });
    }
    setVal(elements.fontFeatureSettingsInput, parsed.other);
    setVal(elements.fontSizeInput, state.draftSetting.typography.fontSizePx === null || state.draftSetting.typography.fontSizePx === undefined ? "100" : String(state.draftSetting.typography.fontSizePx));
    setVal(elements.lineHeightInput, state.draftSetting.typography.lineHeight === null ? "" : String(state.draftSetting.typography.lineHeight));
    setVal(elements.letterSpacingInput, state.draftSetting.typography.letterSpacingEm === 0 ? "" : String(state.draftSetting.typography.letterSpacingEm));
    setVal(elements.fontWeightSelect, state.draftSetting.typography.fontWeight === null ? "" : String(state.draftSetting.typography.fontWeight));
    if (elements.fontStyleSelect) setVal(elements.fontStyleSelect, state.draftSetting.typography.fontStyle || "normal");
    if (elements.wordSpacingInput) setVal(elements.wordSpacingInput, state.draftSetting.typography.wordSpacingEm === 0 ? "" : String(state.draftSetting.typography.wordSpacingEm));
    if (elements.textTransformSelect) setVal(elements.textTransformSelect, state.draftSetting.typography.textTransform || "none");
    if (elements.textColorInput) setVal(elements.textColorInput, state.draftSetting.typography.textColor || "#0E0E0C");
    if (elements.textDecorationSelect) setVal(elements.textDecorationSelect, state.draftSetting.typography.textDecoration || "none");
    if (elements.textShadowSelect) setVal(elements.textShadowSelect, state.draftSetting.typography.textShadow || "none");
    if (elements.textOpacityInput) setVal(elements.textOpacityInput, String(state.draftSetting.typography.textOpacity || 100));
    if (elements.globalOverrideCheckbox) elements.globalOverrideCheckbox.checked = state.globalOverride.enabled;
    if (elements.sitesSortBy) elements.sitesSortBy.value = state.sitesSortBy;
    if (elements.copyFromCurrentButton) elements.copyFromCurrentButton.disabled = !state.currentHostname || !state.siteSettings[state.currentHostname];
    if (elements.sitesCopyHint) elements.sitesCopyHint.textContent = state.copiedSiteSetting ? msg("copiedPasteBelow") : "";
  }

  function renderFontSelect() {
    if (!elements.fontSelect) return;
    const allRecords = getSortedFontRecords();
    const q = (state.fontSearchQuery || "").trim().toLowerCase();
    const fontRecords = q
      ? allRecords.filter((r) => r.name.toLowerCase().includes(q) || (r.originalFileName || "").toLowerCase().includes(q))
      : allRecords;
    const fontMap = {};
    allRecords.forEach((r) => { fontMap[r.id] = r; });
    // Show/hide search input based on total font count
    if (elements.fontSearch) {
      elements.fontSearch.hidden = allRecords.length < 5;
      if (!elements.fontSearch.hidden && elements.fontSearch.value !== (state.fontSearchQuery || "")) {
        elements.fontSearch.value = state.fontSearchQuery || "";
      }
    }
    elements.fontSelect.innerHTML = "";
    if (allRecords.length === 0) {
      elements.fontSelect.add(new Option(msg("uploadFontFirst"), ""));
      elements.fontSelect.value = "";
      return;
    }
    if (fontRecords.length === 0) {
      elements.fontSelect.add(new Option("No fonts match \u201C" + q + "\u201D", ""));
      elements.fontSelect.value = "";
      return;
    }
    const matchIds = new Set(fontRecords.map((r) => r.id));
    const favoriteIds = state.favoriteFontIds.filter((id) => matchIds.has(id));
    const recentIds = state.recentFontIds.filter((id) => matchIds.has(id) && !favoriteIds.includes(id));
    const restIds = fontRecords.map((r) => r.id).filter((id) => !favoriteIds.includes(id) && !recentIds.includes(id));
    if (favoriteIds.length > 0) {
      const group = elements.fontSelect.appendChild(document.createElement("optgroup"));
      group.label = msg("favorites");
      favoriteIds.forEach((id) => { const r = fontMap[id]; const label = r.pageFont ? r.name + " \u2014 page font" : r.name + " (" + r.originalFileName + ")"; group.appendChild(new Option(label, r.id)); });
    }
    if (recentIds.length > 0) {
      const group = elements.fontSelect.appendChild(document.createElement("optgroup"));
      group.label = msg("recent");
      recentIds.forEach((id) => { const r = fontMap[id]; const label = r.pageFont ? r.name + " \u2014 page font" : r.name + " (" + r.originalFileName + ")"; group.appendChild(new Option(label, r.id)); });
    }
    if (restIds.length > 0) {
      const group = elements.fontSelect.appendChild(document.createElement("optgroup"));
      group.label = q ? "Results" : msg("allFonts");
      restIds.forEach((id) => { const r = fontMap[id]; const label = r.pageFont ? r.name + " \u2014 page font" : r.name + " (" + r.originalFileName + ")"; group.appendChild(new Option(label, r.id)); });
    }
    const firstId = favoriteIds[0] || recentIds[0] || restIds[0];
    elements.fontSelect.value = state.selectedFontId && fontMap[state.selectedFontId] && matchIds.has(state.selectedFontId)
      ? state.selectedFontId
      : (firstId || "");
  }

  function renderSitesList() {
    if (!elements.sitesList || !elements.sitesEmpty) return;
    const escapeHtml = (value) => String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
    const allHostnames = Object.keys(state.siteSettings).filter((h) => shared.isSupportedPageUrl("https://" + h)).sort();
    const q = (state.sitesSearchQuery || "").trim().toLowerCase();
    let hostnames = q
      ? allHostnames.filter((hostname) => {
          const rules = shared.getSiteRules(hostname, state.siteSettings);
          const firstRule = rules[0];
          const fontName = firstRule?.fontId && state.fonts[firstRule.fontId] ? state.fonts[firstRule.fontId].name : "";
          return hostname.toLowerCase().includes(q) || fontName.toLowerCase().includes(q);
        })
      : allHostnames.slice();
    const sortBy = state.sitesSortBy || "domain";
    if (sortBy !== "domain") {
      hostnames = hostnames.slice().sort((a, b) => {
        const rawA = state.siteSettings[a];
        const rawB = state.siteSettings[b];
        const rulesA = shared.getSiteRules(a, state.siteSettings);
        const rulesB = shared.getSiteRules(b, state.siteSettings);
        const firstA = rulesA[0];
        const firstB = rulesB[0];
        const fontNameA = firstA?.fontId && state.fonts[firstA.fontId] ? state.fonts[firstA.fontId].name : "";
        const fontNameB = firstB?.fontId && state.fonts[firstB.fontId] ? state.fonts[firstB.fontId].name : "";
        const updatedA = (rawA && rawA.updatedAt) || (firstA && firstA.updatedAt) || 0;
        const updatedB = (rawB && rawB.updatedAt) || (firstB && firstB.updatedAt) || 0;
        if (sortBy === "date" || sortBy === "recent") return updatedB - updatedA;
        if (sortBy === "fontName") { const cmp = fontNameA.localeCompare(fontNameB); return cmp !== 0 ? cmp : a.localeCompare(b); }
        return 0;
      });
    } else {
      hostnames.sort((a, b) => a.localeCompare(b));
    }
    elements.sitesList.innerHTML = "";
    hostnames.forEach((hostname) => {
      const raw = state.siteSettings[hostname];
      const rules = shared.getSiteRules(hostname, state.siteSettings);
      const firstRule = rules[0];
      const enabled = !!raw.enabled;
      const fontName = firstRule?.fontId && state.fonts[firstRule.fontId] ? state.fonts[firstRule.fontId].name : "—";
      const targetSummary = firstRule ? getLocalizedTargetSummary(firstRule) : "—";
      const safeHost = escapeHtml(hostname);
      const safeFont = escapeHtml(fontName);
      const safeTarget = escapeHtml(targetSummary);
      const safeFontLabel = escapeHtml(msg("selectedFont"));
      const safeTargetLabel = escapeHtml(msg("applyTo"));
      const hasCopied = !!state.copiedSiteSetting;
      const li = document.createElement("li");
      li.className = "sites-list-item";
      li.innerHTML =
        '<label class="sites-item-toggle"><input type="checkbox" ' + (enabled ? "checked" : "") + ' data-hostname="' + safeHost + '"><span class="sites-item-switch" aria-hidden="true"></span></label>' +
        '<div class="sites-item-main" title="' + safeHost + " · " + safeFont + '">' +
        '<span class="sites-item-domain">' + safeHost + "</span>" +
        '<div class="sites-item-meta">' +
        '<span class="sites-item-meta-label">' + safeFontLabel + '</span>' +
        '<span class="sites-item-meta-value">' + safeFont + '</span>' +
        '<span class="sites-item-meta-sep">/</span>' +
        '<span class="sites-item-meta-label">' + safeTargetLabel + '</span>' +
        '<span class="sites-item-meta-value">' + safeTarget + '</span>' +
        "</div>" +
        "</div>" +
        '<span class="sites-item-actions">' +
        (hasCopied ? '<button type="button" class="button button-text sites-item-paste" data-hostname="' + safeHost + '">' + msg("paste") + "</button>" : "") +
        '<button type="button" class="button button-text sites-item-open" data-hostname="' + safeHost + '">' + msg("open") + '</button>' +
        '<button type="button" class="button button-text sites-item-remove" data-hostname="' + safeHost + '">' + msg("remove") + "</button>" +
        "</span>";
      elements.sitesList.appendChild(li);
    });
    elements.sitesEmpty.hidden = allHostnames.length > 0;
    elements.sitesList.querySelectorAll(".sites-item-toggle input").forEach((input) => {
      input.addEventListener("change", () => popup.handleSiteToggle(input.getAttribute("data-hostname"), input.checked));
    });
    elements.sitesList.querySelectorAll(".sites-item-open").forEach((btn) => {
      btn.addEventListener("click", () => {
        const hostname = btn.getAttribute("data-hostname");
        if (hostname) chrome.tabs.create({ url: "https://" + hostname });
      });
    });
    elements.sitesList.querySelectorAll(".sites-item-paste").forEach((btn) => {
      btn.addEventListener("click", () => popup.handlePasteToSite(btn.getAttribute("data-hostname")));
    });
    elements.sitesList.querySelectorAll(".sites-item-remove").forEach((btn) => {
      btn.addEventListener("click", () => popup.handleSiteRemove(btn.getAttribute("data-hostname")));
    });
  }

  function renderOpenTypeFeatures(selectedFont) {
    const wrap = elements.opentypeFeaturesWrap;
    if (!wrap) return;
    wrap.innerHTML = "";
    let features = selectedFont && Array.isArray(selectedFont.openTypeFeatures) ? selectedFont.openTypeFeatures : [];
    if (selectedFont && selectedFont.dataUrl && !Array.isArray(selectedFont.openTypeFeatures)) {
      ensureFontOpenTypeFeatures(selectedFont).then((feats) => {
        selectedFont.openTypeFeatures = feats;
        state.fonts[selectedFont.id] = selectedFont;
        chrome.storage.local.set({ fonts: state.fonts }).catch(() => {});
        popup.render();
      });
      return;
    }
    if (features.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ot-empty";
      empty.textContent = selectedFont
        ? "No OpenType features detected in this font."
        : "Select a font to see its OpenType features.";
      wrap.appendChild(empty);
      return;
    }
    features.forEach((f) => {
      const label = document.createElement("label");
      label.className = "ot-feat";

      // Determine display: for numbered ss/cv without a custom name, skip the badge
      // (showing "ss01" + "Stylistic Set 1" is redundant)
      const isNumbered = /^(ss\d{2}|cv\d{2})$/i.test(f.tag);
      const hasCustomName = !_isGenericName(f.name, f.tag);
      const showBadge = !isNumbered || hasCustomName;
      const displayName = f.name || _humanizeOTTag(f.tag);

      // Left side: optional tag pill + feature name
      const info = document.createElement("span");
      info.className = "ot-feat-info";

      if (showBadge) {
        const tagBadge = document.createElement("span");
        tagBadge.className = "ot-tag";
        tagBadge.textContent = f.tag.toLowerCase();
        info.appendChild(tagBadge);
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "ot-name";
      nameSpan.textContent = displayName;

      info.appendChild(nameSpan);

      // Right side: custom toggle switch
      const toggleWrap = document.createElement("span");
      toggleWrap.className = "ot-toggle";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.setAttribute("data-tag", f.tag);
      cb.setAttribute("aria-label", f.name || f.tag);

      const track = document.createElement("span");
      track.className = "ot-track";
      track.setAttribute("aria-hidden", "true");

      toggleWrap.appendChild(cb);
      toggleWrap.appendChild(track);

      label.appendChild(info);
      label.appendChild(toggleWrap);
      wrap.appendChild(label);
    });
  }

  // Comprehensive lookup for well-known OpenType feature tags
  var _OT_NAMES = {
    kern:"Kerning", liga:"Standard Ligatures", calt:"Contextual Alternates",
    dlig:"Discretionary Ligatures", rlig:"Required Ligatures", clig:"Contextual Ligatures",
    hlig:"Historical Ligatures", swsh:"Swash", salt:"Stylistic Alternates",
    aalt:"Access All Alternates", hist:"Historical Forms",
    onum:"Oldstyle Figures", lnum:"Lining Figures", pnum:"Proportional Figures",
    tnum:"Tabular Figures", frac:"Fractions", afrc:"Alternative Fractions",
    ordn:"Ordinals", numr:"Numerators", dnom:"Denominators",
    sups:"Superscript", subs:"Subscript", sinf:"Scientific Inferiors",
    smcp:"Small Capitals", c2sc:"Caps to Small Caps", pcap:"Petite Capitals",
    unic:"Unicase", cpsp:"Capital Spacing", "case":"Case Forms",
    titl:"Titling", zero:"Slashed Zero", mgrk:"Mathematical Greek",
    ornm:"Ornaments", nalt:"Alternates", rand:"Randomize",
    vert:"Vertical Writing", vrt2:"Vertical Rotation",
    pwid:"Proportional Widths", fwid:"Full Widths", hwid:"Half Widths",
    rtla:"Right-to-Left Alternates", rtlm:"Right-to-Left Mirroring",
    init:"Initial Forms", medi:"Medial Forms", fina:"Terminal Forms", isol:"Isolated Forms",
  };

  function _humanizeOTTag(tag) {
    if (!tag) return "";
    const lower = tag.toLowerCase();
    if (_OT_NAMES[lower]) return _OT_NAMES[lower];
    const ssMatch = lower.match(/^ss(\d{2})$/);
    if (ssMatch) return "Stylistic Set " + String(parseInt(ssMatch[1], 10));
    const cvMatch = lower.match(/^cv(\d{2})$/);
    if (cvMatch) return "Character Variant " + String(parseInt(cvMatch[1], 10));
    return tag.toUpperCase();
  }

  // Returns true if the font-provided name is just the generic fallback
  function _isGenericName(name, tag) {
    if (!name) return true;
    return name.trim().toLowerCase() === _humanizeOTTag(tag).toLowerCase();
  }

  function updatePreview(selectedFont) {
    let previewStyle = document.getElementById("previewFontStyle");
    if (!previewStyle) {
      previewStyle = document.createElement("style");
      previewStyle.id = "previewFontStyle";
      document.head.appendChild(previewStyle);
    }
    const fallbackFont = '"Ortica Linear", serif';
    const previewFont = !selectedFont
      ? fallbackFont
      : (selectedFont.pageFont && !selectedFont.dataUrl)
        ? '"' + selectedFont.name + '", "Ortica Linear", serif'
        : '"__font_plugin_preview", "Ortica Linear", serif';
    if (!selectedFont) {
      previewStyle.textContent = "";
    } else if (selectedFont.pageFont && !selectedFont.dataUrl) {
      // Page-reference font: already loaded in the page, use its family name directly
      previewStyle.textContent = "";
    } else {
      previewStyle.textContent = [
        "@font-face {",
        '  font-family: "__font_plugin_preview";',
        '  src: url("' + selectedFont.dataUrl + '")' + (selectedFont.format ? ' format("' + selectedFont.format + '")' : "") + ";",
        "  font-display: swap;",
        "}"
      ].join("\n");
    }
    const fontSize = typeof state.draftSetting.typography.fontSizePx === "number" ? state.draftSetting.typography.fontSizePx + "px" : "19px";
    const lineHeight = state.draftSetting.typography.lineHeight === null ? "" : String(state.draftSetting.typography.lineHeight);
    const letterSpacing = state.draftSetting.typography.letterSpacingEm === 0 ? "" : state.draftSetting.typography.letterSpacingEm + "em";
    const fontWeight = state.draftSetting.typography.fontWeight === null ? "" : String(state.draftSetting.typography.fontWeight);
    const previewStyles = { fontFamily: previewFont, fontSize, lineHeight, letterSpacing, fontWeight };
    const uploadPreviewText = document.getElementById("uploadPreviewText");
    const uploadPreviewDetail = document.getElementById("uploadPreviewDetail");
    if (uploadPreviewText) Object.assign(uploadPreviewText.style, previewStyles);
    if (uploadPreviewDetail) uploadPreviewDetail.style.fontFamily = previewFont;
    const applyPreviewWrap = document.getElementById("applyPreviewWrap");
    const applyPreviewText = document.getElementById("applyPreviewText");
    const applyPreviewDetail = document.getElementById("applyPreviewDetail");
    if (applyPreviewWrap) applyPreviewWrap.hidden = !selectedFont;
    // For page fonts with a canvas preview image, show it instead of styled text
    const hasCanvasPreview = selectedFont && selectedFont._pagePreviewImg;
    let canvasImgEl = applyPreviewWrap ? applyPreviewWrap.querySelector(".page-canvas-preview") : null;
    if (hasCanvasPreview) {
      if (!canvasImgEl && applyPreviewWrap) {
        canvasImgEl = document.createElement("img");
        canvasImgEl.className = "page-canvas-preview";
        applyPreviewWrap.insertBefore(canvasImgEl, applyPreviewWrap.firstChild);
      }
      if (canvasImgEl) canvasImgEl.src = selectedFont._pagePreviewImg;
    } else {
      if (canvasImgEl) canvasImgEl.remove();
    }
    // Hide slider row and detail text when showing canvas image (page font)
    const sizeRow = document.getElementById("previewSizeSlider") ? document.getElementById("previewSizeSlider").closest(".preview-size-row") : null;
    if (sizeRow) sizeRow.hidden = !!hasCanvasPreview;
    if (applyPreviewDetail) applyPreviewDetail.hidden = !!hasCanvasPreview;
    if (applyPreviewText) {
      applyPreviewText.hidden = !!hasCanvasPreview;
      if (!hasCanvasPreview) {
        Object.assign(applyPreviewText.style, previewStyles);
        // Slider independently controls specimen font size — restore after assign
        const sizeSlider = document.getElementById("previewSizeSlider");
        if (sizeSlider) applyPreviewText.style.fontSize = sizeSlider.value + "px";
      }
    }
    if (applyPreviewDetail && !hasCanvasPreview) applyPreviewDetail.style.fontFamily = previewFont;
  }

  function renderRulesChips() {
    const rulesChips = elements.rulesChips;
    if (!rulesChips) return;
    rulesChips.innerHTML = "";

    const modeLabel = function(rule) {
      if (!rule) return "Whole page";
      switch (rule.targetMode) {
        case shared.TARGET_MODES.PAGE:     return "Whole page";
        case shared.TARGET_MODES.CONTENT:  return "Article";
        case shared.TARGET_MODES.HEADINGS: return "Headings";
        case shared.TARGET_MODES.SELECTOR: return rule.targetLabel || "Custom";
        default: return "Whole page";
      }
    };

    // When no saved rules yet, render a single virtual chip from current draft
    const rules = state.siteRules.length > 0
      ? state.siteRules
      : [{ ...state.draftSetting, fontId: state.selectedFontId }];
    const isVirtual = state.siteRules.length === 0;

    rules.forEach(function(rule, i) {
      const isActive = i === state.activeRuleIdx;
      const fontRec = rule.fontId && state.fonts[rule.fontId] ? state.fonts[rule.fontId] : null;
      // For active rule, use live draft values so chip reflects unsaved edits
      const effectiveMode = isActive && !isVirtual ? state.draftSetting.targetMode : rule.targetMode;
      const effectiveFontId = isActive && !isVirtual ? state.selectedFontId : rule.fontId;
      const effectiveFontRec = effectiveFontId && state.fonts[effectiveFontId] ? state.fonts[effectiveFontId] : fontRec;
      const effectiveLabel = isActive && !isVirtual && state.draftSetting.targetLabel ? state.draftSetting.targetLabel : rule.targetLabel;
      const effectiveRule = { ...rule, targetMode: effectiveMode, targetLabel: effectiveLabel };
      const chipLabel = modeLabel(effectiveRule) + (effectiveFontRec ? " \u00b7 " + effectiveFontRec.name : "");
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "rule-chip" + (isActive ? " active" : "");
      if (!isVirtual) chip.setAttribute("data-rule-idx", String(i));
      chip.title = isVirtual ? "Tap Apply to save this rule" : chipLabel;
      const labelSpan = document.createElement("span");
      labelSpan.textContent = chipLabel;
      chip.appendChild(labelSpan);
      // × only on non-active chips when there are 2+ real rules
      if (!isVirtual && rules.length > 1 && !isActive) {
        const del = document.createElement("span");
        del.className = "rule-chip-del";
        del.textContent = "\u00d7";
        del.setAttribute("data-del-idx", String(i));
        chip.appendChild(del);
      }
      rulesChips.appendChild(chip);
    });

    // Update "editing" label
    const editingLabel = elements.rulesEditingLabel;
    if (editingLabel) {
      if (!isVirtual && rules.length > 1) {
        const activeRule = rules[state.activeRuleIdx];
        const effectiveMode = state.draftSetting.targetMode;
        const effectiveFontId = state.selectedFontId;
        const fontRec = effectiveFontId && state.fonts[effectiveFontId] ? state.fonts[effectiveFontId] : null;
        const activeEffectiveRule = { ...activeRule, targetMode: effectiveMode };
        editingLabel.textContent = "Editing: " + modeLabel(activeEffectiveRule) + (fontRec ? " \u00b7 " + fontRec.name : "") + " — click a chip to switch";
        editingLabel.hidden = false;
      } else if (!isVirtual && rules.length === 1) {
        editingLabel.textContent = "1 rule active — click \u201C+ Add rule\u201D to layer another font";
        editingLabel.hidden = false;
      } else {
        editingLabel.textContent = "Configure settings above, then click Apply to save";
        editingLabel.hidden = false;
      }
    }
  }

  function render() {
    const activeSetting = getActiveSiteSetting();
    const selectedFont = state.selectedFontId ? state.fonts[state.selectedFontId] : null;
    const fileCount = elements.fontFile.files ? elements.fontFile.files.length : 0;
    const targetSummary = getLocalizedTargetSummary(state.draftSetting);

    renderFontSelect();
    renderOpenTypeFeatures(selectedFont);
    renderRulesChips();
    syncFormValuesFromState();

    const overrideOn = state.supportedPage && !!activeSetting.enabled;
    elements.overrideCheckbox.checked = overrideOn;
    elements.overrideCheckbox.disabled = !state.supportedPage;
    // Sync On/Off label and site-dot — programmatic .checked doesn't fire 'change'
    if (elements.ovrText) elements.ovrText.textContent = overrideOn ? "On" : "Off";
    if (elements.siteDot) {
      elements.siteDot.classList.toggle("live", overrideOn);
      elements.siteDot.classList.toggle("off", !overrideOn);
    }
    switchTab(state.activeTab);
    elements.favoriteButton.hidden = !state.selectedFontId;
    if (elements.favoriteButton && !elements.favoriteButton.hidden) {
      elements.favoriteButton.classList.toggle("is-favorite", state.favoriteFontIds.includes(state.selectedFontId));
      elements.favoriteButton.setAttribute("aria-label", state.favoriteFontIds.includes(state.selectedFontId) ? msg("removeFromFavorites") : msg("addToFavorites"));
    }
    elements.siteLabel.textContent = buildSiteLabel(activeSetting);
    elements.targetSummary.textContent = state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && !state.draftSetting.targetSelector
      ? msg("pickedElementNotYet")
      : targetSummary;
    elements.selectorWarning.hidden = state.draftSetting.targetMode !== shared.TARGET_MODES.SELECTOR;
    const showTargetNotFound = state.supportedPage && state.currentHostname && !!state.targetNotFoundHosts[state.currentHostname];
    if (elements.targetNotFoundBanner) elements.targetNotFoundBanner.hidden = !showTargetNotFound;
    elements.pickerButton.textContent = state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && state.draftSetting.targetSelector ? msg("repickElement") : msg("pickOnPage");
    elements.uploadButton.disabled = fileCount === 0;
    // Disable Apply tab when no fonts are loaded — upload first, then apply
    const hasFonts = Object.keys(state.fonts).length > 0;
    if (elements.tabApply) {
      elements.tabApply.disabled = !hasFonts;
      elements.tabApply.classList.toggle("tab-disabled", !hasFonts);
    }
    if (elements.storageUsage) {
      const mb = (state.storageBytesUsed / (1024 * 1024)).toFixed(1);
      const warn = state.storageBytesUsed >= STORAGE_WARN_BYTES;
      elements.storageUsage.textContent = msg("storageUsed", [mb]) + (warn ? msg("storageWarn") : ".");
      elements.storageUsage.classList.toggle("storage-warn", warn);
    }
    elements.fontSelect.disabled = !state.supportedPage || getSortedFontRecords().length === 0;
    elements.targetModeSelect.disabled = !state.supportedPage;
    elements.textOnlyCheckbox.disabled = !state.supportedPage;
    if (elements.relaxLayoutCheckbox) elements.relaxLayoutCheckbox.disabled = !state.supportedPage;
    elements.fontSizeInput.disabled = !state.supportedPage;
    elements.lineHeightInput.disabled = !state.supportedPage;
    elements.letterSpacingInput.disabled = !state.supportedPage;
    elements.fontWeightSelect.disabled = !state.supportedPage;
    if (elements.fontStyleSelect) elements.fontStyleSelect.disabled = !state.supportedPage;
    if (elements.wordSpacingInput) elements.wordSpacingInput.disabled = !state.supportedPage;
    if (elements.textTransformSelect) elements.textTransformSelect.disabled = !state.supportedPage;
    if (elements.textColorInput) elements.textColorInput.disabled = !state.supportedPage;
    if (elements.textDecorationSelect) elements.textDecorationSelect.disabled = !state.supportedPage;
    if (elements.textShadowSelect) elements.textShadowSelect.disabled = !state.supportedPage;
    if (elements.textOpacityInput) elements.textOpacityInput.disabled = !state.supportedPage;
    if (elements.copyCssButton) elements.copyCssButton.disabled = !state.selectedFontId || !state.fonts[state.selectedFontId];
    elements.applyButton.disabled = !state.supportedPage || !state.selectedFontId || (state.draftSetting.targetMode === shared.TARGET_MODES.SELECTOR && !state.draftSetting.targetSelector);
    elements.resetButton.disabled = !state.supportedPage || !state.siteSettings[state.currentHostname];
    elements.deleteButton.disabled = !selectedFont;
    elements.pickerButton.disabled = !state.supportedPage;
    const uploadPreviewWrap = document.getElementById("uploadPreviewWrap");
    if (uploadPreviewWrap) uploadPreviewWrap.hidden = getSortedFontRecords().length === 0;
    updatePreview(selectedFont);
  }

  popup.renderRulesChips = renderRulesChips;
  popup.ensureFontOpenTypeFeatures = ensureFontOpenTypeFeatures;
  popup.buildSiteLabel = buildSiteLabel;
  popup.syncFormValuesFromState = syncFormValuesFromState;
  popup.renderFontSelect = renderFontSelect;
  popup.renderSitesList = renderSitesList;
  popup.renderOpenTypeFeatures = renderOpenTypeFeatures;
  popup.updatePreview = updatePreview;
  popup.render = render;
})();
