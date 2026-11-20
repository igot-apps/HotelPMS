// Server-authoritative time. A receptionist's computer can have the wrong date, time or time zone, so
// business rules never read the device clock. Every API response carries the server's HTTP `Date`
// header (exposed through CORS); we keep the latest server time seen together with a performance.now()
// baseline, a monotonic clock that ignores changes to the computer's clock, and count forward from it.
// serverNow() returns null when there is no trustworthy server time: callers then treat time-based
// actions as "not yet" (the backend stays the final authority for every action anyway).

const VALID_FROM = Date.UTC(2024, 0, 1);
const VALID_TO = Date.UTC(2100, 0, 1);
const DRIFT_MS = 60000; // device and monotonic clocks disagree: the computer slept or its clock was changed
const MAX_AGE_MS = 6 * 3600000; // no server time for this long: ask again before trusting it
const BACKWARDS_MS = 120000; // an older time than we hold (e.g. a cached response): ignore it
const RESYNC_GAP_MS = 15000;
export const CLOCK_NOTICE_MS = 5 * 60000;

const clocks = {
  perf: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  device: () => Date.now(),
};
let sample = null; // { server, perf, device }: server time (ms) at monotonic `perf` / device time `device`
let stale = false;
let version = 0;
let resync = null;
let lastResync = -Infinity;
const listeners = new Set();

// Listeners run after the current render (serverNow() may be called while rendering).
const notify = () => { version += 1; const run = () => listeners.forEach((fn) => fn()); if (typeof queueMicrotask === 'function') queueMicrotask(run); else run(); };

function projected(perfAt) {
  return sample && !stale ? sample.server + (perfAt - sample.perf) : null;
}

// Record the server time from a response's `Date` header. `sentAt` is performance.now() when the request left.
export function recordServerTime(header, sentAt) {
  const parsed = typeof header === 'string' ? Date.parse(header) : NaN;
  if (!Number.isFinite(parsed) || parsed < VALID_FROM || parsed > VALID_TO) return false;
  const receivedAt = clocks.perf();
  // HTTP dates are whole seconds rounded down, stamped while the response was on its way:
  // aim for the middle of the second plus half the (capped) round trip.
  const roundTrip = Number.isFinite(sentAt) ? Math.min(Math.max(0, receivedAt - sentAt), 2000) : 0;
  const estimate = parsed + 500 + roundTrip / 2;
  const current = projected(receivedAt);
  if (current !== null) {
    if (estimate <= current) return estimate > current - BACKWARDS_MS; // consistent (or an old cached copy): keep ours
    if (estimate - current < 1000) { sample = { server: estimate, perf: receivedAt, device: clocks.device() }; return true; }
  }
  sample = { server: estimate, perf: receivedAt, device: clocks.device() };
  stale = false;
  notify();
  return true;
}

// The server's current time as a Date, or null if it is not known (not yet received, or no longer trusted).
export function serverNow() {
  if (!sample) return null;
  if (!stale) {
    const elapsed = clocks.perf() - sample.perf;
    const deviceElapsed = clocks.device() - sample.device;
    if (Math.abs(deviceElapsed - elapsed) > DRIFT_MS || elapsed > MAX_AGE_MS) { stale = true; notify(); }
  }
  if (stale) { requestResync(); return null; }
  return new Date(sample.server + (clocks.perf() - sample.perf));
}

// How far this device's clock is from the server (ms, positive = device is behind), or null.
export function deviceClockOffset() {
  return sample ? sample.server - sample.device : null;
}

// Ask once now (at most every 15 s), and keep retrying quietly while the time is untrusted (e.g. offline).
let retryTimer = null;
function requestResync() {
  if (!resync) return;
  const now = clocks.perf();
  if (now - lastResync >= RESYNC_GAP_MS) { lastResync = now; resync(); }
  if (!retryTimer && typeof setTimeout === 'function') {
    retryTimer = setTimeout(() => { retryTimer = null; if (stale) requestResync(); }, RESYNC_GAP_MS);
    retryTimer.unref?.();
  }
}

export const setResync = (fn) => { resync = fn; };
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getClockVersion = () => version;

// Tests only: swap the clocks and start over.
export function _resetForTests(overrides = {}) {
  Object.assign(clocks, overrides);
  sample = null; stale = false; version = 0; lastResync = -Infinity; resync = null;
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}
