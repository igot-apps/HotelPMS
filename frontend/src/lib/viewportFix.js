// Keeps the staff app's tap targets lined up with what is on screen on phones.
//
// The staff app locks the page frame (html.app-shell, position: fixed) and scrolls only #main-content.
// On iPhone, opening the keyboard can scroll the locked page itself; when the keyboard closes the page
// can stay shifted, so taps land a little above or below the button that is drawn — buttons seem dead
// until something resets the layout (most often in the Home Screen app, which has no browser bars).
//
// This puts the page frame back once no field is being typed in. Only the outer frame moves:
// the content's own scroll position, the focused field and anything typed are left untouched.

const EDITABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]';

const isTyping = () => document.activeElement?.matches?.(EDITABLE);
const shifted = () => (window.scrollY || document.documentElement.scrollTop || document.body.scrollTop) !== 0;

function resetFrame() {
  if (!document.documentElement.classList.contains('app-shell') || isTyping() || !shifted()) return;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/** Keeps the field being typed in visible above the on-screen keyboard. */
function revealFocusedField() {
  const field = document.activeElement;
  const viewport = window.visualViewport;
  if (!viewport || !field?.matches?.(EDITABLE) || !document.getElementById('main-content')?.contains(field)) return;
  const rect = field.getBoundingClientRect();
  const visibleBottom = viewport.offsetTop + viewport.height;
  if (rect.bottom > visibleBottom - 8 || rect.top < viewport.offsetTop) field.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function enableViewportFix() {
  if (typeof window === 'undefined') return;
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(resetFrame, 120); };
  // Leaving a field (keyboard closing), the keyboard resizing the visible area, and returning to the app.
  document.addEventListener('focusout', later, true);
  window.visualViewport?.addEventListener('resize', () => { later(); requestAnimationFrame(revealFocusedField); });
  window.addEventListener('orientationchange', later);
  window.addEventListener('pageshow', later);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') later(); });
}
