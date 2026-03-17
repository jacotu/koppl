// ── Import font from URL ──────────────────────────────────────────────────
// Fetches font files / Google Fonts CSS and returns base64 data URLs.
// Must run in the background service worker (has host_permissions for all https).

function _arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let result = "";
  // 8 KB chunks avoid stack-overflow from too many Function.apply arguments
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    result += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(result);
}

function _mimeFromUrl(url) {
  const ext = url.split("?")[0].split(".").pop().toLowerCase();
  const map = { woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf" };
  return map[ext] || "font/woff2";
}

function _nameFromUrl(url) {
  const path = url.split("?")[0];
  const file = path.split("/").pop();
  return file.replace(/\.(woff2?|ttf|otf)$/i, "").replace(/[-_+]/g, " ").trim() || "Font";
}

async function _fetchFontFile(url, name) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status + " for font file");
  const buffer = await resp.arrayBuffer();
  const mime = _mimeFromUrl(url);
  const dataUrl = "data:" + mime + ";base64," + _arrayBufferToBase64(buffer);
  return { name: name || _nameFromUrl(url), dataUrl };
}

function _parseFontFacesFromCss(css) {
  const faces = [];
  const blockRe = /@font-face\s*\{([^}]+)\}/gi;
  let m;
  while ((m = blockRe.exec(css)) !== null) {
    const block = m[1];
    const familyM = block.match(/font-family\s*:\s*['"]?([^'";\n]+?)['"]?\s*[;\n]/i);
    if (!familyM) continue;
    const family = familyM[1].trim().replace(/^['"]|['"]$/g, "");
    const weightM = block.match(/font-weight\s*:\s*(\d+)/i);
    const weight = weightM ? weightM[1] : "400";
    // Prefer woff2 URL, fall back to any https URL in src
    const srcM = block.match(/src\s*:[^;]+/i);
    if (!srcM) continue;
    const srcText = srcM[0];
    const woff2M = srcText.match(/url\(['"]?(https?:\/\/[^'")\s]+\.woff2[^'")\s]*)['"]?\)/i);
    const anyM  = srcText.match(/url\(['"]?(https?:\/\/[^'")\s]+)['"]?\)/i);
    const fontUrl = (woff2M && woff2M[1]) || (anyM && anyM[1]);
    if (!fontUrl) continue;
    faces.push({ family, weight, url: fontUrl });
  }
  // Deduplicate by (family+weight) — keep LAST entry (Google Fonts puts latin last, which we want)
  const deduped = new Map();
  faces.forEach((f) => deduped.set(f.family + "|" + f.weight, f));
  return Array.from(deduped.values());
}

const _WEIGHT_LABELS = {
  "100": "Thin", "200": "ExtraLight", "300": "Light", "400": "Regular",
  "500": "Medium", "600": "SemiBold", "700": "Bold",
  "800": "ExtraBold", "900": "Black"
};

async function _fetchFontsFromUrl(url) {
  const cleanUrl = url.split("?")[0].split("#")[0];
  const ext = cleanUrl.split(".").pop().toLowerCase();
  const isFontFile = ["woff", "woff2", "ttf", "otf"].includes(ext);

  if (isFontFile) {
    return [await _fetchFontFile(url, null)];
  }

  // Assume CSS (Google Fonts, CDN stylesheet, etc.)
  const resp = await fetch(url, { headers: { Accept: "text/css,*/*" } });
  if (!resp.ok) throw new Error("HTTP " + resp.status + " fetching CSS");
  const css = await resp.text();
  const faces = _parseFontFacesFromCss(css);
  if (faces.length === 0) throw new Error("No @font-face rules found in the CSS at that URL");
  const hasMultiple = faces.length > 1;
  const promises = faces.map((face) => {
    const label = _WEIGHT_LABELS[face.weight] || ("W" + face.weight);
    const displayName = hasMultiple ? (face.family + " " + label) : face.family;
    return _fetchFontFile(face.url, displayName);
  });
  const results = await Promise.allSettled(promises);
  const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  if (ok.length === 0) throw new Error("All font file fetches failed");
  return ok;
}

// NOTE: message listeners intentionally use .then()/.catch() + `return true`
// rather than async/await. In MV3 service workers, an async listener returns a
// Promise, which Chrome does NOT treat as "keeping the channel open" — so
// sendResponse would be called after the port has already closed. The explicit
// `return true` is the only reliable way to keep the channel open for an async
// response.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || message.type !== "font-plugin:fetch-font-url") return false;
  const url = message.url;
  if (!url) { sendResponse({ success: false, error: "No URL provided" }); return true; }
  _fetchFontsFromUrl(url)
    .then((fonts) => sendResponse({ success: true, fonts }))
    .catch((err) => sendResponse({ success: false, error: err?.message || "Fetch failed" }));
  return true; // keep channel open for async response
});

// ── Focus capture: content script requests a screenshot via background ──
// captureVisibleTab and downloads.download are callback-only APIs in MV3 —
// promisified wrappers are not available, so callbacks are used throughout.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "font-plugin:dim-capture-request") return false;
  const windowId = sender.tab?.windowId;
  const tabUrl   = sender.tab?.url;
  if (!windowId) { sendResponse({ saved: false }); return true; }
  // Content script already waited 120 ms before sending — capture immediately
  chrome.tabs.captureVisibleTab(windowId, { format: "png" }, (dataUrl) => {
    if (chrome.runtime.lastError || !dataUrl) {
      sendResponse({ saved: false, error: chrome.runtime.lastError?.message });
      return;
    }
    let hostname = "screenshot";
    try { hostname = new URL(tabUrl).hostname; } catch (_) {}
    chrome.downloads.download(
      { url: dataUrl, filename: hostname + "-focus-" + Date.now() + ".png" },
      () => sendResponse({ saved: true })
    );
  });
  return true; // keep message channel open for callback
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "toggle-override") {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    return;
  }

  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }
  if (!hostname || ["chrome.google.com", "chromewebstore.google.com"].includes(hostname)) {
    return;
  }

  const { siteSettings = {} } = await chrome.storage.local.get("siteSettings");
  const cur = siteSettings[hostname] || {};
  const nextSettings = {
    ...siteSettings,
    [hostname]: {
      ...cur,
      enabled: !cur.enabled,
      updatedAt: Date.now()
    }
  };
  await chrome.storage.local.set({ siteSettings: nextSettings });

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof globalThis.FontPluginRuntime?.refresh === "function") {
          globalThis.FontPluginRuntime.refresh();
        }
      }
    });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["shared.js", "content.js"]
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          if (typeof globalThis.FontPluginRuntime?.refresh === "function") {
            globalThis.FontPluginRuntime.refresh();
          }
        }
      });
    } catch (_) {}
  }
});
