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

// Same rule as the server: a guest may still arrive until 6 hours after check-in time on the
// arrival day; only then can they be marked as a no-show.
export function noShowAllowedFrom(checkInDate, checkInTime = '14:00') {
  const [hour, minute] = /^\d{2}:\d{2}$/.test(checkInTime || '') ? checkInTime.split(':').map(Number) : [14, 0];
  const day = String(checkInDate).slice(0, 10);
  return new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hour + 6, minute);
}
