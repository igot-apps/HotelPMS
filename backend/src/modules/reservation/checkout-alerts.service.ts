import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';
import { checkoutDueAt, checkoutState, MANAGER_ESCALATION_MINUTES, minutesLate } from './stay-timing';

type Actor = { userId: number; propertyId: number };
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export const VERIFY_RESULTS = ['present', 'departed', 'unlocated'] as const;
export type VerifyResult = typeof VERIFY_RESULTS[number];
const DAY = 86_400_000;

async function staff(actor: Actor) {
  const user = await prisma.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
  if (!user || !['Manager', 'Receptionist'].includes(user.role.roleName)) throw fail('Front desk staff required.', 403);
  return user;
}

// Latest departure verification for each stay, from the audit log.
export async function latestVerifications(stayIds: number[]) {
  if (!stayIds.length) return new Map<number, any>();
  const logs = await prisma.auditLog.findMany({
    where: { entityType: 'Reservation', action: 'DepartureVerified', OR: stayIds.map(id => ({ newData: { path: ['reservationRoomId'], equals: id } })) },
    orderBy: { createdAt: 'desc' }, include: { user: { select: { fullName: true } } },
  });
  const latest = new Map<number, any>();
  for (const log of logs) {
    const data: any = log.newData;
    if (!latest.has(data.reservationRoomId)) latest.set(data.reservationRoomId, { result: data.result, note: data.note || null, at: log.createdAt, by: log.user?.fullName || null });
  }
  return latest;
}

// Checked-in rooms due within a day, due now, or overdue (hotel checkout time). Persistent until checkout or extension.
export async function checkoutAlerts(actor: Actor, now = new Date()) {
  const user = await staff(actor);
  const property = await prisma.property.findUnique({ where: { propertyId: actor.propertyId }, select: { timezone: true, checkOutTime: true } });
  const timeZone = property?.timezone || 'Africa/Accra';
  const horizon = new Date(new Date(`${hotelDate(now, timeZone)}T00:00:00Z`).getTime() + 2 * DAY);
  const stays = await prisma.reservationRoom.findMany({
    where: { status: 'CheckedIn', checkOutDate: { lt: horizon }, reservation: { propertyId: actor.propertyId, status: { in: ['Confirmed', 'InHouse'] } } },
    include: { room: { select: { roomNumber: true } }, reservation: { select: { reservationId: true, confirmationCode: true, guestNameSnapshot: true, totalAmount: true, amountPaid: true, platformGuest: { select: { fullName: true } }, propertyGuest: { select: { fullName: true } } } } },
    orderBy: [{ checkOutDate: 'asc' }, { reservationRoomId: 'asc' }],
  });
  const verifications = await latestVerifications(stays.map(s => s.reservationRoomId));
  const alerts = stays.map(stay => {
    const dueAt = checkoutDueAt(stay.checkOutDate, property?.checkOutTime, timeZone);
    const state = checkoutState(dueAt, now);
    const late = state === 'overdue' ? minutesLate(dueAt, now) : 0;
    const verification = verifications.get(stay.reservationRoomId) || null;
    const res = stay.reservation;
    return {
      reservationRoomId: stay.reservationRoomId, reservationId: res.reservationId, confirmationCode: res.confirmationCode,
      roomNumber: stay.room?.roomNumber || stay.roomNumberSnapshot || null,
      guestName: stay.occupantName || res.guestNameSnapshot || res.platformGuest?.fullName || res.propertyGuest?.fullName || 'Guest',
      checkOutDate: stay.checkOutDate, expectedCheckoutAt: dueAt, state, minutesLate: late,
      balanceDue: Math.max(0, Number(res.totalAmount || 0) - Number(res.amountPaid)),
      guestPresenceStatus: stay.guestPresenceStatus, verification,
      // Unresolved long after checkout time, or nobody could find the guest: a manager should look.
      escalated: state === 'overdue' && (late >= MANAGER_ESCALATION_MINUTES || verification?.result === 'unlocated'),
    };
  }).filter(alert => alert.state !== 'upcoming');
  return {
    role: user.role.roleName, checkOutTime: property?.checkOutTime || '11:00', generatedAt: now,
    counts: { due: alerts.filter(a => a.state === 'due').length, dueSoon: alerts.filter(a => a.state === 'dueSoon').length, overdue: alerts.filter(a => a.state === 'overdue').length, escalated: alerts.filter(a => a.escalated).length },
    alerts: alerts.sort((a, b) => Number(b.escalated) - Number(a.escalated) || +new Date(a.expectedCheckoutAt) - +new Date(b.expectedCheckoutAt)),
  };
}

// Staff record whether a guest past (or near) checkout is still here, has left, or cannot be found.
export async function verifyDeparture(actor: Actor, stayId: number, input: { result?: unknown; note?: unknown }) {
  const result = input.result as VerifyResult;
  if (!VERIFY_RESULTS.includes(result)) throw fail('Choose whether the guest is still here, has left, or cannot be found.');
  const note = typeof input.note === 'string' ? input.note.trim().replace(/\s+/g, ' ') : '';
  if (note.length > 300) throw fail('Keep the note under 300 characters.');
  if (result === 'unlocated' && note.length < 5) throw fail('Describe what was checked (at least 5 characters).');
  await staff(actor);
  return prisma.$transaction(async tx => {
    const stay = await tx.reservationRoom.findFirst({ where: { reservationRoomId: stayId, reservation: { propertyId: actor.propertyId } } });
    if (!stay || stay.status !== 'CheckedIn') throw fail('Only a checked-in room can be verified.', 404);
    const now = new Date();
    // Reuse guest presence: still here = in room; left = out (keeps the first time they were seen out).
    if (result === 'present') await tx.reservationRoom.update({ where: { reservationRoomId: stayId }, data: { guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null, presenceUpdatedBy: actor.userId } });
    if (result === 'departed') await tx.reservationRoom.update({ where: { reservationRoomId: stayId }, data: { guestPresenceStatus: 'Out', guestOutAt: stay.guestOutAt || now, presenceUpdatedBy: actor.userId } });
    await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Reservation', action: 'DepartureVerified', newData: { reservationId: stay.reservationId, reservationRoomId: stayId, result, note: note || null, verifiedAt: now.toISOString() } } });
    return { reservationRoomId: stayId, result, note: note || null, at: now };
  });
}
