import { atProperty } from '../../shared/utils/property-access';
import { prisma } from '../../shared/utils/prisma';
import { recordSimulatedSms } from '../notifications/simulated-sms.service';
import { notifyRoomsNeedCleaning } from '../notifications/housekeeping-alerts';
import { canCorrect } from './correction-policy';
import { occupantDetails, confirmOccupant } from './occupant.service';
import { netPaid } from './refund.service';
import { FINANCIAL_ACTIONS, financialDecision } from './financial-delegation';
import { checkoutDueAt, minutesLate } from './stay-timing';
import { hotelDate } from '../reports/daily-overview.service';
import { cancellationRefund, hotelIsNonRefundable, paidAtHotel } from './refund-policy';

export type Actor = { userId: number; propertyId: number };
export const correctionVersion = (res: any): string => [res.updatedAt.toISOString(), ...[...res.reservationRooms].sort((a, b) => a.reservationRoomId - b.reservationRoomId).map((room: any) => `${room.reservationRoomId}:${room.updatedAt.toISOString()}`)].join('|');
const money = (value: unknown) => Math.round(Number(value || 0) * 100) / 100;
const snapshot = (value: unknown) => JSON.parse(JSON.stringify(value));
const reasonText = (value: unknown) => {
  if (typeof value !== 'string' || value.trim().length < 5 || value.trim().length > 500) {
    throw new Error('Enter a correction reason between 5 and 500 characters.');
  }
  return value.trim();
};

// Retry serialization conflicts; never partially commit a correction.
async function atomic<T>(work: (tx: any) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      let released: number[] = [];
      const result = await prisma.$transaction(async tx => {
        const value = await work(tx);
        released = releasedRooms.get(tx) || [];
        return value;
      }, { isolationLevel: 'Serializable', timeout: 15000 });
      // Only after the change is saved: tell housekeepers which rooms now need cleaning.
      if (released.length) void notifyRoomsNeedCleaning([...new Set(released)]);
      return result;
    }
    catch (error: any) { if ((error.code !== 'P2034' && error.meta?.code !== '40001') || attempt >= 2) throw error; }
  }
}
// Rooms set to "needs cleaning" inside a transaction, announced once it commits.
const releasedRooms = new WeakMap<object, number[]>();
async function booking(tx: any, id: string, actor: Actor) {
  const rows = await tx.$queryRaw`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${id} AND "propertyId" = ${actor.propertyId} FOR UPDATE`;
  if (!rows.length) throw new Error('Reservation not found for this hotel.');
  const user = await tx.user.findFirst({ where: { userId: actor.userId, ...atProperty(actor.propertyId), isActive: true }, include: { role: true } });
  if (!user) throw new Error('An active hotel staff account is required.');
  const res = await tx.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { reservationRooms: true, payments: true } });
  return { res, user };
}
// actor null = done automatically by the system (e.g. reservation expiry).
async function audit(tx: any, actor: Actor | null, id: string, action: string, reason: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { propertyId: actor?.propertyId ?? null, userId: actor?.userId ?? null, entityType: 'Reservation', action,
    oldData: snapshot({ reservationId: id, value: before }),
    newData: snapshot({ reservationId: id, reason, value: after }),
  } });
}
async function lockRooms(tx: any, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await tx.$queryRaw`SELECT "roomId" FROM rooms WHERE "roomId" = ${id} FOR UPDATE`;
  }
}
const shortDate = (value: Date) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
// Throws a clear, actionable message naming the stay that blocks the room. The blocking stay is in the
// same room, so always the same hotel.
async function noConflict(tx: any, roomId: number, stayId: number, from: Date, to: Date, occupying = false) {
  const clash = await tx.reservationRoom.findFirst({ where: {
    roomId, reservationRoomId: { not: stayId }, status: { in: ['Reserved', 'CheckedIn'] },
    reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } },
    OR: [{ checkInDate: { lt: to }, checkOutDate: { gt: from } }, ...(occupying ? [{ status: 'CheckedIn' }] : [])],
  }, orderBy: [{ status: 'asc' }, { checkInDate: 'asc' }], include: { room: { select: { roomNumber: true } }, reservation: { select: { confirmationCode: true, guestNameSnapshot: true } } } });
  if (!clash) return;
  const room = `Room ${clash.room?.roomNumber || clash.roomNumberSnapshot || ''}`.trim();
  const who = `${clash.occupantName || clash.reservation?.guestNameSnapshot || 'another guest'} (${clash.reservation?.confirmationCode || 'another booking'})`;
  const dates = `${shortDate(clash.checkInDate)} – ${shortDate(clash.checkOutDate)}`;
  const details = { roomNumber: clash.room?.roomNumber || clash.roomNumberSnapshot, confirmationCode: clash.reservation?.confirmationCode, status: clash.status, checkInDate: clash.checkInDate, checkOutDate: clash.checkOutDate };
  const message = clash.status === 'CheckedIn'
    ? `${room} is still occupied by ${who}, booked ${dates}. Check that guest out (or verify their departure) first, or move this guest to another room.`
    : `${room} is already reserved for ${who}, ${dates}. Move one of the two bookings to another room, or correct its dates, first.`;
  throw Object.assign(new Error(message), { statusCode: 409, code: 'ROOM_CONFLICT', details });
}
export const EXPIRED_MESSAGE = 'Sorry, this reservation has expired. Please create a new booking.';
const expiredError = () => Object.assign(new Error(EXPIRED_MESSAGE), { statusCode: 409, code: 'RESERVATION_EXPIRED' });
// Check-in is allowed from the arrival day (hotel calendar), at any hour, until the departure date: a late
// arrival can still check in for the nights left. From the departure date the reservation has expired.
async function arrivalDue(tx: any, propertyId: number, stay: any) {
  const today = await hotelToday(tx, propertyId);
  if (dateOnly(stay.checkOutDate) <= today) throw expiredError();
  if (dateOnly(stay.checkInDate) > today) throw Object.assign(new Error(`Room ${stay.room?.roomNumber || stay.roomNumberSnapshot || ''} arrives on ${shortDate(stay.checkInDate)}; it cannot be checked in before its arrival date. If the guest is here early, change the booking's arrival date first.`), { statusCode: 409, code: 'ARRIVAL_NOT_DUE' });
}
const dateOnly = (value: Date) => new Date(value).toISOString().slice(0, 10);
// Restoring a whole cancelled booking: on or after the departure date
// (hotel calendar) no night is left, so a new reservation is needed. Otherwise only the nights still ahead
// need the room; nights already passed cannot be used anyway. Returns the first night to check.
function restoreFrom(stay: any, today: string, label: string) {
  if (dateOnly(stay.checkOutDate) <= today) throw new Error(`${label}: the booked dates have ended (departure was ${dateOnly(stay.checkOutDate)}). Create a new reservation for this guest instead.`);
  return new Date(Math.max(new Date(stay.checkInDate).getTime(), new Date(`${today}T00:00:00.000Z`).getTime()));
}
async function hotelToday(tx: any, propertyId: number) {
  const timeZone = (await tx.property.findUnique({ where: { propertyId }, select: { timezone: true } }))?.timezone || 'Africa/Accra';
  return hotelDate(new Date(), timeZone);
}
async function availableInventory(tx: any, roomId: number | null, propertyId: number, clean = false) {
  if (roomId === null) throw new Error('This stay has no active room. It cannot be restored or moved.');
  const room = await tx.room.findFirst({ where: { roomId, propertyId }, include: { roomType: true } });
  if (!room || !room.roomType.isActive || room.operationalStatus === 'Maintenance') throw new Error('The room is missing, inactive, or under maintenance.');
  if (clean && !['Clean', 'Inspected'].includes(room.housekeepingStatus)) throw new Error('The room must be clean before moving or checking a guest in.');
  return room;
}
// Re-price a booking when selected stays get a new departure date. Keeps the original effective
// tax/adjustment multiplier instead of using the hotel's current tax. Shared by date corrections
// and recorded departures so both use the same maths.
// penaltyPercent: share of the removed (unused) nights' charges the hotel keeps. 0 removes them in full.
// Kept penalties are stored per room (earlyDeparturePenalty) and counted as charges, so a later
// repricing keeps them as they are instead of treating them as part of the tax multiplier.
export function repriceDeparture(res: any, selected: any[], date: Date, penaltyPercent = 0) {
  const nights = (r: any) => Math.ceil((r.checkOutDate.getTime() - r.checkInDate.getTime()) / 86400000);
  const charge = (r: any) => Number(r.agreedPricePerNight) * nights(r) + Number(r.earlyDeparturePenalty || 0);
  const base = (rooms: any[]) => rooms.filter(r => r.status !== 'Cancelled').reduce((sum, r) => sum + charge(r), 0);
  const oldBase = base(res.reservationRooms);
  if (oldBase <= 0) throw new Error('This booking needs financial reconciliation before repricing.');
  const pct = Math.min(100, Math.max(0, Number(penaltyPercent) || 0)) / 100;
  let kept = 0;
  const revised = res.reservationRooms.map((r: any) => {
    if (!selected.some(stay => stay.reservationRoomId === r.reservationRoomId)) return r;
    const removedNights = r.status !== 'Cancelled' && date < r.checkOutDate ? nights(r) - nights({ ...r, checkOutDate: date }) : 0;
    const roomKept = Math.round(Number(r.agreedPricePerNight) * removedNights * pct * 100) / 100;
    kept += roomKept;
    return { ...r, checkOutDate: date, earlyDeparturePenalty: Math.round((Number(r.earlyDeparturePenalty || 0) + roomKept) * 100) / 100 };
  });
  const scale = Number(res.totalAmount) / oldBase;
  const totalAmount = money(base(revised) * scale);
  const credit = Math.max(0, money(Number(res.amountPaid) - totalAmount));
  return { revised, totalAmount, credit, penaltyKept: money(kept * scale) };
}

async function derive(tx: any, id: string) {
  const rooms = await tx.reservationRoom.findMany({ where: { reservationId: id } });
  // Expired rooms (stored as 'NoShow': the guest never arrived before the departure date) do not keep the
  // booking open. The booking is only expired ('NoShow') when every remaining room expired (nobody stayed);
  // a booking where some guests stayed completes normally.
  const active = rooms.filter((r: any) => r.status !== 'Cancelled' && r.status !== 'NoShow');
  const status = active.some((r: any) => r.status === 'CheckedIn') ? 'InHouse'
    : active.length && active.every((r: any) => r.status === 'CheckedOut') ? 'Completed'
    : !active.length && rooms.some((r: any) => r.status === 'NoShow') ? 'NoShow' : 'Confirmed';
  await tx.reservation.update({ where: { reservationId: id }, data: { status } });
}
async function releaseOccupiedRoom(tx: any, stay: any) {
  if (stay.roomId === null || stay.status !== 'CheckedIn') return;
  const other = await tx.reservationRoom.findFirst({ where: { roomId: stay.roomId, reservationRoomId: { not: stay.reservationRoomId }, status: 'CheckedIn' } });
  if (!other) {
    await tx.room.update({ where: { roomId: stay.roomId }, data: { operationalStatus: 'Available', housekeepingStatus: 'Dirty', cleaningStartedById: null, cleaningStartedAt: null } });
    releasedRooms.set(tx, [...(releasedRooms.get(tx) || []), stay.roomId]);
  }
}
function balanceApproval(res: any, user: any, overrideReason?: unknown) {
  if (res.totalAmount === null || !Number.isFinite(Number(res.totalAmount)) || Number(res.totalAmount) < 0) throw new Error('The reservation total must be reconciled before checkout.');
  if (money(res.totalAmount) - money(res.amountPaid) <= 0.01) return '';
  const owing = money(money(res.totalAmount) - money(res.amountPaid));
  if (!overrideReason) throw Object.assign(new Error(`Outstanding balance: GHS ${owing.toFixed(2)}. Record the payment, or check out with the balance owing and give a reason.`), {
    statusCode: 409, code: 'BALANCE_OWING', details: { balanceDue: owing },
  });
  // Front desk staff may check out with a balance owing; the debt stays on the booking and is audited.
  if (!['Manager', 'Receptionist'].includes(user.role.roleName)) throw new Error('Front desk staff required.');
  const decision = financialDecision(user, 'credit-checkout', { balance: money(money(res.totalAmount) - money(res.amountPaid)) });
  if (!decision.canApply) throw new Error(decision.delegationReason);
  return reasonText(overrideReason);
}

export async function cancelSafely(id: string, actor: Actor, reason = 'Staff cancelled the reservation') {
  let wasConfirmed = false;
  const cancelled = await atomic(async tx => {
    const { res } = await booking(tx, id, actor);
    const inRoom = res.reservationRooms.filter((r: any) => r.status === 'CheckedIn');
    if (inRoom.length) {
      const rooms = inRoom.map((r: any) => r.roomNumberSnapshot).filter(Boolean).join(', ');
      throw new Error(`This booking can't be cancelled because the guest is already checked in${rooms ? ` to Room ${rooms}` : ''}. If the guest is leaving, use Check out. To charge fewer nights, use Shorten stay first.`);
    }
    if (!['Pending', 'Confirmed'].includes(res.status)) {
      const why: Record<string, string> = { Completed: 'the guest has already checked out', Cancelled: 'it is already cancelled', NoShow: 'it has expired (the guest never arrived)', Expired: 'it expired without payment' };
      throw new Error(`This booking can't be cancelled because ${why[res.status] || `its status is ${res.status}`}.`);
    }
    wasConfirmed = res.status === 'Confirmed';
    await lockRooms(tx, res.reservationRooms.map((r: any) => r.roomId).filter((id: any) => id !== null));
    await tx.reservationRoom.updateMany({ where: { reservationId: id }, data: { status: 'Cancelled' } });
    const { refundDue, refundStatus, refundPolicy } = cancellationRefund(paidAtHotel(res), await hotelIsNonRefundable(tx, actor.propertyId));
    const updated = await tx.reservation.update({ where: { reservationId: id }, data: {
      status: 'Cancelled', cancellationDate: new Date(), refundDue, refundStatus,
    } });
    // Cancelling an allocation never changes a physical room occupied by another stay.
    await audit(tx, actor, id, 'ReservationCancelled', reason, res, { ...updated, refundPolicy });
    return updated;
  });
  if (wasConfirmed) await recordSimulatedSms(id, 'cancelled');
  return cancelled;
}

export async function transitionStay(stayId: number, status: string, actor: Actor, details: any = {}) {
  const initial = await prisma.reservationRoom.findUnique({ where: { reservationRoomId: stayId }, select: { reservationId: true } });
  if (!initial) throw new Error('Reservation room not found.');
  return atomic(async tx => {
    const { res, user } = await booking(tx, initial.reservationId, actor);
    const stay = res.reservationRooms.find((r: any) => r.reservationRoomId === stayId);
    if (status === 'CheckedIn' && (res.status === 'NoShow' || stay?.status === 'NoShow')) throw expiredError();
    if (!['Confirmed', 'InHouse'].includes(res.status)) throw new Error('This reservation is not active. Use the manager restore workflow.');
    if (!stay || stay.roomId === null) throw new Error('Room inventory is missing.');
    await lockRooms(tx, [stay.roomId]);
    let data: any;
    let occupantConfirmation: any = {};
    let reason = 'Normal room lifecycle transition';
    let creditReason = '';
    if (status === 'CheckedIn' && stay.status === 'Reserved') {
      await arrivalDue(tx, actor.propertyId, stay);
      const occupant = occupantDetails(details.occupantName, details.occupantPhone);
      occupantConfirmation = await confirmOccupant(tx, actor.propertyId, stay, occupant, details.duplicateOccupantConfirmation, true);
      const room = await availableInventory(tx, stay.roomId, actor.propertyId);
      if (!['Clean', 'Inspected'].includes(room.housekeepingStatus)) {
        if (details.uncleanRoomConfirmed !== true) {
          throw Object.assign(new Error(`Room ${room.roomNumber} ${room.housekeepingStatus === 'Dirty' ? 'needs cleaning' : 'is not ready yet'}. Confirm to check the guest in anyway.`), {
            statusCode: 409, code: 'ROOM_NOT_CLEAN', details: { roomNumber: room.roomNumber, housekeepingStatus: room.housekeepingStatus },
          });
        }
        occupantConfirmation = { ...occupantConfirmation, uncleanRoomConfirmed: room.housekeepingStatus };
        await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Room', action: 'HousekeepingStatusChanged',
          oldData: { roomId: stay.roomId, status: room.housekeepingStatus },
          newData: { roomId: stay.roomId, propertyId: actor.propertyId, status: 'Clean', reason: 'Staff confirmed the room was ready during check-in', reservationId: res.reservationId },
        } });
      }
      await noConflict(tx, stay.roomId, stayId, stay.checkInDate, stay.checkOutDate, true);
      data = { status, actualCheckIn: new Date(), actualCheckOut: null, ...occupant,
        guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null };
      await tx.room.update({ where: { roomId: stay.roomId }, data: { operationalStatus: 'Occupied', ...(!['Clean', 'Inspected'].includes(room.housekeepingStatus) ? { housekeepingStatus: 'Clean' } : {}) } });
    } else if (status === 'CheckedOut' && stay.status === 'CheckedIn') {
      // The balance belongs to the whole booking. While other rooms of the booking are still checked in,
      // one room may leave without the money-owed reason; the last occupied room applies the usual rule.
      const othersInRoom = res.reservationRooms.some((r: any) => r.reservationRoomId !== stayId && r.status === 'CheckedIn');
      creditReason = othersInRoom ? '' : balanceApproval(res, user, details.overrideReason);
      reason = creditReason || (othersInRoom ? 'Room checked out; other rooms of the booking remain checked in' : reason);
      const departureNote = typeof details.departureNote === 'string' ? details.departureNote.trim().slice(0, 300) : '';
      await releaseOccupiedRoom(tx, stay);
      data = { status, actualCheckOut: new Date(), guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null };
      // Late departure is recorded for the audit only; it never adds a night or a fee.
      const hotel = await tx.property.findUnique({ where: { propertyId: actor.propertyId }, select: { timezone: true, checkOutTime: true } });
      const dueAt = checkoutDueAt(stay.checkOutDate, hotel?.checkOutTime, hotel?.timezone || 'Africa/Accra');
      const bookingBalance = Math.max(0, money(money(res.totalAmount) - money(res.amountPaid)));
      occupantConfirmation = { lateMinutes: minutesLate(dueAt, data.actualCheckOut), expectedCheckoutAt: dueAt.toISOString(), ...(departureNote ? { departureNote } : {}),
        ...(othersInRoom ? { partialCheckout: true, bookingBalance } : {}) };
    } else throw new Error('Invalid room transition. Use the dedicated manager correction actions.');
    const updated = await tx.reservationRoom.update({ where: { reservationRoomId: stayId }, data });
    await derive(tx, res.reservationId);
    await audit(tx, actor, res.reservationId, status === 'CheckedOut' && creditReason ? 'CreditCheckoutApproved' : status, reason, stay, { ...updated, ...occupantConfirmation });
    return updated;
  });
}

export async function checkoutBooking(id: string, actor: Actor, overrideReason?: unknown) {
  return atomic(async tx => {
    const { res, user } = await booking(tx, id, actor);
    if (res.status !== 'InHouse') throw new Error('Reservation must be in-house to check out.');
    const reason = balanceApproval(res, user, overrideReason);
    await lockRooms(tx, res.reservationRooms.map((r: any) => r.roomId).filter((id: any) => id !== null));
    for (const stay of res.reservationRooms) {
      if (stay.status === 'CheckedIn') {
        await releaseOccupiedRoom(tx, stay);
        await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { status: 'CheckedOut', actualCheckOut: new Date() } });
      }
    }
    await derive(tx, id);
    await audit(tx, actor, id, reason ? 'CreditCheckoutApproved' : 'ReservationCheckout', reason || 'Normal checkout', res, { status: 'CheckedOut' });
    return tx.reservation.findUnique({ where: { reservationId: id } });
  });
}

export async function checkinBooking(id: string, actor: Actor) {
  return atomic(async tx => {
    const { res } = await booking(tx, id, actor);
    if (res.status === 'NoShow') throw expiredError();
    if (res.status !== 'Confirmed' || !res.reservationRooms.length) throw new Error('Reservation must be confirmed and have assigned rooms.');
    await lockRooms(tx, res.reservationRooms.map((r: any) => r.roomId).filter((id: any) => id !== null));
    for (const stay of res.reservationRooms) {
      if (stay.status !== 'Reserved') throw new Error('Use individual room actions for a partially processed stay.');
      await arrivalDue(tx, actor.propertyId, stay);
      if (!stay.occupantName?.trim()) throw new Error('Confirm the actual occupant for each room. Open the room assignments and check in each room separately.');
      const occupant = occupantDetails(stay.occupantName, stay.occupantPhone);
      await confirmOccupant(tx, actor.propertyId, stay, occupant, undefined, true);
      await availableInventory(tx, stay.roomId, actor.propertyId);
      await noConflict(tx, stay.roomId, stay.reservationRoomId, stay.checkInDate, stay.checkOutDate, true);
      await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { status: 'CheckedIn', actualCheckIn: new Date(), actualCheckOut: null, ...occupant } });
      await tx.room.update({ where: { roomId: stay.roomId }, data: { operationalStatus: 'Occupied' } });
    }
    await derive(tx, id);
    await audit(tx, actor, id, 'ReservationCheckin', 'Staff checked in the reservation', res, { status: 'InHouse' });
    return tx.reservation.findUnique({ where: { reservationId: id } });
  });
}

export async function updateOccupantDetails(stayId: number, actor: Actor, input: any) {
  const initial = await prisma.reservationRoom.findUnique({ where: { reservationRoomId: stayId }, select: { reservationId: true } });
  if (!initial) throw new Error('Reservation room not found.');
  return atomic(async tx => {
    const { res } = await booking(tx, initial.reservationId, actor);
    const stay = res.reservationRooms.find((room: any) => room.reservationRoomId === stayId);
    if (!stay || !['Reserved', 'CheckedIn'].includes(stay.status) || !['Pending', 'Confirmed', 'InHouse'].includes(res.status)) throw new Error('Only active reserved or checked-in room occupants can be edited.');
    const occupant = occupantDetails(input.occupantName, input.occupantPhone === undefined ? stay.occupantPhone : input.occupantPhone);
    const confirmation = await confirmOccupant(tx, actor.propertyId, stay, occupant, input.duplicateOccupantConfirmation);
    const updated = await tx.reservationRoom.update({ where: { reservationRoomId: stayId }, data: occupant });
    await audit(tx, actor, res.reservationId, 'RoomOccupantUpdated', 'Staff corrected the room occupant details', stay, { ...updated, ...confirmation });
    return updated;
  });
}

export async function correctBooking(id: string, actor: Actor, input: any) {
  return atomic(tx => correctBookingInTransaction(tx, id, actor, input));
}

// Shared by direct corrections and approvals so request completion and correction commit together.
export async function correctBookingInTransaction(tx: any, id: string, actor: Actor, input: any, requestPreview = false) {
  const reason = reasonText(input.reason);
    const { res, user } = await booking(tx, id, actor);
    if (['NoShow', 'Expired'].includes(res.status)) throw expiredError();
    if (!canCorrect(user, input.action) && !(requestPreview && input.preview === true && user.role.roleName === 'Receptionist')) throw new Error('Manager approval is required for this correction.');
    const multi = ['undo-checkin', 'undo-checkout', 'correct-date', 'credit-checkout'].includes(input.action);
    let selected: any[] = [];
    if (multi || input.action === 'transfer') {
      const ids = input.stayIds !== undefined ? input.stayIds : [Number(input.stayId)];
      if (!Array.isArray(ids) || !ids.length || ids.length > res.reservationRooms.length || ids.some((value: any) => !Number.isSafeInteger(value) || value < 1) || new Set(ids).size !== ids.length || (!multi && ids.length !== 1)) throw new Error('Select valid room stays for this action. Transfers require one room at a time.');
      selected = ids.map((value: number) => res.reservationRooms.find((room: any) => room.reservationRoomId === value));
      if (selected.some(room => !room)) throw new Error('Every selected room must belong to this reservation.');
      selected.sort((a, b) => a.reservationRoomId - b.reservationRoomId);
    }
    const stay = selected[0];
    const preview = input.preview === true;
    const version = correctionVersion(res);
    if (!preview && input.expectedVersion !== version) throw new Error('The reservation changed after the preview. Preview the correction again before confirming.');
    const roomLabels = await Promise.all(selected.map(async room => `Room ${room.roomNumberSnapshot || (await tx.room.findUnique({ where: { roomId: room.roomId || 0 } }))?.roomNumber || 'removed'}`));
    const result: any = { action: input.action, reservationId: id, reason, version, roomLabels, roomLabel: roomLabels.join(', '), stayIds: selected.map(room => room.reservationRoomId) };
    const checkDelegation = async (context: any) => {
      if (input.action !== 'correct-payment' && !FINANCIAL_ACTIONS.includes(input.action)) return;
      const hotel = input.action === 'correct-payment' ? await tx.property.findUnique({ where: { propertyId: actor.propertyId }, select: { timezone: true } }) : null;
      Object.assign(result, financialDecision(user, input.action, { ...context, timezone: hotel?.timezone }));
      if (!preview && !result.canApply) throw new Error(result.delegationReason);
    };
    if (input.action === 'restore') {
      if (res.status !== 'Cancelled') throw new Error('Only cancelled reservations can be restored.');
      if (res.payments.some((p: any) => p.status === 'Refunded') || res.refundStatus === 'Processed' || await tx.refund.count({ where: { reservationId: id } })) throw new Error('Payments have already been refunded. Create a new booking instead.');
      const recordedPaid = res.payments.filter((p: any) => p.status === 'Completed').reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      if (Math.abs(recordedPaid - Number(res.amountPaid)) > 0.01) throw new Error('Payment history and balance differ. Reconcile before restoring.');
      if (!res.reservationRooms.length) throw new Error('This reservation has no room allocations.');
      await lockRooms(tx, res.reservationRooms.map((r: any) => r.roomId).filter((id: any) => id !== null));
      const today = await hotelToday(tx, actor.propertyId);
      for (const room of res.reservationRooms) {
        const from = restoreFrom(room, today, `Room ${room.roomNumberSnapshot || '—'}`);
        await availableInventory(tx, room.roomId, actor.propertyId);
        await noConflict(tx, room.roomId, room.reservationRoomId, from, room.checkOutDate);
        if (room.actualCheckIn) throw new Error('This reservation contains a previous stay. It needs a new booking instead of restoration.');
      }
      result.message = 'Restore reservation and all room allocations; retain existing payments and clear the unprocessed cancellation refund.';
      if (preview) return result;
      await tx.reservationRoom.updateMany({ where: { reservationId: id }, data: { status: 'Reserved' } });
      await tx.reservation.update({ where: { reservationId: id }, data: { status: 'Confirmed', cancellationDate: null, refundDue: 0, refundStatus: 'None' } });
    } else if (input.action === 'undo-checkin') {
      await lockRooms(tx, selected.map(room => room.roomId).filter(roomId => roomId !== null));
      for (const stay of selected) {
      if (!stay || stay.status !== 'CheckedIn' || res.status !== 'InHouse' || !stay.actualCheckIn) throw new Error('Select a checked-in room from an in-house reservation.');
      if (stay.actualCheckOut) throw new Error('This stay already has a checkout record. Review its history first.');
      if (stay.roomId === null) throw new Error('Room inventory is missing.');
      await lockRooms(tx, [stay.roomId]);
      const room = await tx.room.findFirst({ where: { roomId: stay.roomId, propertyId: actor.propertyId } });
      if (!room || room.operationalStatus !== 'Occupied') throw new Error('Room occupancy has changed. Reconcile the room before undoing check-in.');
      await noConflict(tx, stay.roomId, stay.reservationRoomId, stay.checkInDate, stay.checkOutDate, true);
      }
      result.message = `Return ${selected.length} selected room stay(s) to reserved and clear their mistaken arrival records. Rooms become available and marked as needing cleaning until housekeeping checks them. Booking dates, charges and payments remain unchanged.`;
      if (preview) return result;
      for (const stay of selected) {
      await releaseOccupiedRoom(tx, stay);
      await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { status: 'Reserved', actualCheckIn: null, actualCheckOut: null, occupantName: null, occupantPhone: null, guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null } });
      }
      await derive(tx, id);
    } else if (input.action === 'undo-checkout') {
      await lockRooms(tx, selected.map(room => room.roomId).filter(roomId => roomId !== null));
      for (const stay of selected) {
      if (!stay || stay.status !== 'CheckedOut' || !stay.actualCheckIn || !['Completed', 'InHouse', 'Confirmed'].includes(res.status)) throw new Error('Select a checked-out room from an active or completed stay.');
      await lockRooms(tx, [stay.roomId].filter((id: any) => id !== null));
      await availableInventory(tx, stay.roomId, actor.propertyId);
      // Refuse stale reinstatement after the room has been used by a later guest.
      const reused = await tx.reservationRoom.findFirst({ where: { roomId: stay.roomId, reservationRoomId: { not: stay.reservationRoomId }, actualCheckIn: { gte: stay.actualCheckOut || stay.updatedAt } } });
      if (reused) throw new Error('The room has been used by another guest since checkout. It cannot be reinstated.');
      await noConflict(tx, stay.roomId, stay.reservationRoomId, stay.checkInDate, new Date(Math.max(stay.checkOutDate.getTime(), Date.now() + 1)), true);
      }
      result.message = `Restore ${selected.length} selected room stay(s) to in-house, clear their mistaken checkout timestamps, and restore room occupancy.`;
      if (preview) return result;
      for (const stay of selected) {
      await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { status: 'CheckedIn', actualCheckOut: null, guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null } });
      await tx.room.update({ where: { roomId: stay.roomId }, data: { operationalStatus: 'Occupied', housekeepingStatus: 'Clean' } });
      }
      await derive(tx, id);
    } else if (input.action === 'correct-date') {
      if (selected.some(stay => !['Reserved', 'CheckedIn'].includes(stay.status)) || !['Confirmed', 'InHouse'].includes(res.status)) throw new Error('Only active reserved or checked-in stays can have their departure date corrected.');
      const date = new Date(`${input.newCheckOutDate}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newCheckOutDate || '') || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.newCheckOutDate || selected.some(stay => date <= stay.checkInDate)) throw new Error('Choose a valid departure date after every selected room arrival.');
      let penaltyPercent = 0;
      if (selected.some(stay => date < stay.checkOutDate)) {
        const policy = await tx.property.findUnique({ where: { propertyId: actor.propertyId }, select: { allowEarlyDepartureChargeReduction: true, earlyDepartureChargeReductionPenaltyPercent: true } });
        if (policy?.allowEarlyDepartureChargeReduction === false) throw new Error("Your hotel's early-departure policy keeps the original booking charges. The guest can check out early without shortening the charged stay.");
        penaltyPercent = Number(policy?.earlyDepartureChargeReductionPenaltyPercent ?? 0);
      }
      // Consumed nights can't be removed: a checked-in guest has used every night before today
      // (hotel calendar), so the earliest departure is today — and never before the first night.
      const hotelTz = (await tx.property.findUnique({ where: { propertyId: actor.propertyId }, select: { timezone: true } }))?.timezone || 'Africa/Accra';
      const today = new Date(`${hotelDate(new Date(), hotelTz)}T00:00:00.000Z`);
      for (const stay of selected) {
        const earliest = new Date(Math.max(today.getTime(), stay.checkInDate.getTime() + 86400000));
        if (date >= earliest) continue;
        const used = Math.max(0, Math.round((earliest.getTime() - stay.checkInDate.getTime()) / 86400000));
        const label = `Room ${stay.roomNumberSnapshot || ''}`.trim();
        throw new Error(stay.status === 'CheckedIn'
          ? `${label}: ${used} night${used === 1 ? ' has' : 's have'} already been used. The earliest departure is ${earliest.toISOString().slice(0, 10)}.`
          : `${label}: departure cannot be moved to a past day. The earliest departure is ${earliest.toISOString().slice(0, 10)}.`);
      }
      await lockRooms(tx, selected.map(room => room.roomId).filter(roomId => roomId !== null));
      for (const stay of selected) {
      await availableInventory(tx, stay.roomId, actor.propertyId);
      await noConflict(tx, stay.roomId, stay.reservationRoomId, stay.checkInDate, date);
      }
      const { revised, totalAmount, credit, penaltyKept } = repriceDeparture(res, selected, date, penaltyPercent);
      await checkDelegation({ oldTotal: money(res.totalAmount), newTotal: totalAmount, isExtension: selected.every(stay => date > stay.checkOutDate) });
      Object.assign(result, { oldTotal: money(res.totalAmount), newTotal: totalAmount, credit, ...(penaltyKept > 0 ? { penaltyPercent, penaltyKept } : {}), balanceDue: Math.max(0, money(totalAmount - Number(res.amountPaid))), message: 'Correct departure and reprice the booking. Any overpayment remains recorded as a credit requiring refund review; no money is automatically returned.' });
      if (preview) return result;
      for (const stay of selected) await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { checkOutDate: date, originalCheckOutDate: stay.originalCheckOutDate || stay.checkOutDate, earlyDeparturePenalty: revised.find((r: any) => r.reservationRoomId === stay.reservationRoomId).earlyDeparturePenalty } });
      const latest = new Date(Math.max(...revised.map((r: any) => r.checkOutDate.getTime())));
      await tx.reservation.update({ where: { reservationId: id }, data: { checkOutDate: latest, totalAmount, refundDue: credit, refundStatus: credit > 0 ? 'Pending' : 'None' } });
    } else if (input.action === 'transfer') {
      if (!stay || stay.status !== 'CheckedIn' || res.status !== 'InHouse') throw new Error('Only a checked-in guest can be transferred.');
      const targetId = Number(input.targetRoomId);
      if (!Number.isSafeInteger(targetId) || targetId < 1 || targetId === stay.roomId) throw new Error('Choose a different room.');
      await lockRooms(tx, [stay.roomId, targetId].filter((id: any) => id !== null));
      const target = await availableInventory(tx, targetId, actor.propertyId);
      if (target.operationalStatus !== 'Available') throw new Error('Target room is not available.');
      const targetNeedsCleaning = !['Clean', 'Inspected'].includes(target.housekeepingStatus);
      if (targetNeedsCleaning && input.uncleanRoomConfirmed !== true) {
        throw Object.assign(new Error(`Room ${target.roomNumber} needs cleaning. Confirm that you checked the room and it is ready before moving the guest.`), {
          statusCode: 409, code: 'ROOM_NOT_CLEAN', details: { roomNumber: target.roomNumber, housekeepingStatus: target.housekeepingStatus },
        });
      }
      if (res.reservationRooms.some((r: any) => r.roomId === targetId)) throw new Error('This room is already assigned to this reservation.');
      await noConflict(tx, targetId, stay.reservationRoomId, stay.checkInDate, stay.checkOutDate, true);
      result.message = `Move to Room ${target.roomNumber}. Keep the agreed nightly price. The original assignment is preserved in correction history; the old room is marked as needing cleaning.${targetNeedsCleaning ? ' Staff confirmation marks the new room clean.' : ''}`;
      result.targetRoomLabel = `Room ${target.roomNumber}`;
      result.targetMarkedClean = targetNeedsCleaning;
      if (preview) return result;
      await releaseOccupiedRoom(tx, stay);
      await tx.room.update({ where: { roomId: targetId }, data: { operationalStatus: 'Occupied', ...(targetNeedsCleaning ? { housekeepingStatus: 'Clean' } : {}) } });
      if (targetNeedsCleaning) await tx.auditLog.create({ data: { propertyId: actor.propertyId, userId: actor.userId, entityType: 'Room', action: 'HousekeepingStatusChanged',
        oldData: { roomId: targetId, status: target.housekeepingStatus },
        newData: { roomId: targetId, propertyId: actor.propertyId, status: 'Clean', reason: 'Staff confirmed the room was ready during guest transfer', reservationId: id },
      } });
      await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { roomId: targetId, roomTypeId: target.roomTypeId, roomNumberSnapshot: target.roomNumber, roomTypeNameSnapshot: target.roomType.typeName, ratePlanId: null } });
    } else if (input.action === 'credit-checkout') {
      if (selected.some(stay => stay.status !== 'CheckedIn' || stay.roomId === null) || res.status !== 'InHouse') throw new Error('Choose checked-in rooms.');
      if (res.totalAmount === null || !Number.isFinite(Number(res.totalAmount)) || Number(res.totalAmount) < 0) throw new Error('Reconcile the reservation total before credit checkout.');
      await checkDelegation({ balance: Math.max(0, money(Number(res.totalAmount) - Number(res.amountPaid))) });
      result.message = `Check out ${selected.length} selected room stay(s) with GHS ${Math.max(0, money(Number(res.totalAmount) - Number(res.amountPaid))).toFixed(2)} still outstanding across the booking. The debt remains on the reservation and this approval is audited.`;
      if (preview) return result;
      await lockRooms(tx, selected.map(room => room.roomId));
      for (const stay of selected) {
      await releaseOccupiedRoom(tx, stay);
      await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { status: 'CheckedOut', actualCheckOut: new Date(), guestPresenceStatus: 'InRoom', expectedReturnAt: null, guestOutAt: null } });
      }
      await derive(tx, id);
    } else if (input.action === 'correct-payment') {
      const payment = res.payments.find((p: any) => p.paymentId === Number(input.paymentId));
      const amount = Number(input.newAmount);
      if (!payment || payment.status !== 'Completed' || res.status === 'Cancelled' || res.refundStatus !== 'None') throw new Error('Choose a completed payment on a booking without a cancellation or pending refund.');
      // Payments confirmed by the provider are immutable for everyone, managers included.
      if (payment.verifiedProvider) throw new Error('Verified online payments cannot be edited. Use the provider refund and reconciliation process.');
      if (await tx.refund.count({ where: { paymentId: payment.paymentId } })) throw new Error('This payment has linked refund records and cannot be replaced or voided.');
      if (input.newAmount === '' || input.newAmount === null || !Number.isFinite(amount) || amount < 0 || amount > 99999999.99 || money(amount) !== amount) throw new Error('Enter a non-negative amount with at most two decimal places. Use zero to void the incorrect entry.');
      const paid = await netPaid(tx, id);
      if (Math.abs(paid - Number(res.amountPaid)) > 0.01) throw new Error('The payment ledger and booking balance differ. Reconcile before correcting.');
      const newPaid = money(paid - Number(payment.amount) + amount);
      await checkDelegation({ payment, newAmount: amount });
      if (newPaid > Number(res.totalAmount) + 0.01) throw new Error('The corrected payment exceeds the reservation total.');
      if (amount === Number(payment.amount)) throw new Error('The amount is unchanged.');
      Object.assign(result, { paymentId: payment.paymentId, paymentMethod: payment.paymentMethod, originalReceivedBy: payment.receivedBy, oldAmount: money(payment.amount), newAmount: amount, newPaid, message: 'Void the mistaken entry without deleting its original amount, and record a linked replacement. This corrects bookkeeping only; it does not move money.' });
      if (preview) return result;
      await tx.payment.update({ where: { paymentId: payment.paymentId }, data: { status: 'Voided' } });
      // The replacement stays with whoever took the money and on the day it was taken, so each person's
      // cash and that day's totals reflect the correction. Who made the correction is in the audit log.
      const replacement = amount > 0 ? await tx.payment.create({ data: { reservationId: id, propertyId: actor.propertyId, amount, paymentMethod: payment.paymentMethod, gatewayReference: payment.gatewayReference, paymentDate: payment.paymentDate, receivedBy: payment.receivedBy ?? actor.userId, status: 'Completed', notes: `Correction of payment #${payment.paymentId}: ${reason}` } }) : null;
      await tx.reservation.update({ where: { reservationId: id }, data: { amountPaid: newPaid } });
      result.replacementPaymentId = replacement?.paymentId || null;
    } else throw new Error('Unknown correction action.');
    const after = await tx.reservation.findUnique({ where: { reservationId: id }, include: { reservationRooms: true, payments: true } });
    await audit(tx, actor, id, `Correction:${input.action}`, reason, res, { result, reservation: after });
    return { ...result, applied: true };
}

export async function correctionHistory(id: string, actor: Actor) {
  const res = await prisma.reservation.findFirst({ where: { reservationId: id, propertyId: actor.propertyId }, select: { reservationId: true } });
  if (!res) throw new Error('Reservation not found for this hotel.');
  return prisma.auditLog.findMany({ where: { entityType: 'Reservation', newData: { path: ['reservationId'], equals: id } }, orderBy: { createdAt: 'desc' }, take: 100, include: { user: { select: { fullName: true } } } });
}

// Automatic reservation expiry. A room whose guest never checked in expires on its departure date (hotel
// calendar, server time): it is stored as 'NoShow' and shown to staff as "Expired". Rooms that were checked
// in, checked out or cancelled are untouched; payments, charges, refunds and balances are never changed.
// Runs on a background timer and lazily (per hotel) before the screens that list stays.
const lastSweep = new Map<number, number>();
export async function expireUnarrivedStays(propertyId?: number, { force = false } = {}) {
  if (propertyId !== undefined) {
    if (!force && Date.now() - (lastSweep.get(propertyId) || 0) < 60000) return 0;
    lastSweep.set(propertyId, Date.now());
  }
  // Latest possible "today" anywhere (UTC+14), then the exact hotel date per booking.
  const horizon = new Date(`${hotelDate(new Date(), 'Pacific/Kiritimati')}T00:00:00.000Z`);
  const due = await prisma.reservationRoom.findMany({
    where: { status: 'Reserved', checkOutDate: { lte: horizon }, reservation: { status: { in: ['Confirmed', 'InHouse'] }, ...(propertyId !== undefined ? { propertyId } : {}) } },
    select: { reservationId: true, checkOutDate: true, reservation: { select: { property: { select: { timezone: true } } } } },
  });
  const ids = [...new Set(due.filter(stay => dateOnly(stay.checkOutDate) <= hotelDate(new Date(), stay.reservation.property?.timezone || 'Africa/Accra')).map(stay => stay.reservationId))];
  let expired = 0;
  for (const id of ids) {
    try { expired += await expireBooking(id); }
    catch (error) { console.error(`Could not expire unarrived rooms of reservation ${id}; will retry.`, error); }
  }
  return expired;
}
async function expireBooking(id: string) {
  return atomic(async tx => {
    const rows = await tx.$queryRaw`SELECT "propertyId" FROM reservations WHERE "reservationId" = ${id} FOR UPDATE`;
    if (!rows.length) return 0;
    const res = await tx.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { reservationRooms: { include: { room: { select: { roomNumber: true } } } } } });
    if (!['Confirmed', 'InHouse'].includes(res.status)) return 0;
    const today = await hotelToday(tx, res.propertyId);
    const stays = res.reservationRooms.filter((stay: any) => stay.status === 'Reserved' && dateOnly(stay.checkOutDate) <= today);
    if (!stays.length) return 0;
    const ids = stays.map((stay: any) => stay.reservationRoomId);
    const labels = stays.map((stay: any) => `Room ${stay.room?.roomNumber || stay.roomNumberSnapshot || '—'}`);
    await tx.reservationRoom.updateMany({ where: { reservationId: id, reservationRoomId: { in: ids }, status: 'Reserved' }, data: { status: 'NoShow' } });
    await derive(tx, id);
    const after = await tx.reservation.findUniqueOrThrow({ where: { reservationId: id } });
    if (after.status === 'NoShow') await tx.reservation.update({ where: { reservationId: id }, data: { cancellationDate: new Date() } });
    const balanceDue = Math.max(0, money(money(res.totalAmount) - money(res.amountPaid)));
    await audit(tx, null, id, 'RoomExpired', 'Guest did not arrive before the departure date; reservation expired automatically',
      { status: res.status, rooms: stays.map((s: any) => ({ reservationRoomId: s.reservationRoomId, status: s.status })) },
      { status: after.status, rooms: labels, stayIds: ids, amountPaid: money(res.amountPaid), balanceDue });
    // Everyone else has left, so the booking is now checked out with money still owed: record it like a
    // checkout with a balance, so it appears under "Owed after checkout".
    if (after.status === 'Completed' && balanceDue > 0.009) {
      await audit(tx, null, id, 'CreditCheckoutApproved', 'Room expired (guest never arrived); balance remains owed', { status: res.status }, { status: after.status, via: 'expiry', rooms: labels, balanceDue });
    }
    return stays.length;
  });
}
