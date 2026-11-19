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

// Expected checkout moment: departure date at the hotel's checkout time (browser time = hotel time).
export function expectedCheckoutAt(checkOutDate, checkOutTime = '11:00') {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(checkOutTime || '') ? checkOutTime.split(':').map(Number) : [11, 0];
  const day = String(checkOutDate).slice(0, 10);
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, minute);
}

export const formatTime = (date) => date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// A wall-clock time in the hotel's time zone as a real moment (independent of the browser's zone).
function hotelWallTime(day, hour, minute, timeZone) {
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, minute);
  if (!timeZone) return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour, minute);
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    return new Date(guess - (shown - guess));
  } catch {
    return new Date(guess);
  }
}

// Same rule as the server: a guest may still arrive until 6 hours after check-in time on the
// arrival day (hotel time zone); only then can they be marked as a no-show.
export const NO_SHOW_GRACE_HOURS = 6;
export function noShowAllowedFrom(checkInDate, checkInTime = '14:00', timeZone) {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(checkInTime || '') ? checkInTime.split(':').map(Number) : [14, 0];
  return new Date(hotelWallTime(String(checkInDate).slice(0, 10), hour, minute, timeZone).getTime() + NO_SHOW_GRACE_HOURS * 3600000);
}

// "20:00 on 19 Nov" in the hotel's time zone.
export function formatHotelTime(date, timeZone) {
  const options = { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(timeZone ? { timeZone } : {}) };
  const dayOptions = { day: 'numeric', month: 'short', ...(timeZone ? { timeZone } : {}) };
  try { return `${date.toLocaleTimeString('en-GB', options)} on ${date.toLocaleDateString('en-GB', dayOptions)}`; } catch { return date.toLocaleString(); }
}
