/* ── popup/ui.js ──────────────────────────────────────────────
   All UI extras that were previously inline <script> blocks.
   Moved to an external file to comply with MV3 CSP (script-src 'self').
   Runs after DOMContentLoaded — same timing as the old inline scripts.
──────────────────────────────────────────────────────────────── */
/* Keep system theme in sync if OS dark-mode preference changes while popup is open */
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function() {
  var popup = globalThis.FontPluginPopup;
  if (popup && popup.state && popup.state.theme === "system" && typeof popup.applyTheme === "function") {
    popup.applyTheme("system");
  }
});

document.addEventListener("DOMContentLoaded", function() {

  /* Override toggle: sync checkbox → "On / Off" text + site-dot colour */
  (function() {
    var chk = document.getElementById("overrideCheckbox");
    var txt = document.getElementById("ovrText");
    var dot = document.getElementById("siteDot");
    if (!chk || !txt) return;
    function sync() {
      txt.textContent = chk.checked ? "On" : "Off";
      if (dot) {
        dot.classList.toggle("live", chk.checked);
        dot.classList.toggle("off",  !chk.checked);
      }
    }
    chk.addEventListener("change", sync);
    sync();
  })();

  /* Overflow menu (⋯ button) */
  (function() {
    var btn  = document.getElementById("btnMoreApply");
    var menu = document.getElementById("overflowMenuApply");
    if (!btn || !menu) return;
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      menu.classList.toggle("open");
    });
    document.addEventListener("click", function() {
      menu.classList.remove("open");
    });
  })();

  /* Preview size slider */
  (function() {
    var slider = document.getElementById("previewSizeSlider");
    var valEl  = document.getElementById("previewSizeVal");
    var text   = document.getElementById("applyPreviewText");
    if (!slider || !text) return;
    // Restore last-used size across popup opens
    var stored = localStorage.getItem("fp-preview-size");
    if (stored && !isNaN(Number(stored))) slider.value = stored;
    function applySize() {
      text.style.fontSize = slider.value + "px";
      if (valEl) valEl.textContent = slider.value + "px";
      localStorage.setItem("fp-preview-size", slider.value);
    }
    slider.addEventListener("input", applySize);
    applySize(); // sync on load
  })();

  /* Apply button: "✓ Applied" flash + specimen glow */
  (function() {
    var btn = document.getElementById("applyButton");
    if (!btn) return;
    btn.addEventListener("click", function() {
      var span = this.querySelector("span");
      if (!span) return;
      this.classList.add("done");
      var prev = span.textContent;
      span.textContent = "✓ Applied";
      clearTimeout(this._t);
      var self = this;
      this._t = setTimeout(function() {
        span.textContent = prev;
        self.classList.remove("done");
      }, 1500);
      var spec = document.getElementById("specimen");
      if (spec) {
        spec.classList.remove("applied");
        void spec.offsetWidth;
        spec.classList.add("applied");
        setTimeout(function() { spec.classList.remove("applied"); }, 820);
      }
    });
  })();

  /* Copy CSS button: "✓ Copied" flash */
  (function() {
    var btn = document.getElementById("copyCssButton");
    if (!btn) return;
    btn.addEventListener("click", function() {
      var span = this.querySelector("span");
      if (!span) return;
      var prev = span.textContent;
      span.textContent = "✓ Copied";
      clearTimeout(this._t);
      var self = this;
      this._t = setTimeout(function() { span.textContent = prev; }, 1500);
    });
  })();

  /* Ripple effect on .rip-host buttons */
  function ripple(btn, e) {
    var r  = btn.getBoundingClientRect();
    var sz = Math.max(r.width, r.height) * 1.8;
    var el = document.createElement("div");
    el.className = "rip";
    el.style.cssText = "width:" + sz + "px;height:" + sz + "px;" +
      "left:" + ((e.clientX - r.left) - sz / 2) + "px;" +
      "top:"  + ((e.clientY - r.top)  - sz / 2) + "px";
    btn.appendChild(el);
    setTimeout(function() { el.remove(); }, 540);
  }
  document.querySelectorAll(".rip-host").forEach(function(btn) {
    btn.addEventListener("click", function(e) { ripple(btn, e); });
  });

});
