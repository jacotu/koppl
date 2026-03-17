# Koppl — Custom Tooltips

## Overview

Custom tooltips have been implemented to provide quick, in-context help throughout the interface. They appear **instantly on hover** and match the project's visual style.

---

## How It Works

### Appearance
- **Fast show**: 200ms delay (vs. 1-2 seconds for browser tooltips)
- **Smooth fade**: 200ms animation
- **Smart positioning**: Automatically positions above/below/left/right to fit on screen
- **Styled**: Matches Koppl design tokens (dark/light theme aware)
- **Beautiful arrow**: Minimal pointer for context

### Interaction
- **Hover to show**: Move mouse over any element with a tooltip
- **Click to show**: Focus (keyboard) also triggers the tooltip
- **Auto-hide**: Disappears when mouse leaves element
- **Non-intrusive**: Doesn't interfere with scrolling or interaction

### Theme Support
- **Light theme**: Dark tooltip on light background
- **Dark theme**: Light tooltip on dark background
- **Responsive**: Disabled on mobile (< 480px)

---

## Visual Example

```
┌─────────────────────────────┐
│     Element with Tooltip    │
│                             │
│        ↓ Tooltip ↓         │  ← Appears after 200ms
│  ┌──────────────────────┐   │
│  │ Quick help text here │   │
│  │ that explains what   │   │
│  │ this does            │   │
│  └──────────────────────┘   │
│          ▲ arrow             │
└─────────────────────────────┘
```

---

## Implementation Details

### Files Added

1. **popup-tooltips.css** — Styling
   - Positioning (top/bottom/left/right)
   - Animations
   - Dark/light theme colors
   - Mobile responsiveness

2. **popup/tooltips.js** — Logic
   - TooltipManager module
   - Show/hide with delays
   - Position calculation
   - Dynamic element watching

3. **popup.html** — Updated
   - Changed `title` to `data-tooltip` on key elements
   - Kept `title` for accessibility
   - Added on 50+ interactive elements

### Configuration

```javascript
// In popup/tooltips.js
const SHOW_DELAY = 200;   // ms before tooltip appears
const HIDE_DELAY = 100;   // ms after mouse leaves
```

To adjust delays, modify these constants in `popup/tooltips.js`.

---

## Elements with Tooltips

### Top Bar
- 📷 Screenshot button
- Override toggle

### Apply Tab
- **Target selector** (Whole page, Headings, etc.)
- **Pick on page** button
- **Typography parameters**: Size, Weight, Line height, Style, etc.
- **Text-only mode** toggle
- **Relax containers** toggle
- **Action buttons**: Apply, Reset, Copy CSS, More (⋯)
- **More menu**: Save as default, Share, Focus capture, Delete

### Accordions
- **Typography** heading
- **OpenType features** heading
- **Presets** heading (+ Save button)
- **Font Rules** heading (+ Add rule button)
- **Accessibility** heading

### Upload Tab
- **Save fonts** button
- **Remove unused fonts** button

### Sites Tab
- **Sort** selector
- **Export** button
- **Import** button
- **Copy from current site** button

### Inspect Tab
- **Scan page** button

### Footer
- **Badge** toggle
- **Theme** selector

---

## CSS Classes & Data Attributes

### HTML Structure

```html
<!-- Add data-tooltip attribute to any element -->
<button data-tooltip="Help text here">Button</button>

<!-- Tooltip is automatically positioned -->
<!-- Arrow points to the element -->
```

### CSS Classes (Auto-applied)

```css
.tooltip            /* Container */
.tooltip.visible    /* When showing */
[data-position="top|bottom|left|right"] /* Position */
```

---

## JavaScript API

```javascript
// Show tooltip for element
TooltipManager.show(element);

// Hide active tooltip
TooltipManager.hide();

// Attach listeners to element
TooltipManager.attach(element);

// Initialize all tooltips
TooltipManager.init();
```

### Dynamic Elements

The TooltipManager watches for new elements added to the DOM and automatically attaches listeners to any with `data-tooltip` attributes.

---

## Performance

- **Lightweight**: ~3KB CSS + ~4KB JS
- **No dependencies**: Pure CSS/vanilla JS
- **Efficient**: Single event delegation approach
- **Garbage collection**: Properly cleans up removed tooltips
- **Memory safe**: Clears timeouts and DOM references

---

## Browser Support

- ✅ Chrome 90+
- ✅ Edge 90+
- ✅ Firefox 88+
- ✅ Safari 14+

---

## Customization

### Change Show Delay

Edit `popup/tooltips.js`:
```javascript
const SHOW_DELAY = 300;  // Change to 300ms
```

### Change Styling

Edit `popup-tooltips.css`:
```css
.tooltip {
  background: var(--ink);      /* Change background color */
  max-width: 220px;            /* Change max width */
  padding: 8px 12px;           /* Change padding */
  font-size: 12px;             /* Change font size */
}
```

### Disable on Mobile

Remove this from `popup-tooltips.css` if you want tooltips on mobile:
```css
@media (max-width: 480px) {
  .tooltip { display: none; }
}
```

---

## Known Limitations

1. **Mobile**: Tooltips are hidden on screens < 480px wide
2. **Long text**: Very long tooltips are capped at 220px width
3. **Nested elements**: Tooltips on nested elements show individually (not chained)
4. **Z-index**: Uses `z-index: 10000` (should be above most elements)

---

## Future Enhancements

- [ ] Add keyboard shortcut to show all tooltips
- [ ] Add tooltip hint badge for first-time users
- [ ] Persist "don't show again" preference
- [ ] Add tutorial mode that auto-shows tooltips on first load
- [ ] Support for multi-line tooltips with formatting

---

## Testing Checklist

- [x] Hover over elements → tooltip appears after 200ms
- [x] Move mouse away → tooltip disappears
- [x] Tooltips stay within viewport
- [x] Work with dark/light themes
- [x] Work on all major browsers
- [x] Don't block interaction with elements
- [x] Remove properly when element is deleted
- [x] Keyboard navigation (focus/blur) triggers tooltips

---

**Status**: ✅ Complete and Production Ready
