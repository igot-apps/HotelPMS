import { prisma } from '../../shared/utils/prisma';
import { recordSimulatedSms } from '../notifications/simulated-sms.service';
import { canCorrect } from './correction-policy';
import { occupantDetails, confirmOccupant } from './occupant.service';
import { netPaid } from './refund.service';
import { FINANCIAL_ACTIONS, financialDecision } from './financial-delegation';

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
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000 }); }
    catch (error: any) { if ((error.code !== 'P2034' && error.meta?.code !== '40001') || attempt >= 2) throw error; }
  }
}
async function booking(tx: any, id: string, actor: Actor) {
  const rows = await tx.$queryRaw`SELECT "reservationId" FROM reservations WHERE "reservationId" = ${id} AND "propertyId" = ${actor.propertyId} FOR UPDATE`;
  if (!rows.length) throw new Error('Reservation not found for this hotel.');
  const user = await tx.user.findFirst({ where: { userId: actor.userId, propertyId: actor.propertyId, isActive: true }, include: { role: true } });
  if (!user) throw new Error('An active hotel staff account is required.');
  const res = await tx.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { reservationRooms: true, payments: true } });
  return { res, user };
}
function requireManager(user: any) {
  if (user.role.roleName !== 'Manager') throw new Error('A hotel manager must approve this correction.');
}
async function audit(tx: any, actor: Actor, id: string, action: string, reason: string, before: unknown, after: unknown) {
  await tx.auditLog.create({ data: { userId: actor.userId, entityType: 'Reservation', action,
    oldData: snapshot({ reservationId: id, value: before }),
    newData: snapshot({ reservationId: id, reason, value: after }),
  } });
}
async function lockRooms(tx: any, ids: number[]) {
  for (const id of [...new Set(ids)].sort((a, b) => a - b)) {
    await tx.$queryRaw`SELECT "roomId" FROM rooms WHERE "roomId" = ${id} FOR UPDATE`;
  }
}
async function noConflict(tx: any, roomId: number, stayId: number, from: Date, to: Date, occupying = false) {
  const clash = await tx.reservationRoom.findFirst({ where: {
    roomId, reservationRoomId: { not: stayId }, status: { in: ['Reserved', 'CheckedIn'] },
    reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } },
    OR: [{ checkInDate: { lt: to }, checkOutDate: { gt: from } }, ...(occupying ? [{ status: 'CheckedIn' }] : [])],
  } });
  if (clash) throw new Error('The room is occupied or reserved for conflicting dates. Choose another room or correct the conflicting stay first.');
}
async function availableInventory(tx: any, roomId: number | null, propertyId: number, clean = false) {
  if (roomId === null) throw new Error('This stay has no active room. It cannot be restored or moved.');
  const room = await tx.room.findFirst({ where: { roomId, propertyId }, include: { roomType: true } });
  if (!room || !room.roomType.isActive || room.operationalStatus === 'Maintenance') throw new Error('The room is missing, inactive, or under maintenance.');
  if (clean && !['Clean', 'Inspected'].includes(room.housekeepingStatus)) throw new Error('The room must be clean before moving or checking a guest in.');
  return room;
}
async function derive(tx: any, id: string) {
  const rooms = await tx.reservationRoom.findMany({ where: { reservationId: id } });
  const active = rooms.filter((r: any) => r.status !== 'Cancelled');
  const status = active.some((r: any) => r.status === 'CheckedIn') ? 'InHouse'
    : active.length && active.every((r: any) => r.status === 'CheckedOut') ? 'Completed' : 'Confirmed';
  await tx.reservation.update({ where: { reservationId: id }, data: { status } });
}
async function releaseOccupiedRoom(tx: any, stay: any) {
  if (stay.roomId === null || stay.status !== 'CheckedIn') return;
  const other = await tx.reservationRoom.findFirst({ where: { roomId: stay.roomId, reservationRoomId: { not: stay.reservationRoomId }, status: 'CheckedIn' } });
  if (!other) await tx.room.update({ where: { roomId: stay.roomId }, data: { operationalStatus: 'Available', housekeepingStatus: 'Dirty' } });
}
function balanceApproval(res: any, user: any, overrideReason?: unknown) {
  if (res.totalAmount === null || !Number.isFinite(Number(res.totalAmount)) || Number(res.totalAmount) < 0) throw new Error('The reservation total must be reconciled before checkout.');
  if (money(res.totalAmount) - money(res.amountPaid) <= 0.01) return '';
  if (!overrideReason) throw new Error(`Outstanding balance: GHS ${money(money(res.totalAmount) - money(res.amountPaid)).toFixed(2)}. Record payment or ask a manager to approve credit checkout with a reason.`);
  requireManager(user);
  return reasonText(overrideReason);
}

export async function cancelSafely(id: string, actor: Actor, reason = 'Staff cancelled the reservation') {
  let wasConfirmed = false;
  const cancelled = await atomic(async tx => {
    const { res } = await booking(tx, id, actor);
    if (!['Pending', 'Confirmed'].includes(res.status) || res.reservationRooms.some((r: any) => r.status === 'CheckedIn')) {
      throw new Error('Only an unoccupied pending or confirmed reservation can be cancelled. Check out in-house guests first.');
    }
    wasConfirmed = res.status === 'Confirmed';
    await lockRooms(tx, res.reservationRooms.map((r: any) => r.roomId).filter((id: any) => id !== null));
    await tx.reservationRoom.updateMany({ where: { reservationId: id }, data: { status: 'Cancelled' } });
    const updated = await tx.reservation.update({ where: { reservationId: id }, data: {
      status: 'Cancelled', cancellationDate: new Date(), refundDue: money(res.amountPaid),
      refundStatus: money(res.amountPaid) > 0 ? 'Pending' : 'None',
    } });
    // Cancelling an allocation never changes a physical room occupied by another stay.
    await audit(tx, actor, id, 'ReservationCancelled', reason, res, updated);
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
    if (!['Confirmed', 'InHouse'].includes(res.status)) throw new Error('This reservation is not active. Use the manager restore workflow.');
    if (!stay || stay.roomId === null) throw new Error('Room inventory is missing.');
    await lockRooms(tx, [stay.roomId]);
    let data: any;
    let occupantConfirmation: any = {};
    let reason = 'Normal room lifecycle transition';
    if (status === 'CheckedIn' && stay.status === 'Reserved') {
      const occupant = occupantDetails(details.occupantName, details.occupantPhone);
      occupantConfirmation = await confirmOccupant(tx, actor.propertyId, stay, occupant, details.duplicateOccupantConfirmation, true);
      await availableInventory(tx, stay.roomId, actor.propertyId, true);
      await noConflict(tx, stay.roomId, stayId, stay.checkInDate, stay.checkOutDate, true);
      data = { status, actualCheckIn: new Date(), actualCheckOut: null, ...occupant,
        guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null };
      await tx.room.update({ where: { roomId: stay.roomId }, data: { operationalStatus: 'Occupied' } });
    } else if (status === 'CheckedOut' && stay.status === 'CheckedIn') {
      reason = balanceApproval(res, user, details.overrideReason) || reason;
      await releaseOccupiedRoom(tx, stay);
      data = { status, actualCheckOut: new Date(), guestPresenceStatus: 'InRoom', guestOutAt: null, expectedReturnAt: null };
    } else throw new Error('Invalid room transition. Use the dedicated manager correction actions.');
    const updated = await tx.reservationRoom.update({ where: { reservationRoomId: stayId }, data });
    await derive(tx, res.reservationId);
    await audit(tx, actor, res.reservationId, status === 'CheckedOut' && details.overrideReason ? 'CreditCheckoutApproved' : status, reason, stay, { ...updated, ...occupantConfirmation });
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
    if (res.status !== 'Confirmed' || !res.reservationRooms.length) throw new Error('Reservation must be confirmed and have assigned rooms.');
    await lockRooms(tx, res.reservationRooms.map((r: any) => r.roomId).filter((id: any) => id !== null));
    for (const stay of res.reservationRooms) {
      if (stay.status !== 'Reserved') throw new Error('Use individual room actions for a partially processed stay.');
      if (!stay.occupantName?.trim()) throw new Error('Confirm the actual occupant for each room. Open the room assignments and check in each room separately.');
      const occupant = occupantDetails(stay.occupantName, stay.occupantPhone);
      await confirmOccupant(tx, actor.propertyId, stay, occupant, undefined, true);
      await availableInventory(tx, stay.roomId, actor.propertyId, true);
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
      if (!FINANCIAL_ACTIONS.includes(input.action)) return;
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
      for (const room of res.reservationRooms) {
        await availableInventory(tx, room.roomId, actor.propertyId);
        await noConflict(tx, room.roomId, room.reservationRoomId, room.checkInDate, room.checkOutDate);
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
      result.message = `Return ${selected.length} selected room stay(s) to reserved and clear their mistaken arrival records. Rooms become available and dirty until housekeeping checks them. Booking dates, charges and payments remain unchanged.`;
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
      if (date.getTime() < Date.now() - 86400000) throw new Error('Departure cannot be corrected to a past day.');
      await lockRooms(tx, selected.map(room => room.roomId).filter(roomId => roomId !== null));
      for (const stay of selected) {
      await availableInventory(tx, stay.roomId, actor.propertyId);
      await noConflict(tx, stay.roomId, stay.reservationRoomId, stay.checkInDate, date);
      }
      const base = (rooms: any[]) => rooms.filter(r => r.status !== 'Cancelled').reduce((sum, r) => sum + Number(r.agreedPricePerNight) * Math.ceil((r.checkOutDate.getTime() - r.checkInDate.getTime()) / 86400000), 0);
      const oldBase = base(res.reservationRooms);
      if (oldBase <= 0) throw new Error('This booking needs financial reconciliation before repricing.');
      const revised = res.reservationRooms.map((r: any) => selected.some(stay => stay.reservationRoomId === r.reservationRoomId) ? { ...r, checkOutDate: date } : r);
      // Preserve the original effective tax/adjustment multiplier instead of using current hotel tax.
      const totalAmount = money(base(revised) * Number(res.totalAmount) / oldBase);
      const credit = Math.max(0, money(Number(res.amountPaid) - totalAmount));
      await checkDelegation({ oldTotal: money(res.totalAmount), newTotal: totalAmount, isExtension: selected.every(stay => date > stay.checkOutDate) });
      Object.assign(result, { oldTotal: money(res.totalAmount), newTotal: totalAmount, credit, balanceDue: Math.max(0, money(totalAmount - Number(res.amountPaid))), message: 'Correct departure and reprice the booking. Any overpayment remains recorded as a credit requiring refund review; no money is automatically returned.' });
      if (preview) return result;
      for (const stay of selected) await tx.reservationRoom.update({ where: { reservationRoomId: stay.reservationRoomId }, data: { checkOutDate: date, originalCheckOutDate: stay.originalCheckOutDate || stay.checkOutDate } });
      const latest = new Date(Math.max(...revised.map((r: any) => r.checkOutDate.getTime())));
      await tx.reservation.update({ where: { reservationId: id }, data: { checkOutDate: latest, totalAmount, refundDue: credit, refundStatus: credit > 0 ? 'Pending' : 'None' } });
    } else if (input.action === 'transfer') {
      if (!stay || stay.status !== 'CheckedIn' || res.status !== 'InHouse') throw new Error('Only a checked-in guest can be transferred.');
      const targetId = Number(input.targetRoomId);
      if (!Number.isSafeInteger(targetId) || targetId < 1 || targetId === stay.roomId) throw new Error('Choose a different room.');
      await lockRooms(tx, [stay.roomId, targetId].filter((id: any) => id !== null));
      const target = await availableInventory(tx, targetId, actor.propertyId, true);
      if (target.operationalStatus !== 'Available') throw new Error('Target room is not available.');
      if (res.reservationRooms.some((r: any) => r.roomId === targetId)) throw new Error('This room is already assigned to this reservation.');
      await noConflict(tx, targetId, stay.reservationRoomId, stay.checkInDate, stay.checkOutDate, true);
      result.message = `Move to Room ${target.roomNumber}. Keep the agreed nightly price. The original assignment is preserved in correction history; the old room becomes dirty.`;
      result.targetRoomLabel = `Room ${target.roomNumber}`;
      if (preview) return result;
      await releaseOccupiedRoom(tx, stay);
      await tx.room.update({ where: { roomId: targetId }, data: { operationalStatus: 'Occupied' } });
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
      if (payment.gatewayReference?.startsWith('RES-')) throw new Error('Verified online payments cannot be edited. Use the provider refund and reconciliation process.');
      if (await tx.refund.count({ where: { paymentId: payment.paymentId } })) throw new Error('This payment has linked refund records and cannot be replaced or voided.');
      if (input.newAmount === '' || input.newAmount === null || !Number.isFinite(amount) || amount < 0 || amount > 99999999.99 || money(amount) !== amount) throw new Error('Enter a non-negative amount with at most two decimal places. Use zero to void the incorrect entry.');
      const paid = await netPaid(tx, id);
      if (Math.abs(paid - Number(res.amountPaid)) > 0.01) throw new Error('The payment ledger and booking balance differ. Reconcile before correcting.');
      const newPaid = money(paid - Number(payment.amount) + amount);
      await checkDelegation({ payment, newAmount: amount });
      if (newPaid > Number(res.totalAmount) + 0.01) throw new Error('The corrected payment exceeds the reservation total.');
      if (amount === Number(payment.amount)) throw new Error('The amount is unchanged.');
      Object.assign(result, { oldAmount: money(payment.amount), newAmount: amount, newPaid, message: 'Void the mistaken entry without deleting its original amount, and record a linked replacement. This corrects bookkeeping only; it does not move money.' });
      if (preview) return result;
      await tx.payment.update({ where: { paymentId: payment.paymentId }, data: { status: 'Voided' } });
      const replacement = amount > 0 ? await tx.payment.create({ data: { reservationId: id, propertyId: actor.propertyId, amount, paymentMethod: payment.paymentMethod, receivedBy: actor.userId, status: 'Completed', notes: `Correction of payment #${payment.paymentId}: ${reason}` } }) : null;
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
