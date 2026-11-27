import { useEffect, useState } from 'react';
import { hasPendingSaves } from './connectionStatus';

// Notices when a newer version of the app has been published. A Home Screen app can stay open for days,
// so it checks when staff come back to it and every 10 minutes. It never reloads by itself: staff choose
// when, and the reload waits while a save is on its way or a form has unsaved typing.

/* global __APP_VERSION__ */
const CURRENT = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
const CHECK_EVERY_MS = 10 * 60 * 1000;

async function publishedVersion() {
  const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json())?.version || null;
}

// Typing in any field marks the page as having unsaved changes until the next page opens.
let editedPath = null;
if (typeof document !== 'undefined') {
  document.addEventListener('input', (event) => { if (event.target?.matches?.('input, textarea, select')) editedPath = window.location.pathname; }, true);
}
const hasUnsavedTyping = () => editedPath === window.location.pathname;

export function useUpdateAvailable() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!import.meta.env.PROD) return undefined;
    let stopped = false;
    const check = async () => {
      try {
        const version = await publishedVersion();
        if (!stopped && version && version !== CURRENT) setAvailable(true);
      } catch { /* offline: try again later */ }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => { stopped = true; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, []);
  return available;
}

/** 'reloaded' | 'saving' (a save is still on its way) | 'kept' (staff chose to keep their typing). */
export function reloadForUpdate() {
  if (hasPendingSaves()) return 'saving';
  if (hasUnsavedTyping() && !window.confirm('You have typed on this page without saving. Update now and lose it?')) return 'kept';
  window.location.reload();
  return 'reloaded';
}
