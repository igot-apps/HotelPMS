// Popup search: confirmation code, guest name, phone number or room number.
export function matchesQuery(row, query) {
  const text = (query || '').trim().toLowerCase();
  if (!text) return true;
  const rooms = (row.rooms || []).map((room) => (typeof room === 'string' ? room : `${room.roomNumber ?? ''} ${room.phone || ''}`));
  return [row.confirmationCode, row.guestName, row.phone, row.occupantPhone, row.guestPhone, row.roomNumber, ...(row.roomNumbers || []), ...rooms].filter(Boolean).join(' ').toLowerCase().includes(text);
}
