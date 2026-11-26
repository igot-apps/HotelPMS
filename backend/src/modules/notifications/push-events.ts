import { prisma } from '../../shared/utils/prisma';
import { hotelDate } from '../reports/daily-overview.service';
import { checkoutDueAt, checkoutState, MANAGER_ESCALATION_MINUTES, minutesLate } from '../reservation/stay-timing';
import { notifyStaff, pushConfigured } from './push.service';

type Actor = { userId: number; propertyId: number };
const money = (n: unknown) => `GHS ${Number(n || 0).toFixed(2)}`;
const DAY = 86_400_000;

/** Managers hear about every refund recorded by someone else (nothing is missed, nothing needs approval). */
export async function notifyRefundRecorded(actor: Actor, refunds: { refundId: number; reservationId: string; amount: unknown }[]) {
  if (!pushConfigured() || !refunds.length) return;
  const reservationId = refunds[0].reservationId;
  const [booking, staff] = await Promise.all([
    prisma.reservation.findUnique({ where: { reservationId }, select: { confirmationCode: true, guestNameSnapshot: true } }),
    prisma.user.findUnique({ where: { userId: actor.userId }, select: { fullName: true } }),
  ]);
  const total = refunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  await notifyStaff(actor.propertyId, ['Manager'], {
    title: 'Refund recorded',
    body: `${staff?.fullName || 'Staff'} returned ${money(total)} to ${booking?.guestNameSnapshot || 'a guest'}${booking?.confirmationCode ? ` · ${booking.confirmationCode}` : ''}`,
    url: `/bookings/${reservationId}#refunds`, tag: `refund-${reservationId}`,
  }, { excludeUserId: actor.userId, onceKey: `refund:${refunds.map(r => r.refundId).sort().join(',')}` });
}

/** Managers hear when a staff member's cash could not be counted. */
export async function notifyCashCountIssue(actor: Actor, issue: { issueId?: number; staffUserId: number; businessDate: string | Date; reason?: string | null }) {
  if (!pushConfigured()) return;
  const staff = await prisma.user.findUnique({ where: { userId: issue.staffUserId }, select: { fullName: true } });
  const day = typeof issue.businessDate === 'string' ? issue.businessDate : issue.businessDate.toISOString().slice(0, 10);
  await notifyStaff(actor.propertyId, ['Manager'], {
    title: 'Cash count problem',
    body: `${staff?.fullName || 'A staff member'}'s cash for ${day} could not be counted${issue.reason ? `: ${issue.reason}` : '.'}`,
    url: '/dashboard', tag: `cash-${issue.staffUserId}-${day}`,
  }, { excludeUserId: actor.userId, ...(issue.issueId ? { onceKey: `cash-issue:${issue.issueId}` } : {}) });
}

let checkingOverstays = false;
/**
 * Every few minutes: checked-in guests past checkout time. Reception is told once when a stay
 * becomes overdue; managers once more when it is escalated (long overdue), like the dashboard.
 */
export async function notifyOverstays(now = new Date()) {
  if (!pushConfigured() || checkingOverstays) return;
  checkingOverstays = true;
  try {
    // Only hotels where someone can receive notifications.
    const properties = await prisma.property.findMany({
      where: { isActive: true, status: 'Active', OR: [{ users: { some: { pushSubscriptions: { some: {} } } } }, { memberships: { some: { isActive: true, user: { pushSubscriptions: { some: {} } } } } }] },
      select: { propertyId: true, timezone: true, checkOutTime: true },
    });
    for (const property of properties) {
      const timeZone = property.timezone || 'Africa/Accra';
      const horizon = new Date(new Date(`${hotelDate(now, timeZone)}T00:00:00Z`).getTime() + DAY);
      const stays = await prisma.reservationRoom.findMany({
        where: { status: 'CheckedIn', checkOutDate: { lt: horizon }, reservation: { propertyId: property.propertyId, status: { in: ['Confirmed', 'InHouse'] } } },
        select: { reservationRoomId: true, checkOutDate: true, occupantName: true, roomNumberSnapshot: true, room: { select: { roomNumber: true } }, reservation: { select: { reservationId: true, guestNameSnapshot: true } } },
      });
      for (const stay of stays) {
        const dueAt = checkoutDueAt(stay.checkOutDate, property.checkOutTime, timeZone);
        if (checkoutState(dueAt, now, timeZone) !== 'overdue') continue;
        const late = minutesLate(dueAt, now);
        const room = stay.room?.roomNumber || stay.roomNumberSnapshot || '';
        const guest = stay.occupantName || stay.reservation.guestNameSnapshot || 'The guest';
        const base = `stay:${stay.reservationRoomId}:${stay.checkOutDate.toISOString().slice(0, 10)}`;
        const payload = { url: `/bookings/${stay.reservation.reservationId}`, tag: `overstay-${stay.reservationRoomId}` };
        await notifyStaff(property.propertyId, ['Receptionist'], { title: 'Guest past checkout', body: `${guest}${room ? ` in room ${room}` : ''} has not checked out yet.`, ...payload }, { onceKey: `overstay:${base}` });
        if (late >= MANAGER_ESCALATION_MINUTES) {
          await notifyStaff(property.propertyId, ['Manager'], { title: 'Overstay needs attention', body: `${guest}${room ? ` in room ${room}` : ''} is ${Math.floor(late / 60)}h past checkout and still not checked out.`, ...payload }, { onceKey: `overstay-escalated:${base}` });
        }
      }
    }
  } catch (error) {
    console.warn('Could not check overstays for notifications', error instanceof Error ? error.message : error);
  } finally {
    checkingOverstays = false;
  }
}

/** Managers: plan expires in 3 days, or has just expired. Same timing as the reminder email, sent once each. */
export async function notifySubscriptionEnding(propertyId: number, propertyName: string, endsAt: Date, expired: boolean) {
  const date = new Intl.DateTimeFormat('en-GH', { timeZone: 'Africa/Accra', dateStyle: 'long' }).format(endsAt);
  await notifyStaff(propertyId, ['Manager'], expired
    ? { title: 'Plan expired', body: `The HideOut24 plan for ${propertyName} expired on ${date}. Online bookings are paused until you renew.`, url: '/billing', tag: 'subscription' }
    : { title: 'Plan expires soon', body: `The HideOut24 plan for ${propertyName} expires on ${date}. Renew to keep online bookings open.`, url: '/billing', tag: 'subscription' },
  { onceKey: `subscription:${propertyId}:${endsAt.getTime()}:${expired ? 'expired' : 'soon'}` });
}
