import { createHash } from 'node:crypto';

export function occupantDetails(name: unknown, phone: unknown) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) throw new Error('Enter an occupant name between 1 and 200 characters.');
  if (phone !== undefined && phone !== null && typeof phone !== 'string') throw new Error('Occupant phone number must be text.');
  let digits = String(phone || '').trim().replace(/[\s()+-]/g, '');
  if (digits.startsWith('233') && digits.length === 12) digits = `0${digits.slice(3)}`;
  if (digits && !/^\d{10}$/.test(digits)) throw new Error('Enter a valid 10-digit occupant phone number.');
  return { occupantName: name.trim().replace(/\s+/g, ' '), occupantPhone: digits || null };
}
const normalizedName = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const normalizedPhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('233') && digits.length === 12 ? `0${digits.slice(3)}` : digits;
};

// Called inside the same serializable transaction as the check-in/edit. A name
// alone is not reliable identity; warn only when both name and phone match.
export async function confirmOccupant(tx: any, propertyId: number, stay: any, details: { occupantName: string; occupantPhone: string | null }, confirmation?: unknown, checkingIn = false) {
  if (!details.occupantPhone) return { confirmedDuplicates: [] };
  await tx.$queryRaw`SELECT "propertyId" FROM properties WHERE "propertyId" = ${propertyId} FOR UPDATE`;
  const candidates = await tx.reservationRoom.findMany({ where: {
    reservationRoomId: { not: stay.reservationRoomId }, status: 'CheckedIn',
    reservation: { propertyId, status: { in: ['Confirmed', 'InHouse'] } },
    ...((checkingIn || stay.status === 'CheckedIn') ? {} : { checkInDate: { lt: stay.checkOutDate }, checkOutDate: { gt: stay.checkInDate } }),
  }, include: { room: { select: { roomNumber: true } }, reservation: { select: { confirmationCode: true } } }, orderBy: { reservationRoomId: 'asc' } });
  const matches = candidates.filter((other: any) => other.occupantName && other.occupantPhone && normalizedName(other.occupantName) === normalizedName(details.occupantName) && normalizedPhone(other.occupantPhone) === details.occupantPhone);
  if (!matches.length) return { confirmedDuplicates: [] };
  const token = createHash('sha256').update(JSON.stringify({ propertyId, stayId: stay.reservationRoomId, name: normalizedName(details.occupantName), phone: details.occupantPhone, matches: matches.map((other: any) => [other.reservationRoomId, other.updatedAt.toISOString()]) })).digest('hex');
  const conflicts = matches.map((other: any) => ({ roomNumber: other.room?.roomNumber || other.roomNumberSnapshot || 'Removed room', confirmationCode: other.reservation.confirmationCode }));
  if (confirmation !== token) {
    const error: any = new Error('This name and phone number are already assigned to another checked-in room. Confirm the actual occupant before continuing.');
    error.statusCode = 409;
    error.code = 'OCCUPANT_ALREADY_CHECKED_IN';
    error.details = { conflicts, confirmation: token };
    throw error;
  }
  return { confirmedDuplicates: conflicts };
}
