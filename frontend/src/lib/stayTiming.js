import { serverNow } from './serverClock.js';

// Display helpers for stay timing. Nights are calendar nights; these only describe elapsed time.

export function formatDuration(ms) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h ${mins}m`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

const HOTEL_TIME_ZONE = 'Africa/Accra';

// Expected checkout moment: departure date at the hotel's checkout time, in the hotel's time zone.
export function expectedCheckoutAt(checkOutDate, checkOutTime = '11:00', timeZone = HOTEL_TIME_ZONE) {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(checkOutTime || '') ? checkOutTime.split(':').map(Number) : [11, 0];
  return hotelWallTime(String(checkOutDate).slice(0, 10), hour, minute, timeZone);
}

export const formatTime = (date, timeZone) => {
  try { return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }); }
  catch { return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
};

// A wall-clock time in the hotel's time zone as a real moment (independent of the browser's zone).
function hotelWallTime(day, hour, minute, timeZone, second = 0) {
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, minute);
  timeZone = timeZone || HOTEL_TIME_ZONE; // never the computer's own zone
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return new Date(guess - (shown - guess) + second * 1000);
  } catch {
    return new Date(guess + second * 1000);
  }
}

// Same rule as the server: a guest may still arrive until 6 hours after check-in time on the
// arrival day (hotel time zone); only then can they be marked as a no-show.
export const NO_SHOW_GRACE_HOURS = 6;
export function noShowAllowedFrom(checkInDate, checkInTime = '14:00', timeZone = HOTEL_TIME_ZONE) {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(checkInTime || '') ? checkInTime.split(':').map(Number) : [14, 0];
  return new Date(hotelWallTime(String(checkInDate).slice(0, 10), hour, minute, timeZone).getTime() + NO_SHOW_GRACE_HOURS * 3600000);
}

// datetime-local values in hotel time (backdated departures, refund returns), so a computer set to
// another time zone still records the moment staff meant.
export function toHotelInput(date, timeZone = HOTEL_TIME_ZONE, withSeconds = false) {
  if (!date) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}${withSeconds ? `:${parts.second}` : ''}`;
}
export function fromHotelInput(value, timeZone = HOTEL_TIME_ZONE) {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || '');
  return match ? hotelWallTime(match[1], Number(match[2]), Number(match[3]), timeZone, Number(match[4] || 0)) : null;
}

// "20:00 on 19 Nov" in the hotel's time zone.
export function formatHotelTime(date, timeZone) {
  const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) };
  const dayOptions = { day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}) };
  try { return `${date.toLocaleTimeString('en-GB', options)} on ${date.toLocaleDateString('en-GB', dayOptions)}`; } catch { return date.toLocaleString(); }
}

// Rooms of a booking that can be marked as no-show now: still reserved and past the no-show time
// (hotel check-in time + 6 hours on the arrival day, hotel time zone). Same rule as the server.
export function noShowRooms(res, now = serverNow()?.getTime()) {
  if (now == null || !['Confirmed', 'InHouse'].includes(res?.status)) return [];
  return (res.reservationRooms || []).filter((stay) => stay.status === 'Reserved'
    && now >= noShowAllowedFrom(stay.checkInDate || res.checkInDate, res.property?.checkInTime, res.property?.timezone).getTime());
}
