// Browser probe: open a page at phone size, open a dialog, then run this whole file in the page
// (browser javascript tool or DevTools console). It returns a JSON report; "ok: true" means every
// control in the open dialog can be seen and tapped. Works on any page, so it covers "one page or all".
(() => {
  const vw = innerWidth, vh = innerHeight;
  const dialogs = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"], dialog[open], .mobile-dialog-overlay')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  const dialog = dialogs[dialogs.length - 1];
  const problems = [];
  if (!dialog) return { ok: true, note: 'No open dialog found. Open one first, then run again.' };

  // 1. Something on the way up turns position:fixed into "inside this box only" (the iPhone bug we hit).
  const trapping = [];
  for (let el = dialog.parentElement; el && el !== document.documentElement; el = el.parentElement) {
    const s = getComputedStyle(el);
    const why = [
      s.transform !== 'none' && 'transform', s.filter !== 'none' && 'filter',
      (s.backdropFilter || s.webkitBackdropFilter || 'none') !== 'none' && 'backdrop-filter',
      s.perspective !== 'none' && 'perspective', /paint|layout|strict|content/.test(s.contain) && `contain:${s.contain}`,
      /transform|filter|perspective/.test(s.willChange) && `will-change:${s.willChange}`,
      s.webkitOverflowScrolling === 'touch' && '-webkit-overflow-scrolling:touch',
    ].filter(Boolean);
    if (why.length) trapping.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].slice(0, 3).join('.')} (${why.join(', ')})`);
  }
  if (trapping.length) problems.push({ issue: 'dialog is trapped inside a wrapper; render it with createPortal(…, document.body) or remove the style', wrappers: trapping });

  // 2. The backdrop should cover the whole screen.
  const overlay = [dialog, ...dialogs].find(el => /fixed/.test(getComputedStyle(el).position)) || dialog;
  const r = overlay.getBoundingClientRect();
  if (r.top > 1 || r.left > 1 || r.right < vw - 1 || r.bottom < vh - 1) problems.push({ issue: 'backdrop does not cover the screen', rect: [r.left, r.top, r.right, r.bottom].map(Math.round), viewport: [vw, vh] });

  // 3. Every control must be reachable (scroll it into view) and be the thing a tap actually hits.
  const controls = [...dialog.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, label')]
    .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
  for (const el of controls) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const b = el.getBoundingClientRect();
    const name = (el.innerText || el.getAttribute('aria-label') || el.placeholder || el.name || el.tagName).trim().slice(0, 40);
    if (b.bottom > vh || b.top < 0 || b.right > vw || b.left < 0) { problems.push({ issue: 'off screen even after scrolling', control: name }); continue; }
    const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const hit = document.elementFromPoint(x, y);
    if (hit && !el.contains(hit) && !hit.contains(el) && !(el.htmlFor && hit.id === el.htmlFor) && !(el.control && hit === el.control)) {
      problems.push({ issue: 'covered — a tap lands on something else', control: name, coveredBy: `${hit.tagName.toLowerCase()}.${[...hit.classList].slice(0, 3).join('.')}${hit.closest('nav') ? ' (inside a nav)' : ''}` });
    }
  }
  return { ok: !problems.length, viewport: [vw, vh], dialog: dialog.getAttribute('aria-labelledby') || dialog.getAttribute('aria-label') || dialog.className.slice(0, 60), controlsChecked: controls.length, problems };
})();
