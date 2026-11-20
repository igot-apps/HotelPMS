import { hotelDate } from '../reports/daily-overview.service';

// Shared stay-timing rules. Scheduled stay dates are UTC date-only values that
// represent the hotel's calendar day; accommodation nights are calendar nights.

export const DUE_SOON_MINUTES = 60;
const DAY = 86_400_000;

// The UTC instant of a wall-clock time ("HH:MM") on a hotel calendar day ("YYYY-MM-DD").
export function hotelWallTime(date: string, time: string, timeZone: string): Date {
  const [hour, minute] = /^([01]\d|2[0-3]):([0-5]\d)$/.test(time) ? time.split(':').map(Number) : [11, 0];
  const target = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hour, minute);
  let result = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(result));
    const get = (type: string) => Number(parts.find(p => p.type === type)!.value);
    result += target - Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  }
  return new Date(result);
}

export const dateOnly = (value: Date) => value.toISOString().slice(0, 10);

// When a stay is expected to leave: its departure date at the hotel's checkout time.
export function checkoutDueAt(checkOutDate: Date, checkOutTime: string | null | undefined, timeZone: string) {
  return hotelWallTime(dateOnly(checkOutDate), checkOutTime || '11:00', timeZone);
}

export type CheckoutState = 'upcoming' | 'dueSoon' | 'due' | 'overdue';
// overdue: checkout time has passed · dueSoon: within an hour · due: later today (hotel calendar day) ·
// upcoming: a later day (tomorrow's departures are not "due today", even within 24 hours).
export function checkoutState(dueAt: Date, now = new Date(), timeZone = 'Africa/Accra'): CheckoutState {
  const minutes = (dueAt.getTime() - now.getTime()) / 60000;
  if (minutes <= 0) return 'overdue';
  if (minutes <= DUE_SOON_MINUTES) return 'dueSoon';
  if (hotelDate(dueAt, timeZone) === hotelDate(now, timeZone)) return 'due';
  return 'upcoming';
}

// Overdue for a manager: still unresolved a few hours after checkout time.
export const MANAGER_ESCALATION_MINUTES = 180;
export const minutesLate = (dueAt: Date, at: Date) => Math.max(0, Math.floor((at.getTime() - dueAt.getTime()) / 60000));

// A checked-in stay whose scheduled departure has passed still physically occupies the room.
// Treat it as occupying until the end of today (hotel time) so it blocks stays starting today
// or earlier, but never blocks future reservations.
export function overdueOccupancyClause(from: Date, timeZone = 'Africa/Accra', now = new Date()) {
  const tomorrow = new Date(`${hotelDate(now, timeZone)}T00:00:00Z`).getTime() + DAY;
  if (from.getTime() >= tomorrow) return null;
  return { status: 'CheckedIn', reservation: { status: { in: ['Confirmed', 'InHouse'] as any[] } }, checkOutDate: { lte: from } };
}

// A guest can still arrive on their arrival day; only call them a no-show this many hours
// after the hotel's check-in time (e.g. 14:00 + 6 h = 20:00), or any time after that day.
export const NO_SHOW_GRACE_HOURS = 6;
export function noShowAllowedFrom(checkInDate: Date, checkInTime: string | null | undefined, timeZone: string) {
  return new Date(hotelWallTime(dateOnly(checkInDate), checkInTime || '14:00', timeZone).getTime() + NO_SHOW_GRACE_HOURS * 3_600_000);
}
