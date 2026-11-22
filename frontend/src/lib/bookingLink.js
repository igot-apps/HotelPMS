// Link to one booking's detail page, optionally starting a room action
// ('checkin' | 'checkout' | 'extend' | 'pay') for a specific room stay.
export function bookingLink(row, action, stayId = row?.reservationRoomId) {
  const params = new URLSearchParams();
  if (action) params.set('do', action);
  if (action && action !== 'pay' && stayId) params.set('stay', String(stayId));
  return `/reservations/${row.reservationId}?${params.toString()}`;
}
