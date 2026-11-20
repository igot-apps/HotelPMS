// Plain-language labels for booking and room statuses (the stored values stay unchanged).
const BOOKING = { Pending: 'Awaiting payment', Confirmed: 'Confirmed', InHouse: 'In house', Completed: 'Checked out', Cancelled: 'Cancelled', Expired: 'Expired', NoShow: 'Expired' };
const ROOM = { Reserved: 'Reserved', CheckedIn: 'Checked in', CheckedOut: 'Checked out', Cancelled: 'Cancelled', NoShow: 'Expired' };

// Pass the booking's rooms to tell apart a booking where some rooms were checked out and others expired:
// "Completed" covers both outcomes (each room still shows its own status).
export const bookingStatusLabel = (status, rooms) => (status === 'Completed' && rooms?.some((room) => room.status === 'NoShow') ? 'Completed' : BOOKING[status] || status);
export const roomStatusLabel = (status) => ROOM[status] || status;
export const roomStatusTone = (status) => (status === 'CheckedIn' ? 'bg-success-50 text-success-700' : status === 'CheckedOut' ? 'bg-secondary-100 text-secondary-700' : status === 'Cancelled' ? 'bg-danger-50 text-danger-700' : status === 'NoShow' ? 'bg-orange-50 text-orange-700' : 'bg-primary-50 text-primary-700');
