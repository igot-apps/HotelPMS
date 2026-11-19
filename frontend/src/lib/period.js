// Report periods as whole hotel days (YYYY-MM-DD), worked out in the hotel's time zone.
export const MAX_PERIOD_DAYS = 92;

export function hotelToday(timeZone = 'Africa/Accra', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;

export const PRESETS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'], ['thisMonth', 'This month'], ['lastMonth', 'Last month'], ['custom', 'Custom'],
];

export function presetRange(preset, today) {
  const firstOfMonth = `${today.slice(0, 8)}01`;
  if (preset === 'yesterday') { const d = addDays(today, -1); return { from: d, to: d }; }
  if (preset === 'last7') return { from: addDays(today, -6), to: today };
  if (preset === 'thisMonth') return { from: firstOfMonth, to: today };
  if (preset === 'lastMonth') { const end = addDays(firstOfMonth, -1); return { from: `${end.slice(0, 8)}01`, to: end }; }
  return { from: today, to: today };
}

// The same number of days immediately before the period (for "vs previous period").
export function previousPeriod(from, to) {
  const length = daysBetween(from, to);
  return { from: addDays(from, -length), to: addDays(from, -1) };
}

const nice = (date) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
export function periodLabel(from, to, today) {
  if (from === to) return from === today ? 'Today' : from === addDays(today, -1) ? 'Yesterday' : nice(from);
  return `${nice(from)} – ${nice(to)}`;
}
