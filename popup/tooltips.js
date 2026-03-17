/**
 * Tooltip Manager — Koppl
 * Fast custom tooltips positioned via getBoundingClientRect
 */

const TooltipManager = (() => {
  const SHOW_DELAY = 180; // ms
  const HIDE_DELAY = 80;  // ms
  const GAP = 7;          // px between element and tooltip

  let tip = null;       // current tooltip DOM node
  let showTimer = null;
  let hideTimer = null;

  /* ── Create & position ── */

  const createTip = () => {
    const el = document.createElement('div');
    el.className = 'ktooltip';
    document.body.appendChild(el);
    return el;
  };

  const placeTip = (anchor) => {
    if (!tip) return;

    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer top, fallback bottom, then right, then left
    const spaceTop    = r.top;
    const spaceBottom = vh - r.bottom;
    const spaceRight  = vw - r.right;
    const spaceLeft   = r.left;

    let side;
    if (spaceTop >= th + GAP + 4)         side = 'top';
    else if (spaceBottom >= th + GAP + 4) side = 'bottom';
    else if (spaceRight >= tw + GAP + 4)  side = 'right';
    else                                   side = 'left';

    let top, left;
    switch (side) {
      case 'top':
        top  = r.top - th - GAP;
        left = r.left + r.width / 2 - tw / 2;
        break;
      case 'bottom':
        top  = r.bottom + GAP;
        left = r.left + r.width / 2 - tw / 2;
        break;
      case 'right':
        top  = r.top + r.height / 2 - th / 2;
        left = r.right + GAP;
        break;
      case 'left':
        top  = r.top + r.height / 2 - th / 2;
        left = r.left - tw - GAP;
        break;
    }

    // Clamp to viewport edges
    left = Math.max(6, Math.min(left, vw - tw - 6));
    top  = Math.max(6, Math.min(top,  vh - th - 6));

    tip.style.left = `${Math.round(left)}px`;
    tip.style.top  = `${Math.round(top)}px`;

    // Arrow points toward the anchor
    const arrowMap = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
    tip.setAttribute('data-arrow', arrowMap[side]);
  };

  /* ── Show / hide ── */

  const show = (anchor) => {
    const text = anchor.getAttribute('data-tooltip');
    if (!text) return;

    // Cancel pending hide
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    // Cancel pending show for another element
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }

    showTimer = setTimeout(() => {
      showTimer = null;

      if (!tip) tip = createTip();

      tip.textContent = text;
      tip.classList.remove('ktooltip-visible');

      // Measure off-screen first (opacity:0 already)
      placeTip(anchor);

      // Then fade in
      requestAnimationFrame(() => {
        tip.classList.add('ktooltip-visible');
      });
    }, SHOW_DELAY);
  };

  const hide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (!tip) return;

    tip.classList.remove('ktooltip-visible');

    hideTimer = setTimeout(() => {
      if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
      tip = null;
      hideTimer = null;
    }, HIDE_DELAY);
  };

  /* ── Attach listeners ── */

  const attach = (el) => {
    el.addEventListener('mouseenter', () => show(el));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus',      () => show(el));
    el.addEventListener('blur',       hide);
  };

  /* ── Init ── */

  const init = () => {
    document.querySelectorAll('[data-tooltip]').forEach(attach);

    // Watch for dynamic elements (e.g. rendered font lists, rule chips)
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.hasAttribute('data-tooltip')) attach(node);
          node.querySelectorAll('[data-tooltip]').forEach(attach);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  };

  return { init, show, hide, attach };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', TooltipManager.init);
} else {
  TooltipManager.init();
}
