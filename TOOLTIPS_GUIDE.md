# Koppl — Tooltips Guide

## Overview

Tooltips appear when you hover over buttons, labels, and input fields. They explain:
- What a feature does
- How to use it
- What values are acceptable

Simply **hover over any element** with a `?` or over buttons to see the explanation.

---

## Top Bar Tooltips

### 📷 Screenshot Button
**Hover text:** "Take a screenshot of the current page with applied fonts"
- Captures the current page with your font settings applied
- Useful for showing before/after comparisons

### Override Toggle
**Hover text:** "Toggle font override on/off for this site (Ctrl+Shift+F to toggle globally)"
- Turn fonts on/off for the current website only
- Quick keyboard shortcut: **Ctrl+Shift+F**

---

## Apply Tab Tooltips

### Apply to (Selector)
**Hover text:** "Choose which elements get the new font"

Select options:
- **"Whole page"** — Apply to entire website
- **"Article / main"** — Apply to main content area
- **"Headings"** — Apply to h1–h6 headings only
- **"Picked element"** — Apply to one specific element

### Pick on page Button
**Hover text:** "Click here, then click an element on the page to select it"
- Lets you visually select any element
- After clicking, you'll return to this popup

---

## Typography Accordion

### Size px
**Hover text:** "Zoom percentage — 100% = normal, 50% = smaller, 200% = larger"
- 50–200% range
- Zooms entire page, not just the font

### Weight
**Hover text:** "Font thickness: 100=thin, 400=normal, 700=bold, 900=ultra-bold"
- 100–900
- Only works if your font supports multiple weights

### Line height
**Hover text:** "Space between text lines — higher = more breathing room"
- 0.8–2.5
- Higher = more space between lines (easier to read)

### Style
**Hover text:** "Regular, tilted (italic), or slanted (oblique)"
- Normal, Italic, or Oblique
- If not available, shows as regular

### Tracking em (Letter Spacing)
**Hover text:** "Letter spacing — in em units (1 em = current font size)"
- -0.12 to 0.30
- Positive = wider, negative = tighter

### Word Spacing
**Hover text:** "Space between words — in em units"
- -0.2 to 0.5
- Useful for readability

### Transform
**Hover text:** "Change text case — uppercase, lowercase, or capitalize"
- Options: None, UPPERCASE, lowercase, Capitalize
- Changes text appearance without modifying the source

### Text Color
**Hover text:** "Hex color code (e.g., #000000 = black, #FFFFFF = white)"
- Format: **#RRGGBB**
- Example: #FF0000 = red, #00FF00 = green, #0000FF = blue

### Decoration
**Hover text:** "Add lines to text — underline, strikethrough, or overline"
- None, Underline, Line-through, Overline

### Shadow
**Hover text:** "Add shadow effect to text — soft, medium, or hard"
- Creates a drop shadow for depth

### Opacity
**Hover text:** "Text transparency — 100% = fully visible, 50% = semi-transparent"
- 0–100%
- Useful for fading text into background

### Text-only Mode
**Hover text:** "Apply font to text only — keep icons, buttons, and decorative elements as they are"
- Preserves non-text elements
- Useful if new font breaks icons/emojis

### Relax Containers
**Hover text:** "Increase text area padding and margins to prevent text overflow — use if text gets cut off"
- Solves text overflow issues
- Adds breathing room around text

---

## OpenType Features

### OpenType Features Accordion
**Hover text:** "Enable font variants — stylistic sets, ligatures, small caps, etc. (only if font supports them)"
- Advanced: Only for fonts with OpenType features
- Examples: Small caps, stylistic alternates, ligatures

---

## Presets Accordion

### Typography Presets
**Hover text:** "Save and reuse typography settings — apply saved presets with one click"
- Save current settings with a name
- Reuse instantly on other sites

### Preset Name Input
**Hover text:** "Enter a name for this typography preset"
- Example: "Reading friendly", "Bold heading", "Dyslexia friendly"

### Save as Preset Button
**Hover text:** "Save current typography settings as a reusable preset"
- Creates a quick-access button for these settings

---

## Font Rules

### Font Rules Accordion
**Hover text:** "Apply different fonts to headings, body, links, etc. — more control than 'Apply to' selector"
- Advanced feature
- Lets you use multiple fonts on one site

### Add Rule Button
**Hover text:** "Create a new rule to apply a different font to specific elements (headings, links, etc.)"
- Add rules for different element types

---

## Accessibility Checker

### Accessibility Accordion
**Hover text:** "Check color contrast ratio and WCAG compliance — ensure text is readable for people with low vision"
- Tests if colors meet accessibility standards
- Checks against WCAG AA and AAA ratings

### Auto-fill Button (↻)
**Hover text:** "Pull from current typography settings"
- Automatically fills color inputs with current settings
- Useful for quick color checking

---

## Action Buttons

### Apply
**Hover text:** "Apply these settings to the current website"
- Saves and applies all typography changes

### Reset
**Hover text:** "Undo changes and return to original settings"
- Cancels all pending changes

### Copy CSS
**Hover text:** "Copy all CSS rules so you can use them elsewhere"
- Extracts CSS for use in web projects
- Copies to clipboard automatically

### More (⋯) Menu

#### Save as Default
**Hover text:** "Use these settings on all websites by default"
- Applies to all sites unless overridden

#### Share Site…
**Hover text:** "Create a shareable code to send these settings to others"
- Generate shareable JSON
- Others can import your settings

#### Focus Capture…
**Hover text:** "Take a screenshot focusing on this element"
- Captures just the selected element

#### Delete Font…
**Hover text:** "Delete this font from storage"
- Removes font from storage (recoverable via Import)

---

## Undo / Redo

### Undo Button (↶)
**Title:** "Undo last change"
- Reverts previous action

### Redo Button (↷)
**Title:** "Redo last change"
- Reapplies undone action

---

## Global Default Font

### Use as Global Default Font
**Hover text:** "Use this font on all websites (can be overridden per-site)"
- Applies to all sites by default
- Per-site settings override this

---

## Upload Tab

### Save Fonts
**Hover text:** "Save selected fonts to storage"
- Stores fonts locally in your browser

### Remove Unused Fonts
**Hover text:** "Delete fonts that haven't been used on any site"
- Frees up storage space
- Only removes fonts you haven't applied anywhere

---

## Sites Tab

### Sort Selector
**Hover text:** "Sort by domain name, date added, font name, or most recently used"
- Organize your saved site configurations

### Export Button
**Hover text:** "Download all your font settings as a JSON file for backup"
- Backs up all settings
- Create a copy for sharing or moving to another browser

### Import Label
**Hover text:** "Upload a JSON file with previously exported font settings"
- Restores previously backed-up settings

### Copy from Current Site
**Hover text:** "Copy the font settings from this site and apply to another site (select a site first)"
- Reuse settings across multiple sites

---

## Inspect Tab

### Scan Page Button
**Hover text:** "Analyze this page to see all fonts being used (loaded fonts, @font-face rules, and elements)"
- Shows:
  - Fonts loaded on the page
  - @font-face declarations
  - Which elements use which fonts

---

## Footer

### Badge Toggle
**Hover text:** "Show a small badge on pages where fonts are applied"
- Displays a small indicator on pages with custom fonts
- Helps you remember which sites are customized

### Theme Selector
**Hover text:** "Light, dark, or match your system settings"
- Changes extension appearance
- System = follows OS settings

---

## Tips for Using Tooltips

1. **Hover to reveal** — Move your mouse over any element
2. **Read before clicking** — Understand what each button does
3. **Look for `title` attributes** — Many elements have helpful descriptions
4. **Use with README.md** — For more detailed explanations
5. **Experiment safely** — Tooltips explain what will happen before you do it

---

## Keyboard Shortcuts (Also Shown in Tooltips)

| Action | Shortcut |
|--------|----------|
| Toggle fonts on current site | **Ctrl+Shift+F** (Win/Linux) / **⌘⇧F** (Mac) |
| Switch between recent fonts | **Alt+1 to Alt+0** |
| Undo | **Ctrl+Z** / **⌘Z** |
| Redo | **Ctrl+Y** / **⌘⇧Z** |

---

**All these tooltips are built into the interface — just hover over anything you're unsure about!**
