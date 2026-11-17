// Link to one booking on the Reservations page, opened, optionally starting an action
// ('checkin' | 'checkout' | 'extend' | 'pay') for a specific room stay.
export function bookingLink(row, action, stayId = row?.reservationRoomId) {
  const params = new URLSearchParams({ search: row.confirmationCode || row.reservationId, open: row.reservationId });
  if (action) params.set('do', action);
  if (action && action !== 'pay' && stayId) params.set('stay', String(stayId));
  return `/reservations?${params}`;
}
