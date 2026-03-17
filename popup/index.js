(function () {
  "use strict";

  function ensureUiFont() {
    try {
      const runtime = typeof chrome !== "undefined" && chrome.runtime && typeof chrome.runtime.getURL === "function"
        ? chrome.runtime
        : null;
      const pseudoUrl = runtime ? runtime.getURL("fonts/Acrylic-Pseudo-TRIAL-Regular.otf") : "fonts/Acrylic-Pseudo-TRIAL-Regular.otf";
      const orthoUrl = runtime ? runtime.getURL("fonts/Acrylic-Ortho-TRIAL-Regular.otf") : "fonts/Acrylic-Ortho-TRIAL-Regular.otf";
      const style = document.createElement("style");
      style.textContent = [
        '@font-face {',
        '  font-family: "Acrylic Pseudo";',
        '  src: url("' + pseudoUrl + '") format("opentype");',
        "  font-weight: 400;",
        "  font-style: normal;",
        "  font-display: swap;",
        "}",
        '@font-face {',
        '  font-family: "Acrylic Ortho";',
        '  src: url("' + orthoUrl + '") format("opentype");',
        "  font-weight: 400;",
        "  font-style: normal;",
        "  font-display: swap;",
        "}",
        ":root, body {",
        '  font-family: "Acrylic Pseudo", "Helvetica Neue", Helvetica, Arial, sans-serif;',
        "}"
      ].join("\n");
      document.head.appendChild(style);
      if (globalThis.FontFace && document.fonts) {
        const pseudoFace = new FontFace("Acrylic Pseudo", 'url("' + pseudoUrl + '")', { weight: "400", style: "normal" });
        const orthoFace = new FontFace("Acrylic Ortho", 'url("' + orthoUrl + '")', { weight: "400", style: "normal" });
        Promise.all([pseudoFace.load(), orthoFace.load()]).then((loaded) => {
          loaded.forEach((f) => document.fonts.add(f));
          document.documentElement.classList.add("ui-font-ready");
        }).catch(() => {
          document.documentElement.classList.add("ui-font-failed");
        });
      } else if (document.fonts && document.fonts.load) {
        document.fonts.load('12px "Acrylic Pseudo"').catch(() => {});
        document.fonts.load('12px "Acrylic Ortho"').catch(() => {});
      }
    } catch (_) {}
  }

  function showError(text) {
    try {
      const status = document.getElementById("statusMessage");
      if (status) { status.textContent = text; status.style.color = "#b91c1c"; return; }
    } catch (_) {}
    const el = document.createElement("p");
    el.style.cssText = "padding:12px;margin:0;color:#b91c1c;font-size:12px;";
    el.textContent = text;
    document.body.prepend(el);
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      ensureUiFont();
      const popup = globalThis.FontPluginPopup;
      const stage = globalThis.__fontPluginStage || "?";
      if (!popup || !popup.msg || !popup.bindEvents || !popup.init) {
        showError("Load failed after: " + stage + ". Reload extension (chrome://extensions → Refresh). Check Console (right-click popup → Inspect).");
        return;
      }
      const msg = popup.msg;
      const elements = popup.elements;
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        try {
          const v = msg(el.getAttribute("data-i18n"));
          if (v) el.textContent = v;
        } catch (_) {}
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        try {
          const v = msg(el.getAttribute("data-i18n-placeholder"));
          if (v) el.placeholder = v;
        } catch (_) {}
      });
      document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
        try {
          const v = msg(el.getAttribute("data-i18n-aria-label"));
          if (v) el.setAttribute("aria-label", v);
        } catch (_) {}
      });
      if (elements && elements.hotkeyHint) {
        let t = msg("hotkeyHint");
        if (/Mac|iPhone|iPad/i.test(navigator.platform || "")) t = t.replace("Ctrl+Shift+F", "⌘⇧F");
        elements.hotkeyHint.textContent = t;
      }
      // Accordion toggling (CSP-safe: external file, not inline HTML)
      document.querySelectorAll(".acc-head").forEach(function(btn) {
        btn.addEventListener("click", function() {
          this.closest(".acc").classList.toggle("open");
        });
      });

      popup.bindEvents();
      if (popup.bindNewFeatureHandlers) popup.bindNewFeatureHandlers();
      popup.init().catch((err) => {
        if (popup.setStatus) popup.setStatus(msg("statusCouldNotInit"));
        else showError(String(err && err.message || "Init failed"));
      });
    } catch (err) {
      showError("Error: " + (err && err.message || "unknown"));
    }
  });
})();
