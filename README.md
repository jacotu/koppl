# Koppl

A Chrome extension that replaces fonts on any website. Upload your own, pull from Google Fonts or a CDN, tweak every typography detail, and save it all per site — no coding needed.

---

## Installation

Koppl isn't on the Chrome Web Store yet, so you load it manually in developer mode. It takes about 30 seconds.

1. **Download the extension**
   - Clone or download this repository as a ZIP and unpack it somewhere permanent (don't delete the folder afterward — Chrome loads the extension from it live)

2. **Open Chrome extensions**
   - Go to `chrome://extensions` in the address bar

3. **Enable Developer mode**
   - Toggle the switch in the top-right corner of that page

4. **Load the extension**
   - Click **Load unpacked**
   - Select the `Koppl` folder you just unpacked

5. **Pin it** *(optional but recommended)*
   - Click the puzzle piece icon in the Chrome toolbar → find Koppl → click the pin

That's it. The **K** icon will appear in your toolbar.

---

## How it works in 3 steps

**1. Get a font in**
Open the popup → go to the **Upload** tab. You can drop a `.woff2`, `.ttf`, or `.otf` file directly, or paste a Google Fonts / CDN URL and it'll be pulled in automatically.

**2. Apply it to a site**
Go to the **Apply** tab. Pick the font from the dropdown, adjust size if you want, and hit **Apply**. The page updates instantly.

**3. Toggle on/off anytime**
Use the **Override** switch in the top bar of the popup to turn the font on or off for the current site. Or just hit **Ctrl+Shift+F** (⌘⇧F on Mac) without opening the popup at all.

---

## What's inside

### Apply tab

Everything typography in one place:

- Font selection with search
- **Size** — zooms the entire page (50–200%)
- **Weight, line height, letter spacing, word spacing**
- **Style** (normal / italic / oblique)
- **Text color** with opacity
- **Decoration and transforms** (underline, strikethrough, uppercase, etc.)
- **Text shadow**
- **OpenType features** — if your font has stylistic sets (ss01, cv01…), you can enable them here
- **Font Rules** — apply a different font just to headings, or just to body text, etc.
- **Accessibility checker** — shows WCAG contrast ratio so you don't accidentally break readability
- **Copy CSS** — grab the generated CSS to use in your own project

### Presets tab

Save a full typography configuration — font + all settings — as a preset and apply it anywhere in one click.

### Sites tab

Lists every site where you've saved settings. You can search, sort, export the whole thing as JSON, or copy settings from one site to another.

### Inspect tab

Scans the current page and shows you what fonts are actually loaded, what `@font-face` rules are active, and what's being used on which elements.

---

## Keyboard shortcuts

| Shortcut | What it does |
|---|---|
| Ctrl+Shift+F / ⌘⇧F | Toggle font override on current site |
| Alt+1 … Alt+0 | Switch between your 10 most recent fonts |
| Ctrl+Z / ⌘Z | Undo (while popup is open) |
| Ctrl+Y / ⌘⇧Z | Redo (while popup is open) |

---

## Good to know

**Fonts never leave your machine.** Everything — font files, settings, presets — is stored in your browser's local storage. Nothing is uploaded anywhere.

**It won't touch a site unless you tell it to.** Opening the popup on a new site does not apply any font automatically. You have to press Apply yourself.

**It doesn't work on Chrome's own pages** (`chrome://`, Chrome Web Store, etc.) — that's a browser security restriction, not a bug.

**Some sites may block it.** Sites with a strict Content Security Policy can prevent custom fonts from loading. There's not much to do about that — it's the site's choice.

---

## Troubleshooting

**Font loads but looks wrong (text cut off, overlapping)**
→ Turn on **Relax containers** in the typography options. This loosens fixed-height containers that weren't built for larger fonts.

**Font not loading at all**
→ Check the format — `.woff2`, `.woff`, `.ttf`, `.otf` are supported. If you're importing by URL, make sure the link points directly to a font file or a Google Fonts CSS URL.

**Extension stopped working after Chrome update**
→ Go to `chrome://extensions`, find Koppl, and hit the refresh icon. Usually fixes it.

**Settings disappeared**
→ Chrome can clear extension storage if you're low on disk space. Use **Export** in the Sites tab regularly to keep a backup.

---

## Privacy

- All data is stored locally in your browser (`chrome.storage.local`)
- No analytics, no telemetry, no external requests (except fetching font URLs you explicitly paste in)
- You can export or delete everything from the Sites tab

---

*Version 1.0.0*
