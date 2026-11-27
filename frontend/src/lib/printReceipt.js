// Receipt printing with a fallback for phones where the print screen does not open.
//
// Desktop and normal browsers print exactly as before (window.print). Some iPhone Home Screen apps
// ignore window.print without any error; the browser then never fires 'beforeprint'. When that happens
// on a phone, the caller is told so it can offer Share / Copy instead.

const isPhoneOrTablet = () => window.matchMedia?.('(hover: none) and (pointer: coarse)').matches;

export function printWithFallback(onUnavailable) {
  let opened = false;
  const mark = () => { opened = true; };
  window.addEventListener('beforeprint', mark, { once: true });
  const printMedia = window.matchMedia?.('print');
  printMedia?.addEventListener?.('change', mark);
  setTimeout(() => {
    try { window.print(); } catch { /* treated as not opened below */ }
    // window.print blocks on desktop until the dialog closes, so 'opened' is already known there.
    setTimeout(() => {
      window.removeEventListener('beforeprint', mark);
      printMedia?.removeEventListener?.('change', mark);
      if (!opened && isPhoneOrTablet()) onUnavailable?.();
    }, 1500);
  }, 100);
}

/** The receipt as plain text (what is shown on screen), for Share or Copy. */
export function receiptText(elementId) {
  const element = document.getElementById(elementId);
  return (element?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function shareReceipt(elementId, title) {
  const text = receiptText(elementId);
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; } catch (error) { if (error?.name === 'AbortError') return 'cancelled'; }
  }
  await navigator.clipboard?.writeText(text);
  return 'copied';
}
