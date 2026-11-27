import { lazy } from 'react';
import { hasPendingSaves } from './connectionStatus';

// Pages load only when first opened, so the app starts faster on phones.
//
// After a new version is published, a phone that kept the app open may ask for a page file that no
// longer exists. Then the app reloads once to pick up the new version — but only when no save is on its
// way; otherwise the error screen offers "Reload page" for staff to tap when ready.
const RELOAD_FLAG = 'hideout24-chunk-reload';

export function lazyPage(load) {
  const Page = lazy(() => load().catch((error) => {
    let recent = false;
    try { recent = Date.now() - Number(sessionStorage.getItem(RELOAD_FLAG) || 0) < 30000; } catch { /* storage blocked */ }
    if (!recent && !hasPendingSaves()) {
      try { sessionStorage.setItem(RELOAD_FLAG, String(Date.now())); } catch { /* storage blocked */ }
      window.location.reload();
      return new Promise(() => {}); // keep showing the loading state until the reload happens
    }
    throw error;
  }));
  Page.preload = load;
  return Page;
}

/** Fetch the given pages' files in the background once the phone is idle, so their first tap is instant. */
export function preloadWhenIdle(pages) {
  const run = () => pages.forEach((page) => page.preload?.().catch(() => {}));
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2500);
}
