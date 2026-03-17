(function initFontPluginRuntime(global) {
  if (global.FontPluginRuntime && global.FontPluginRuntime.initialized) {
    return;
  }

  const shared = global.FontPluginShared;
  const STYLE_ID = "uploaded-font-switcher-style";
  const PICKER_STYLE_ID = "uploaded-font-switcher-picker-style";
  const PICKER_BOX_ID = "uploaded-font-switcher-picker-box";
  const PICKER_BADGE_ID = "uploaded-font-switcher-picker-badge";
  const PICKER_TOAST_ID = "uploaded-font-switcher-picker-toast";
  const PAGE_BADGE_ID = "uploaded-font-switcher-page-badge";
  const STYLE_ID_SHADOW = "uploaded-font-switcher-style";
  let pickerState = null;
  let currentShadowCssText = "";
  const injectedShadowRoots = new Set();
  let overridePaused = false; // Before/After toggle

  async function refresh() {
    if (overridePaused) return;
    const hostname = global.location && global.location.hostname;
    if (!hostname) {
      removeStyle();
      return;
    }

    const stored = await chrome.storage.local.get(shared.STORAGE_KEYS);
    const fonts = stored.fonts || {};
    const siteSettings = stored.siteSettings || {};
    const defaultTypography = stored.defaultTypography || {};
    const globalOverride = stored.globalOverride && typeof stored.globalOverride === "object" ? stored.globalOverride : { enabled: false, fontId: "" };
    const rawSite = siteSettings[hostname];
    let rules = (rawSite && rawSite.enabled ? shared.getSiteRules(hostname, siteSettings) : []).filter((r) => r.fontId && fonts[r.fontId]);
    if (rules.length === 0 && globalOverride.enabled && globalOverride.fontId && fonts[globalOverride.fontId]) {
      const globalRule = shared.normalizeSiteSetting({
        enabled: true,
        fontId: globalOverride.fontId,
        targetMode: shared.TARGET_MODES.PAGE,
        targetSelector: "",
        targetSelectorFallback: "",
        targetLabel: "",
        textOnly: false,
        fontFeatureSettings: (defaultTypography.fontFeatureSettings || "").trim() || (globalOverride.fontFeatureSettings || "").trim(),
        typography: {
          fontSizePercent: defaultTypography.fontSizePercent != null ? defaultTypography.fontSizePercent : 100,
          lineHeight: defaultTypography.lineHeight,
          letterSpacingEm: defaultTypography.letterSpacingEm != null ? defaultTypography.letterSpacingEm : 0,
          fontWeight: defaultTypography.fontWeight,
          fontStyle: defaultTypography.fontStyle || "normal",
          wordSpacingEm: defaultTypography.wordSpacingEm != null ? defaultTypography.wordSpacingEm : 0,
          textTransform: defaultTypography.textTransform || "none"
        },
        updatedAt: 0
      });
      rules = [globalRule];
    }
    if (rules.length === 0) {
      removeStyle();
      removeBadge();
      return;
    }
    const blocks = [];
    const shadowBlocks = [];
    let targetNotFound = false;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const fontRecord = rule.fontId ? fonts[rule.fontId] : null;
      if (!fontRecord) {
        continue;
      }

      let resolvedRule = { ...rule };
      if (rule.targetMode === shared.TARGET_MODES.SELECTOR && rule.targetSelector) {
        const primaryMatches = safeQuerySelectorAll(rule.targetSelector);
        const useFallback = primaryMatches.length === 0 && rule.targetSelectorFallback;
        const fallbackMatches = useFallback ? safeQuerySelectorAll(rule.targetSelectorFallback) : [];
        const effectiveSelector = useFallback
          ? (fallbackMatches.length > 0 ? rule.targetSelectorFallback : "body")
          : rule.targetSelector;
        if (effectiveSelector === "body" && primaryMatches.length === 0) {
          targetNotFound = true;
        }
        resolvedRule = { ...resolvedRule, targetSelector: effectiveSelector };
      }

      blocks.push(shared.buildFontOverrideCss(fontRecord, resolvedRule, i));
      shadowBlocks.push(shared.buildFontOverrideCssForShadow(fontRecord, resolvedRule, i));
    }

    if (blocks.length === 0) {
      removeStyle();
      removeBadge();
    } else {
      currentShadowCssText = shadowBlocks.join("\n\n");
      global.document.documentElement.setAttribute("data-font-plugin-active", "");
      upsertStyle(blocks.join("\n\n"));
      removeStyleFromAllShadowRoots();
      injectIntoAllShadowRoots(currentShadowCssText);
      observeStyleNode();
      observeHeadToStayLast();
      observeShadowRoots();
      const showBadge = stored.showPageBadge !== false;
      if (showBadge) {
        const names = rules
          .map((r) => (r.fontId && fonts[r.fontId] ? fonts[r.fontId].name : null))
          .filter(Boolean);
        upsertBadge(names.length ? "Font: " + names.join(", ") : null);
      } else {
        removeBadge();
      }
    }

    const storedForFlag = await chrome.storage.local.get("targetNotFoundHosts");
    const hosts = { ...(storedForFlag.targetNotFoundHosts || {}) };
    if (targetNotFound) {
      hosts[hostname] = true;
    } else {
      delete hosts[hostname];
    }
    await chrome.storage.local.set({ targetNotFoundHosts: hosts });
  }

  function safeQuerySelectorAll(selector) {
    try {
      return Array.from(global.document.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function upsertStyle(cssText) {
    const insertPoint = getStyleInsertPoint();
    let styleNode = global.document.getElementById(STYLE_ID);
    if (!styleNode) {
      styleNode = global.document.createElement("style");
      styleNode.id = STYLE_ID;
    }
    styleNode.textContent = cssText;
    insertPoint.appendChild(styleNode);
  }

  function removeStyle() {
    global.document.documentElement.removeAttribute("data-font-plugin-active");
    const styleNode = global.document.getElementById(STYLE_ID);
    if (styleNode) {
      styleNode.remove();
    }
    removeStyleFromAllShadowRoots();
    removeBadge();
  }

  function collectAllShadowRoots() {
    const roots = [];
    const walk = (parent) => {
      if (!parent || !parent.querySelectorAll) {
        return;
      }
      const elements = parent.querySelectorAll("*");
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        if (el.shadowRoot) {
          roots.push(el.shadowRoot);
          walk(el.shadowRoot);
        }
      }
    };
    const doc = global.document;
    if (doc.head) walk(doc.head);
    if (doc.body) walk(doc.body);
    return roots;
  }

  function injectIntoShadowRoot(root, cssText) {
    if (!root || !cssText) return;
    let styleNode = root.querySelector ? root.querySelector("#" + STYLE_ID_SHADOW) : null;
    if (!styleNode) {
      styleNode = global.document.createElement("style");
      styleNode.id = STYLE_ID_SHADOW;
    }
    styleNode.textContent = cssText;
    root.appendChild(styleNode);
    injectedShadowRoots.add(root);
  }

  function removeStyleFromAllShadowRoots() {
    injectedShadowRoots.forEach((root) => {
      try {
        const styleNode = root.querySelector ? root.querySelector("#" + STYLE_ID_SHADOW) : null;
        if (styleNode) styleNode.remove();
      } catch (_) {}
    });
    injectedShadowRoots.clear();
  }

  function injectIntoAllShadowRoots(cssText) {
    if (!cssText) return;
    collectAllShadowRoots().forEach((root) => {
      if (!injectedShadowRoots.has(root)) {
        injectIntoShadowRoot(root, cssText);
      }
    });
  }

  function observeShadowRoots() {
    if (global._fontPluginShadowObserver) return;
    const observer = new MutationObserver(() => {
      if (!currentShadowCssText) return;
      injectIntoAllShadowRoots(currentShadowCssText);
    });
    const doc = global.document;
    const observeTarget = doc.body || doc.documentElement;
    if (observeTarget) {
      observer.observe(observeTarget, { childList: true, subtree: true });
      global._fontPluginShadowObserver = observer;
    }
  }

  function getStyleInsertPoint() {
    const head = global.document.head;
    return head || global.document.documentElement;
  }

  function observeHeadToStayLast() {
    if (global._fontPluginHeadObserver) {
      return;
    }
    const insertPoint = getStyleInsertPoint();
    const observer = new MutationObserver((mutations) => {
      const ourStyle = global.document.getElementById(STYLE_ID);
      if (!ourStyle || !ourStyle.parentNode) {
        return;
      }
      let shouldMove = false;
      for (const mutation of mutations) {
        if (mutation.type !== "childList" || !mutation.addedNodes.length) {
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (!node || node.nodeType !== 1) {
            continue;
          }
          const tag = node.tagName && node.tagName.toUpperCase();
          const isStyle = tag === "STYLE";
          const isStylesheetLink =
            tag === "LINK" && node.getAttribute && node.getAttribute("rel") === "stylesheet";
          if (isStyle || isStylesheetLink) {
            if (node !== ourStyle && insertPoint.contains(node) && insertPoint.contains(ourStyle)) {
              const ourIdx = Array.from(insertPoint.children).indexOf(ourStyle);
              const newIdx = Array.from(insertPoint.children).indexOf(node);
              if (newIdx > ourIdx) {
                shouldMove = true;
                break;
              }
            }
          }
        }
        if (shouldMove) break;
      }
      if (shouldMove && ourStyle && ourStyle.parentNode === insertPoint) {
        insertPoint.appendChild(ourStyle);
      }
    });
    observer.observe(insertPoint, { childList: true, subtree: false });
    global._fontPluginHeadObserver = observer;
  }

  function upsertBadge(text) {
    let el = global.document.getElementById(PAGE_BADGE_ID);
    if (!text) {
      if (el) el.remove();
      return;
    }
    if (!el) {
      el = global.document.createElement("div");
      el.id = PAGE_BADGE_ID;
      el.setAttribute("aria-hidden", "true");
      el.style.cssText =
        "position:fixed;bottom:10px;right:10px;z-index:2147483646;font:11px/1.2 system-ui,sans-serif;" +
        "color:rgba(0,0,0,0.55);background:rgba(255,255,255,0.88);padding:4px 8px;border-radius:4px;" +
        "box-shadow:0 1px 4px rgba(0,0,0,0.12);pointer-events:none;";
      global.document.body.appendChild(el);
    }
    el.textContent = text;
  }

  function removeBadge() {
    const el = global.document.getElementById(PAGE_BADGE_ID);
    if (el) el.remove();
  }

  function observeStyleNode() {
    if (global._fontPluginStyleObserver) {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList" || !mutation.removedNodes.length) {
          continue;
        }
        for (const node of mutation.removedNodes) {
          if (node && node.id === STYLE_ID) {
            refresh().catch(() => {});
            return;
          }
        }
      }
    });
    observer.observe(global.document.documentElement, { childList: true, subtree: true });
    global._fontPluginStyleObserver = observer;
  }

  function ensurePickerChrome() {
    if (!global.document.getElementById(PICKER_STYLE_ID)) {
      const styleNode = global.document.createElement("style");
      styleNode.id = PICKER_STYLE_ID;
      styleNode.textContent = [
        "#" + PICKER_BOX_ID + " {",
        "  position: fixed;",
        "  z-index: 2147483646;",
        "  pointer-events: none;",
        "  border: 2px solid rgba(59, 130, 246, 0.85);",
        "  border-radius: 8px;",
        "  background: rgba(59, 130, 246, 0.06);",
        "  box-shadow: 0 0 0 1px rgba(255,255,255,0.4), 0 4px 24px rgba(0,0,0,0.12);",
        "  transition: top 0.12s ease-out, left 0.12s ease-out, width 0.12s ease-out, height 0.12s ease-out, opacity 0.15s ease;",
        "}",
        "#" + PICKER_BADGE_ID + " {",
        "  position: fixed;",
        "  top: 20px;",
        "  left: 50%;",
        "  transform: translateX(-50%);",
        "  z-index: 2147483647;",
        "  display: flex;",
        "  align-items: center;",
        "  gap: 10px;",
        "  padding: 12px 18px;",
        "  border-radius: 9999px;",
        "  background: rgba(30, 30, 30, 0.94);",
        "  color: #f4f4f5;",
        "  font: 13px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
        "  letter-spacing: 0.02em;",
        "  box-shadow: 0 8px 32px rgba(0,0,0,0.24), 0 0 0 1px rgba(255,255,255,0.06);",
        "  max-width: min(420px, calc(100vw - 32px));",
        "  pointer-events: none;",
        "}",
        "#" + PICKER_BADGE_ID + " .fps-icon {",
        "  flex-shrink: 0;",
        "  width: 18px;",
        "  height: 18px;",
        "  border-radius: 4px;",
        "  background: rgba(59, 130, 246, 0.35);",
        "  border: 1px solid rgba(59, 130, 246, 0.5);",
        "}",
        "#" + PICKER_BADGE_ID + " .fps-text {",
        "  min-width: 0;",
        "}",
        "#" + PICKER_TOAST_ID + " {",
        "  position: fixed;",
        "  bottom: 24px;",
        "  left: 50%;",
        "  transform: translateX(-50%) translateY(12px);",
        "  z-index: 2147483647;",
        "  display: flex;",
        "  align-items: center;",
        "  gap: 10px;",
        "  padding: 12px 20px;",
        "  border-radius: 12px;",
        "  background: rgba(22, 101, 52, 0.94);",
        "  color: #f0fdf4;",
        "  font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;",
        "  box-shadow: 0 8px 32px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.08);",
        "  opacity: 0;",
        "  transition: opacity 0.2s ease, transform 0.2s ease;",
        "  pointer-events: none;",
        "}",
        "#" + PICKER_TOAST_ID + ".visible {",
        "  opacity: 1;",
        "  transform: translateX(-50%) translateY(0);",
        "}",
        "#" + PICKER_TOAST_ID + " .fps-check {",
        "  flex-shrink: 0;",
        "  width: 18px;",
        "  height: 18px;",
        "  border: 2px solid currentColor;",
        "  border-radius: 50%;",
        "  background: transparent;",
        "  position: relative;",
        "}",
        "#" + PICKER_TOAST_ID + " .fps-check::after {",
        "  content: '';",
        "  position: absolute;",
        "  left: 4px;",
        "  top: 1px;",
        "  width: 5px;",
        "  height: 9px;",
        "  border: solid currentColor;",
        "  border-width: 0 2px 2px 0;",
        "  transform: rotate(45deg);",
        "}"
      ].join("\n");
      global.document.documentElement.appendChild(styleNode);
    }

    let box = global.document.getElementById(PICKER_BOX_ID);
    if (!box) {
      box = global.document.createElement("div");
      box.id = PICKER_BOX_ID;
      global.document.documentElement.appendChild(box);
    }

    let badge = global.document.getElementById(PICKER_BADGE_ID);
    if (!badge) {
      badge = global.document.createElement("div");
      badge.id = PICKER_BADGE_ID;
      badge.innerHTML = '<span class="fps-icon" aria-hidden="true"></span><span class="fps-text"></span>';
      global.document.documentElement.appendChild(badge);
    }

    let toast = global.document.getElementById(PICKER_TOAST_ID);
    if (!toast) {
      toast = global.document.createElement("div");
      toast.id = PICKER_TOAST_ID;
      toast.setAttribute("role", "status");
      toast.innerHTML = '<span class="fps-check" aria-hidden="true"></span><span class="fps-toast-msg"></span>';
      global.document.documentElement.appendChild(toast);
    }

    return { box, badge, toast };
  }

  function startPicker() {
    if (pickerState && pickerState.active) {
      return;
    }

    const chromeNodes = ensurePickerChrome();
    pickerState = {
      active: true,
      currentElement: null,
      box: chromeNodes.box,
      badge: chromeNodes.badge,
      toast: chromeNodes.toast
    };

    const badgeText = pickerState.badge.querySelector(".fps-text");
    if (badgeText) badgeText.textContent = "Hover a block, click to select. Esc to cancel.";
    pickerState.badge.style.display = "flex";
    updatePickerVisibility(false);

    pickerState.handleMove = (event) => {
      const candidate = getPickerCandidate(event.target);
      if (!candidate || candidate === pickerState.currentElement) {
        return;
      }

      pickerState.currentElement = candidate;
      updatePickerHighlight(candidate);
    };

    pickerState.handleScroll = () => {
      if (pickerState && pickerState.currentElement) {
        updatePickerHighlight(pickerState.currentElement);
      }
    };

    pickerState.handleClick = function(event) {
      if (!pickerState || !pickerState.active) {
        return;
      }
      // Stop immediately — before any page handlers run
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const candidate = getPickerCandidate(event.target);
      if (!candidate) {
        return;
      }

      const selector = buildUniqueSelector(candidate);
      const fallbackSelector = buildFallbackSelector(candidate);
      const label = describeElement(candidate);
      // Stop picker immediately so the visual clears right away
      stopPicker();
      persistPickedTarget(selector, label, fallbackSelector)
        .then(function() {
          showPickerToast('✓ "' + label + '" — reopen Koppl to continue.');
        })
        .catch(function() {
          showPickerToast('Could not save target. Try again.');
        });
    };

    pickerState.handleKeyDown = (event) => {
      if (event.key === "Escape") {
        showPickerToast("Element picker cancelled.");
        stopPicker();
      }
    };

    global.addEventListener("mousemove", pickerState.handleMove, true);
    global.addEventListener("mousedown", pickerState.handleClick, true);
    global.addEventListener("keydown", pickerState.handleKeyDown, true);
    global.addEventListener("scroll", pickerState.handleScroll, true);
  }

  function stopPicker() {
    if (!pickerState || !pickerState.active) {
      return;
    }

    global.removeEventListener("mousemove", pickerState.handleMove, true);
    global.removeEventListener("mousedown", pickerState.handleClick, true);
    global.removeEventListener("keydown", pickerState.handleKeyDown, true);
    global.removeEventListener("scroll", pickerState.handleScroll, true);
    updatePickerVisibility(false);
    const badgeText = pickerState.badge.querySelector(".fps-text");
    if (badgeText) badgeText.textContent = "";
    pickerState.badge.style.display = "none";
    pickerState.currentElement = null;
    pickerState.active = false;
  }

  async function persistPickedTarget(selector, label, fallbackSelector) {
    const hostname = global.location && global.location.hostname;
    if (!hostname) {
      return;
    }

    const stored = await chrome.storage.local.get(shared.STORAGE_KEYS);
    const nextSiteSettings = { ...(stored.siteSettings || {}) };
    const currentSetting = shared.normalizeSiteSetting(nextSiteSettings[hostname]);

    nextSiteSettings[hostname] = {
      ...currentSetting,
      targetMode: shared.TARGET_MODES.SELECTOR,
      targetSelector: selector,
      targetSelectorFallback: fallbackSelector || "",
      targetLabel: label,
      updatedAt: Date.now()
    };

    await chrome.storage.local.set({ siteSettings: nextSiteSettings });
    await refresh();
  }

  function updatePickerHighlight(element) {
    if (!pickerState) {
      return;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      updatePickerVisibility(false);
      return;
    }

    const badgeText = pickerState.badge.querySelector(".fps-text");
    if (badgeText) badgeText.textContent = "Select \u201C" + describeElement(element) + "\u201D \u2022 Esc to cancel";
    pickerState.box.style.top = rect.top + "px";
    pickerState.box.style.left = rect.left + "px";
    pickerState.box.style.width = rect.width + "px";
    pickerState.box.style.height = rect.height + "px";
    updatePickerVisibility(true);
  }

  function updatePickerVisibility(visible) {
    if (!pickerState) {
      return;
    }

    pickerState.box.style.display = visible ? "block" : "none";
  }

  function showPickerToast(message) {
    const { toast } = ensurePickerChrome();
    const msgEl = toast.querySelector(".fps-toast-msg");
    if (msgEl) msgEl.textContent = message;
    toast.classList.add("visible");
    global.setTimeout(() => {
      toast.classList.remove("visible");
    }, 2200);
  }

  function getPickerCandidate(startNode) {
    let element = startNode && startNode.nodeType === Node.ELEMENT_NODE ? startNode : startNode && startNode.parentElement;

    while (element && element !== global.document.body) {
      if (element.id === PICKER_BOX_ID || element.id === PICKER_BADGE_ID || element.id === PICKER_TOAST_ID) {
        return null;
      }

      if (element.matches("article, main, [role='main'], .content, .post-content, .entry-content, .article-content, .prose, section, div, p, h1, h2, h3, h4, h5, h6, blockquote, aside, ul, ol, li")) {
        return element;
      }

      element = element.parentElement;
    }

    return global.document.body;
  }

  function buildUniqueSelector(element) {
    if (element === global.document.body) {
      return "body";
    }

    if (element.id) {
      const idSelector = "#" + escapeCss(element.id);
      if (isUniqueSelector(idSelector)) {
        return idSelector;
      }
    }

    let current = element;
    const parts = [];

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== global.document.body) {
      let selectorPart = current.localName;
      const classNames = Array.from(current.classList || [])
        .filter((className) => /^[a-zA-Z0-9_-]+$/.test(className))
        .slice(0, 2);

      if (classNames.length > 0) {
        selectorPart += classNames.map((className) => "." + escapeCss(className)).join("");
        if (isUniqueSelector(selectorPart)) {
          return selectorPart;
        }
      }

      const sameTagSiblings = Array.from(current.parentElement ? current.parentElement.children : []).filter((node) => node.localName === current.localName);
      if (sameTagSiblings.length > 1) {
        selectorPart += ":nth-of-type(" + (sameTagSiblings.indexOf(current) + 1) + ")";
      }

      parts.unshift(selectorPart);
      const fullSelector = "body > " + parts.join(" > ");
      if (isUniqueSelector(fullSelector)) {
        return fullSelector;
      }

      current = current.parentElement;
    }

    return "body > " + parts.join(" > ");
  }

  function buildFallbackSelector(element) {
    if (element === global.document.body) {
      return "body";
    }

    if (element.id) {
      const idSelector = "#" + escapeCss(element.id);
      try {
        if (global.document.querySelector(idSelector)) {
          return idSelector;
        }
      } catch (e) {
        // ignore
      }
    }

    let current = element;
    const parts = [];

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== global.document.body) {
      let selectorPart = current.localName;
      const classNames = Array.from(current.classList || [])
        .filter((className) => /^[a-zA-Z0-9_-]+$/.test(className))
        .slice(0, 2);
      if (classNames.length > 0) {
        selectorPart += classNames.map((className) => "." + escapeCss(className)).join("");
      }
      parts.unshift(selectorPart);
      current = current.parentElement;
    }

    const full = "body > " + parts.join(" > ");
    try {
      return global.document.querySelector(full) ? full : "body";
    } catch (e) {
      return "body";
    }
  }

  function isUniqueSelector(selector) {
    try {
      return global.document.querySelectorAll(selector).length === 1;
    } catch (error) {
      return false;
    }
  }

  function describeElement(element) {
    if (!element) {
      return "element";
    }

    const tagName = element.localName;
    if (element.id) {
      return tagName + "#" + element.id;
    }

    const classNames = Array.from(element.classList || []).slice(0, 2);
    if (classNames.length > 0) {
      return tagName + "." + classNames.join(".");
    }

    return tagName;
  }

  function escapeCss(value) {
    if (global.CSS && typeof global.CSS.escape === "function") {
      return global.CSS.escape(value);
    }

    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  // ── Dim-and-capture picker ─────────────────────────────────────
  const DIM_OVERLAY_ID  = "uploaded-font-switcher-dim-overlay";
  const DIM_BORDER_ID   = "uploaded-font-switcher-dim-border";
  const DIM_BADGE_ID    = "uploaded-font-switcher-dim-badge";
  let dimPickerState = null;

  function startDimPicker() {
    if (dimPickerState && dimPickerState.active) return;

    // Full-screen dim overlay — clip-path cuts a spotlight hole, opacity fades in
    const overlay = global.document.createElement("div");
    overlay.id = DIM_OVERLAY_ID;
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.28);z-index:2147483640;" +
      "pointer-events:none;opacity:0;transition:opacity 320ms ease,clip-path 90ms ease;";
    global.document.documentElement.appendChild(overlay);
    // Trigger fade-in on next frame
    global.requestAnimationFrame(function() { overlay.style.opacity = "1"; });

    // White highlight border around the focused element
    const border = global.document.createElement("div");
    border.id = DIM_BORDER_ID;
    border.style.cssText = "position:fixed;z-index:2147483641;pointer-events:none;display:none;" +
      "border:2px solid rgba(255,255,255,0.88);border-radius:5px;" +
      "box-shadow:0 0 0 1px rgba(0,0,0,0.18),0 4px 24px rgba(0,0,0,0.22);" +
      "transition:top 80ms ease,left 80ms ease,width 80ms ease,height 80ms ease,opacity 160ms ease;";
    global.document.documentElement.appendChild(border);

    // Instructions badge — slides down from top
    const badge = global.document.createElement("div");
    badge.id = DIM_BADGE_ID;
    badge.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%) translateY(-8px);" +
      "z-index:2147483647;padding:10px 20px;border-radius:9999px;" +
      "background:rgba(18,18,18,0.92);color:#f0f0ee;" +
      "font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
      "letter-spacing:0.02em;pointer-events:none;opacity:0;" +
      "transition:opacity 280ms ease,transform 280ms ease;" +
      "box-shadow:0 4px 24px rgba(0,0,0,0.28),0 0 0 1px rgba(255,255,255,0.06);";
    badge.textContent = "Hover a block \u2022 Click to capture \u2022 Esc to cancel";
    global.document.documentElement.appendChild(badge);
    // Animate badge in on next frame
    global.requestAnimationFrame(function() {
      badge.style.opacity = "1";
      badge.style.transform = "translateX(-50%) translateY(0)";
    });

    dimPickerState = { active: true, overlay, border, badge, currentEl: null };

    function updateSpotlight(el) {
      if (!el) {
        overlay.style.clipPath = "";
        border.style.display = "none";
        return;
      }
      const r = el.getBoundingClientRect();
      const W = global.innerWidth, H = global.innerHeight;
      const pad = 6;
      const x1 = Math.max(0, r.left - pad), y1 = Math.max(0, r.top - pad);
      const x2 = Math.min(W, r.right + pad), y2 = Math.min(H, r.bottom + pad);
      // Outer clockwise + inner counter-clockwise = nonzero hole
      overlay.style.clipPath =
        "polygon(0px 0px," + W + "px 0px," + W + "px " + H + "px,0px " + H + "px,0px 0px," +
        x1 + "px " + y1 + "px," + x1 + "px " + y2 + "px," +
        x2 + "px " + y2 + "px," + x2 + "px " + y1 + "px," +
        x1 + "px " + y1 + "px)";
      border.style.cssText += "top:" + y1 + "px;left:" + x1 + "px;width:" + (x2 - x1) + "px;height:" + (y2 - y1) + "px;display:block;";
    }

    dimPickerState.handleMove = function(e) {
      const candidate = getDimCandidate(e.target);
      if (candidate !== dimPickerState.currentEl) {
        dimPickerState.currentEl = candidate;
        updateSpotlight(candidate);
      }
    };

    dimPickerState.handleClick = function(e) {
      if (!dimPickerState || !dimPickerState.active) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (!dimPickerState.currentEl) return;
      // Remove interaction immediately, keep overlay for screenshot
      global.removeEventListener("mousemove", dimPickerState.handleMove, true);
      global.removeEventListener("mousedown", dimPickerState.handleClick, true);
      global.removeEventListener("keydown", dimPickerState.handleKeyDown, true);
      global.removeEventListener("scroll", dimPickerState.handleScroll, true);
      dimPickerState.active = false;
      badge.textContent = "Capturing\u2026";
      // Fallback: force-clean all elements after 4 s in case the MV3 service
      // worker has gone to sleep and the sendMessage callback never fires.
      var captureCleanupTimer = global.setTimeout(function() {
        stopDimPicker();
        showPickerToast("Capture timed out \u2014 try again");
      }, 4000);
      // Small delay so the browser fully paints the overlay before capture
      global.setTimeout(function() {
        chrome.runtime.sendMessage({ type: shared.MESSAGE_TYPES.DIM_CAPTURE_REQUEST }, function(resp) {
          global.clearTimeout(captureCleanupTimer);
          stopDimPicker();
          showPickerToast(resp && resp.saved ? "\u2713 Focus capture saved!" : "Capture failed \u2014 try again");
        });
      }, 120);
    };

    dimPickerState.handleKeyDown = function(e) {
      if (e.key === "Escape") {
        stopDimPicker();
        showPickerToast("Focus capture cancelled.");
      }
    };

    dimPickerState.handleScroll = function() {
      if (dimPickerState && dimPickerState.currentEl) updateSpotlight(dimPickerState.currentEl);
    };

    global.addEventListener("mousemove", dimPickerState.handleMove, true);
    global.addEventListener("mousedown", dimPickerState.handleClick, true);
    global.addEventListener("keydown", dimPickerState.handleKeyDown, true);
    global.addEventListener("scroll", dimPickerState.handleScroll, true);
  }

  function stopDimPicker() {
    // Always clean up by ID so orphaned elements are never left in the page DOM
    var idCleanup = [DIM_OVERLAY_ID, DIM_BORDER_ID, DIM_BADGE_ID];
    if (!dimPickerState) {
      idCleanup.forEach(function(id) {
        var el = global.document.getElementById(id);
        if (el) el.remove();
      });
      return;
    }
    if (dimPickerState.active) {
      global.removeEventListener("mousemove", dimPickerState.handleMove, true);
      global.removeEventListener("mousedown", dimPickerState.handleClick, true);
      global.removeEventListener("keydown", dimPickerState.handleKeyDown, true);
      global.removeEventListener("scroll", dimPickerState.handleScroll, true);
    }
    // Fade out, then remove
    var els = [dimPickerState.overlay, dimPickerState.border, dimPickerState.badge].filter(Boolean);
    els.forEach(function(el) {
      el.style.transition = "opacity 220ms ease";
      el.style.opacity = "0";
    });
    global.setTimeout(function() {
      els.forEach(function(el) { el.remove(); });
      // Belt-and-suspenders: also clean up by ID
      idCleanup.forEach(function(id) {
        var el = global.document.getElementById(id);
        if (el) el.remove();
      });
    }, 240);
    dimPickerState = null;
  }

  function getDimCandidate(node) {
    let el = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (el && el !== global.document.body) {
      const id = el.id;
      if (id === DIM_OVERLAY_ID || id === DIM_BORDER_ID || id === DIM_BADGE_ID) return null;
      if (el.matches && el.matches("article,main,section,div,p,h1,h2,h3,h4,h5,h6,blockquote,aside,figure,ul,ol,li,header,footer,nav")) {
        return el;
      }
      el = el.parentElement;
    }
    return global.document.body;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.fonts || changes.siteSettings) {
      refresh().catch(() => {});
    }
  });

  // SPA navigation: reapply font when React/Next/Vue routes to a new page
  // without a full page reload (history.pushState / replaceState / popstate).
  (function() {
    let lastUrl = global.location.href;
    let spaTimer = null;
    function onUrlChange() {
      const nextUrl = global.location.href;
      if (nextUrl === lastUrl) return;
      lastUrl = nextUrl;
      clearTimeout(spaTimer);
      // Small delay — let the SPA render before we inject
      spaTimer = setTimeout(function() { refresh().catch(() => {}); }, 300);
    }
    global.addEventListener("popstate", onUrlChange);
    const origPush    = global.history.pushState.bind(global.history);
    const origReplace = global.history.replaceState.bind(global.history);
    global.history.pushState = function() {
      origPush.apply(global.history, arguments);
      onUrlChange();
    };
    global.history.replaceState = function() {
      origReplace.apply(global.history, arguments);
      onUrlChange();
    };
  })();

  // ── Font Inspector ─────────────────────────────────────────────
  function inspectPageFonts() {
    const results = { fontsLoaded: [], fontFaceRules: [], elementFonts: [] };

    // Collect font-family names injected by Koppl so we can exclude them from results.
    // Koppl injects fonts via <style id="uploaded-font-switcher-style"> — these are
    // overrides, not fonts native to the site.
    const kopplFamilies = new Set();
    try {
      const kopplStyle = global.document.getElementById(STYLE_ID);
      if (kopplStyle) {
        const kopplText = kopplStyle.textContent || "";
        const famRe = /font-family\s*:\s*["']?([^"';\n{}]+)["']?\s*[;{}]/gi;
        let m;
        while ((m = famRe.exec(kopplText)) !== null) {
          const fam = m[1].trim();
          if (fam) kopplFamilies.add(fam.toLowerCase());
        }
      }
    } catch(e) {}

    // 1. document.fonts (FontFaceSet API) — skip Koppl-injected families
    try {
      global.document.fonts.forEach(function(ff) {
        const fam = ff.family.replace(/['"]/g, "").trim();
        if (kopplFamilies.has(fam.toLowerCase())) return;
        results.fontsLoaded.push({
          family: fam,
          style: ff.style,
          weight: ff.weight,
          status: ff.status,
        });
      });
    } catch(e) {}

    // 2. @font-face declarations from stylesheets — skip Koppl's own style tag
    try {
      Array.from(global.document.styleSheets).forEach(function(sheet) {
        try {
          // Skip Koppl's injected stylesheet — it's an override, not a site font
          if (sheet.ownerNode && sheet.ownerNode.id === STYLE_ID) return;
          Array.from(sheet.cssRules || []).forEach(function(rule) {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const family = rule.style.getPropertyValue("font-family").replace(/['"]/g, "").trim();
              const weight = rule.style.getPropertyValue("font-weight") || "400";
              const style  = rule.style.getPropertyValue("font-style")  || "normal";
              const src    = rule.style.getPropertyValue("src") || "";
              if (family) results.fontFaceRules.push({ family, weight, style, src });
            }
          });
        } catch(e) { /* cross-origin stylesheet — skip */ }
      });
    } catch(e) {}

    // Deduplicate @font-face by family+weight+style
    const seen = new Set();
    results.fontFaceRules = results.fontFaceRules.filter(function(r) {
      const key = r.family + "|" + r.weight + "|" + r.style;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    // 3. Computed font-family on key elements
    const targets = [
      { label: "html",    sel: "html" },
      { label: "body",    sel: "body" },
      { label: "h1",      sel: "h1" },
      { label: "h2",      sel: "h2" },
      { label: "h3",      sel: "h3" },
      { label: "p",       sel: "p" },
      { label: "a",       sel: "a" },
      { label: "button",  sel: "button" },
      { label: "input",   sel: "input[type=text],input:not([type])" },
      { label: "nav",     sel: "nav" },
    ];
    targets.forEach(function(item) {
      const el = global.document.querySelector(item.sel);
      if (!el) return;
      const cs = global.getComputedStyle(el);
      results.elementFonts.push({
        label:      item.label,
        fontFamily: cs.fontFamily,
        fontSize:   cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle:  cs.fontStyle,
        lineHeight: cs.lineHeight,
      });
    });

    // Supplement fontsLoaded: add families from @font-face rules and computed element styles
    // so the list is non-empty even if document.fonts is empty (e.g. system-font-only pages)
    var loadedFamiliesSet = new Set(results.fontsLoaded.map(function(f) { return f.family.toLowerCase(); }));
    results.fontFaceRules.forEach(function(r) {
      if (r.family && !loadedFamiliesSet.has(r.family.toLowerCase())) {
        results.fontsLoaded.push({ family: r.family, style: r.style || "normal", weight: r.weight || "400", status: "css" });
        loadedFamiliesSet.add(r.family.toLowerCase());
      }
    });
    var genericKeywords = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "inherit", "initial", "unset", ""]);
    results.elementFonts.forEach(function(item) {
      (item.fontFamily || "").split(",").forEach(function(raw) {
        var fam = raw.replace(/['"]/g, "").trim();
        if (genericKeywords.has(fam.toLowerCase())) return;
        if (!loadedFamiliesSet.has(fam.toLowerCase())) {
          results.fontsLoaded.push({ family: fam, style: "normal", weight: "400", status: "computed" });
          loadedFamiliesSet.add(fam.toLowerCase());
        }
      });
    });

    // 4. Build font usage map: scan all elements, group by primary font family
    var usageRaw = {};
    var genericsU = new Set(["serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "inherit", "initial", "unset", ""]);
    // Skip non-text elements: ALL SVG (by namespace) + media/script/etc
    var skipTagsU = new Set(["script", "style", "noscript", "meta", "link", "head", "title", "img", "video", "audio", "canvas", "iframe", "object", "embed", "br", "hr", "source", "track", "input", "select", "textarea"]);
    var SVG_NS = "http://www.w3.org/2000/svg";
    try {
      var allEls = global.document.querySelectorAll("body *");
      var scanLimit = Math.min(allEls.length, 1200);
      for (var ui = 0; ui < scanLimit; ui++) {
        var uel = allEls[ui];
        // Skip ALL SVG elements by namespace (path, animate, g, etc.)
        if (uel.namespaceURI === SVG_NS) continue;
        var utag = uel.tagName.toLowerCase();
        if (skipTagsU.has(utag)) continue;
        var ucs = global.getComputedStyle(uel);
        if (ucs.display === "none" || ucs.visibility === "hidden") continue;
        var ufam = ucs.fontFamily.split(",")[0].replace(/['"]/g, "").trim();
        if (!ufam || genericsU.has(ufam.toLowerCase())) continue;
        if (!usageRaw[ufam]) usageRaw[ufam] = { tags: {}, textColor: ucs.color, bgColor: ucs.backgroundColor };
        usageRaw[ufam].tags[utag] = (usageRaw[ufam].tags[utag] || 0) + 1;
      }
    } catch(e) {}
    var fontUsageMap = {};
    Object.keys(usageRaw).forEach(function(fam) {
      var entry = usageRaw[fam];
      var topTags = Object.keys(entry.tags)
        .sort(function(a, b) { return entry.tags[b] - entry.tags[a]; })
        .slice(0, 10)
        .map(function(t) { return { tag: t, count: entry.tags[t] }; });
      fontUsageMap[fam] = { elements: topTags, textColor: entry.textColor, bgColor: entry.bgColor };
    });
    results.fontUsageMap = fontUsageMap;

    // 5. Build a family→srcUrl map (absolute URLs for fetching)
    var srcMap = {};
    results.fontFaceRules.forEach(function(r) {
      if (srcMap[r.family]) return;
      var m = r.src.match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
      if (m && m[1]) {
        try { srcMap[r.family] = new URL(m[1], global.location.href).href; } catch(e) {}
      }
    });
    results.fontSrcMap = srcMap;

    return results;
  }

  // Render each font family as a canvas preview image (reliable — uses page's loaded fonts)
  async function inspectPageFontsWithPreviews() {
    var results = inspectPageFonts();
    var previewImages = {};

    // Collect unique families from loaded fonts
    var families = [];
    var seen = {};
    (results.fontsLoaded || []).forEach(function(ff) {
      var fam = ff.family;
      if (!fam || seen[fam]) return;
      seen[fam] = true;
      families.push(fam);
    });

    // nameImages — font name rendered in actual font, for Inspector cards
    var nameImages = {};
    // previewImages — "Sphinx..." rendered in actual font, for Apply tab preview
    families.forEach(function(fam) {
      try {
        var dpr = 2;
        // ── Inspector card: just the font name ──
        (function() {
          var c = document.createElement("canvas");
          var cx = c.getContext("2d");
          var fs = 32;
          cx.font = fs + "px \"" + fam + "\", serif";
          var tw = Math.ceil(cx.measureText(fam).width);
          var w = Math.min(tw + 4, 320);
          var h = fs + 10;
          c.width = w * dpr; c.height = h * dpr;
          cx.scale(dpr, dpr);
          cx.font = fs + "px \"" + fam + "\", serif";
          cx.fillStyle = "#1a1a1a";
          cx.textBaseline = "top";
          cx.fillText(fam, 0, 5);
          nameImages[fam] = c.toDataURL("image/png");
        })();
        // ── Apply tab: "Sphinx..." wrapped preview ──
        (function() {
          var c = document.createElement("canvas");
          var cx = c.getContext("2d");
          var fontSize = 44;
          var lineH = Math.round(fontSize * 1.15);
          var targetW = 320;
          var previewText = "Sphinx of black quartz, judge my vow.";
          cx.font = fontSize + "px \"" + fam + "\", serif";
          var words = previewText.split(" ");
          var lines = [];
          var curLine = "";
          words.forEach(function(word) {
            var test = curLine ? curLine + " " + word : word;
            if (curLine && cx.measureText(test).width > targetW) { lines.push(curLine); curLine = word; }
            else { curLine = test; }
          });
          if (curLine) lines.push(curLine);
          var padY = 6;
          var h = lines.length * lineH + padY * 2;
          c.width = targetW * dpr; c.height = h * dpr;
          cx.scale(dpr, dpr);
          cx.font = fontSize + "px \"" + fam + "\", serif";
          cx.fillStyle = "#1a1a1a"; cx.textBaseline = "top";
          lines.forEach(function(line, i) { cx.fillText(line, 0, padY + i * lineH); });
          previewImages[fam] = c.toDataURL("image/png");
        })();
      } catch(e) { /* skip */ }
    });

    results.nameImages = nameImages;
    results.previewImages = previewImages;
    return results;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === shared.MESSAGE_TYPES.START_PICKER) {
      startPicker();
      sendResponse({ started: true });
    }

    if (message.type === shared.MESSAGE_TYPES.STOP_PICKER) {
      stopPicker();
      sendResponse({ stopped: true });
    }

    if (message.type === shared.MESSAGE_TYPES.PAUSE_PREVIEW) {
      overridePaused = true;
      removeStyle();
      sendResponse({ paused: true });
    }

    if (message.type === shared.MESSAGE_TYPES.RESUME_PREVIEW) {
      overridePaused = false;
      refresh().catch(() => {});
      sendResponse({ resumed: true });
    }

    if (message.type === shared.MESSAGE_TYPES.START_DIM_PICKER) {
      startDimPicker();
      sendResponse({ started: true });
    }

    if (message.type === shared.MESSAGE_TYPES.INSPECT_FONTS) {
      inspectPageFontsWithPreviews().then(sendResponse).catch(function() { sendResponse(inspectPageFonts()); });
      return true;
    }

    if (message.type === shared.MESSAGE_TYPES.HIGHLIGHT_ELEMENT) {
      highlightFontElements(message.fontFamily, message.tag);
      sendResponse({ done: true });
    }
  });

  function highlightFontElements(fontFamily, tag) {
    // Ensure highlight style exists
    var sid = "__fp_hl_style";
    if (!global.document.getElementById(sid)) {
      var s = global.document.createElement("style");
      s.id = sid;
      s.textContent = ".__fp_hl{outline:3px solid #5A70F0!important;outline-offset:3px!important;border-radius:2px!important;}";
      global.document.head.appendChild(s);
    }
    // Clear previous highlights
    global.document.querySelectorAll(".__fp_hl").forEach(function(el) { el.classList.remove("__fp_hl"); });
    // Find matching elements
    var selector = tag || "h1,h2,h3,h4,h5,h6,p,a,span,li,button,div,td,th,label";
    var found = [];
    try {
      global.document.querySelectorAll(selector).forEach(function(el) {
        var primary = global.getComputedStyle(el).fontFamily.split(",")[0].replace(/['"]/g, "").trim();
        if (primary.toLowerCase() === (fontFamily || "").toLowerCase()) {
          el.classList.add("__fp_hl");
          found.push(el);
        }
      });
    } catch(e) {}
    if (found[0]) found[0].scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function() {
      global.document.querySelectorAll(".__fp_hl").forEach(function(el) { el.classList.remove("__fp_hl"); });
    }, 2500);
  }

  refresh().catch(() => {});

  global.FontPluginRuntime = {
    initialized: true,
    refresh,
    startPicker,
    stopPicker,
    startDimPicker,
    stopDimPicker
  };
})(globalThis);
