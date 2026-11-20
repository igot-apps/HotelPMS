import { useSyncExternalStore } from 'react';
import { getClockVersion, subscribe } from './serverClock.js';

// Re-render when server time first arrives, is lost, or comes back (so time-based buttons update).
export default function useServerClock() {
  return useSyncExternalStore(subscribe, getClockVersion, getClockVersion);
}
