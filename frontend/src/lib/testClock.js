// TEST ONLY: the server's test clock (on when the backend runs with ENABLE_TEST_CLOCK=true).
import { useSyncExternalStore } from 'react';
import api from './axios';

let state = { enabled: false, offsetMs: 0 };
let loaded = null;
const listeners = new Set();
const set = (next) => { state = next; listeners.forEach((fn) => fn()); };

export function loadTestClock() {
  if (!loaded) loaded = api.get('/test-clock').then((r) => set({ enabled: !!r.data?.enabled, offsetMs: Number(r.data?.offsetMs) || 0 })).catch(() => {});
  return loaded;
}

// Move the server's clock, then reload so every screen starts again from the new time.
export async function moveTestClock(body) {
  await api.post('/test-clock', body);
  window.location.reload();
}

export const useTestClock = () => useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => state);
