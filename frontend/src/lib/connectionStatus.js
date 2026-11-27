import { useSyncExternalStore } from 'react';

// What the app knows about its connection to the server, shown by <ConnectionBanner />.
//   offline     – the device says it has no network
//   unreachable – the last request got no reply (no signal, server asleep or restarting)
//   slow        – a save (payment, booking, refund…) has been waiting for a reply for a while
// Nothing here retries or queues anything: it only tells staff what is happening.

const SLOW_AFTER_MS = 5000;
let state = { offline: typeof navigator !== 'undefined' && navigator.onLine === false, unreachable: false, slow: false };
const listeners = new Set();
const pendingSaves = new Map(); // request id -> timer
let nextId = 0;

function set(patch) {
  const next = { ...state, ...patch };
  if (next.offline === state.offline && next.unreachable === state.unreachable && next.slow === state.slow) return;
  state = next;
  listeners.forEach((listener) => listener());
}

export const markReachable = () => set({ unreachable: false });
export const markUnreachable = () => set({ unreachable: true });

/** A save started; returns a function to call when it finishes (either way). */
export function trackSave() {
  const id = ++nextId;
  pendingSaves.set(id, setTimeout(() => set({ slow: true }), SLOW_AFTER_MS));
  return () => {
    clearTimeout(pendingSaves.get(id));
    pendingSaves.delete(id);
    if (pendingSaves.size === 0) set({ slow: false });
  };
}

/** True while any save is still waiting for the server (used to hold back an app update reload). */
export const hasPendingSaves = () => pendingSaves.size > 0;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => set({ offline: false, unreachable: false }));
  window.addEventListener('offline', () => set({ offline: true }));
}

const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const useConnectionStatus = () => useSyncExternalStore(subscribe, () => state, () => state);
