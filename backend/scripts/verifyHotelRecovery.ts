import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { cancelSafely, correctBooking, transitionStay, checkoutBooking, correctionHistory } from '../src/modules/reservation/recovery.service';
import { createHotelReservation } from '../src/modules/reservation/booking-creation.service';
import { recordPayment } from '../src/modules/payment/payment.service';
import request from 'supertest';
import app from '../src/app';
import { generateAccessToken } from '../src/shared/utils/jwt';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local fixtures only.');
  const code = `recovery-check-${randomUUID().slice(0, 8)}`;
  const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
  const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
  const property = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Recovery test fixture', businessName: 'Test', propertyType: 'Hotel', country: 'Ghana', isOnlineBookingEnabled: true } });
  const originalTransaction = prisma.$transaction.bind(prisma);
  let checks = 0;
  try {
    const manager = await prisma.user.create({ data: { propertyId: property.propertyId, fullName: 'Fixture manager', username: `${code}-manager`, roleId: managerRole.roleId, passwordHash: 'test-only' } });
    const receptionist = await prisma.user.create({ data: { propertyId: property.propertyId, fullName: 'Fixture receptionist', username: `${code}-reception`, roleId: receptionRole.roleId, passwordHash: 'test-only' } });
    const actor = { userId: manager.userId, propertyId: property.propertyId };
    const desk = { userId: receptionist.userId, propertyId: property.propertyId };
    const guest = await prisma.propertyGuest.create({ data: { propertyId: property.propertyId, fullName: 'Fixture guest' } });
    const type = await prisma.roomType.create({ data: { propertyId: property.propertyId, typeName: 'Fixture', basePrice: 200 } });
    await prisma.room.createMany({ data: [1, 2, 3, 4, 5, 6].map(n => ({ propertyId: property.propertyId, roomTypeId: type.roomTypeId, roomNumber: String(n) })) });
    const rooms = await prisma.room.findMany({ where: { propertyId: property.propertyId }, orderBy: { roomNumber: 'asc' } });
    const date = (offset: number) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
    const create = (index: number, from = 0, to = 2) => createHotelReservation({ propertyId: property.propertyId, propertyGuestId: guest.guestId, staffId: manager.userId, checkInDate: date(from), checkOutDate: date(to), rooms: [{ roomId: rooms[index].roomId, roomTypeId: type.roomTypeId, agreedPricePerNight: 200 }] });
    const get = (id: string) => prisma.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { reservationRooms: true, payments: true } });
    const correction = (id: string, input: any, who = actor) => correctBooking(id, who, { reason: 'Correcting a front desk mistake', ...input });

    const current = await create(0);
    const currentStay = current.reservationRooms[0].reservationRoomId;
    await transitionStay(currentStay, 'CheckedIn', desk, { occupantName: 'Fixture guest' });
    const future = await create(0, 3, 5);
    await cancelSafely(future.reservationId, desk);
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { roomId: rooms[0].roomId } })).operationalStatus, 'Occupied');
    await correction(future.reservationId, { action: 'restore' });
    assert.equal((await get(future.reservationId)).status, 'Confirmed'); checks += 2;

    await assert.rejects(transitionStay(currentStay, 'CheckedOut', desk), /Outstanding balance/);
    await assert.rejects(checkoutBooking(current.reservationId, desk, 'Approved credit'), /manager/);
    const preview = await correction(current.reservationId, { action: 'credit-checkout', stayId: currentStay, preview: true });
    assert(preview.message.includes('400.00'));
    assert.equal((await get(current.reservationId)).status, 'InHouse');
    await correction(current.reservationId, { action: 'credit-checkout', stayId: currentStay });
    assert.equal((await get(current.reservationId)).status, 'Completed');
    await correction(current.reservationId, { action: 'undo-checkout', stayId: currentStay });
    const reinstated = await get(current.reservationId);
    assert.equal(reinstated.status, 'InHouse'); assert.equal(reinstated.reservationRooms[0].actualCheckOut, null); checks += 5;
    await assert.rejects(transitionStay(currentStay, 'Reserved', desk), /Invalid room transition/); checks++;

    const deposit = await create(1, 3, 5);
    await recordPayment({ reservationId: deposit.reservationId, amount: 100, paymentMethod: 'Cash', receivedBy: manager.userId });
    await cancelSafely(deposit.reservationId, desk);
    const restorePreview = await correction(deposit.reservationId, { action: 'restore', preview: true });
    assert(restorePreview.message.includes('retain existing payments'));
    await correction(deposit.reservationId, { action: 'restore' });
    assert.equal(Number((await get(deposit.reservationId)).amountPaid), 100);
    assert.equal((await get(deposit.reservationId)).refundStatus, 'None');
    await cancelSafely(deposit.reservationId, desk);
    const replacement = await create(1, 3, 5);
    await assert.rejects(correction(deposit.reservationId, { action: 'restore' }), /conflicting/);
    assert.equal((await get(deposit.reservationId)).status, 'Cancelled'); checks += 3;

    const financial = await create(2);
    const original = await recordPayment({ reservationId: financial.reservationId, amount: 100, paymentMethod: 'Cash', receivedBy: receptionist.userId });
    await assert.rejects(correction(financial.reservationId, { action: 'correct-payment', paymentId: original.paymentId, newAmount: 50 }, desk), /manager/);
    const both = await Promise.allSettled([1, 2].map(() => correction(financial.reservationId, { action: 'correct-payment', paymentId: original.paymentId, newAmount: 50 })));
    assert.equal(both.filter(r => r.status === 'fulfilled').length, 1);
    const corrected = await get(financial.reservationId);
    assert.equal(Number(corrected.amountPaid), 50);
    assert.equal(corrected.payments.length, 2);
    assert.equal(corrected.payments.find(p => p.paymentId === original.paymentId)!.status, 'Voided');
    assert.equal(Number(corrected.payments.find(p => p.paymentId === original.paymentId)!.amount), 100);
    await assert.rejects(correction(financial.reservationId, { action: 'correct-payment', paymentId: corrected.payments.find(p => p.status === 'Completed')!.paymentId, newAmount: 500 }), /exceeds/); checks += 3;

    const longStay = await create(3, 0, 4);
    await prisma.reservation.update({ where: { reservationId: longStay.reservationId }, data: { totalAmount: 880 } });
    await recordPayment({ reservationId: longStay.reservationId, amount: 800, paymentMethod: 'Cash', receivedBy: manager.userId });
    await transitionStay(longStay.reservationRooms[0].reservationRoomId, 'CheckedIn', desk, { occupantName: 'Long stay guest' });
    const dates = { action: 'correct-date', stayId: longStay.reservationRooms[0].reservationRoomId, newCheckOutDate: date(2) };
    const pricePreview = await correction(longStay.reservationId, { ...dates, preview: true });
    assert.equal(pricePreview.newTotal, 440); assert.equal(pricePreview.credit, 360);
    assert.equal(Number((await get(longStay.reservationId)).totalAmount), 880);
    await correction(longStay.reservationId, dates);
    const shortened = await get(longStay.reservationId);
    assert.equal(Number(shortened.totalAmount), 440); assert.equal(Number(shortened.refundDue), 360);
    assert.equal(shortened.checkOutDate.toISOString().slice(0, 10), date(2));
    await create(3, 2, 4);
    await assert.rejects(correction(longStay.reservationId, { ...dates, newCheckOutDate: date(3) }), /conflicting/); checks += 3;

    await assert.rejects(correction(current.reservationId, { action: 'transfer', stayId: currentStay, targetRoomId: rooms[2].roomId }), /conflicting/);
    await correction(current.reservationId, { action: 'transfer', stayId: currentStay, targetRoomId: rooms[4].roomId });
    const moved = await get(current.reservationId);
    assert.equal(moved.reservationRooms[0].roomId, rooms[4].roomId);
    assert.equal(Number(moved.totalAmount), 400);
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { roomId: rooms[0].roomId } })).housekeepingStatus, 'Dirty');
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { roomId: rooms[4].roomId } })).operationalStatus, 'Occupied');
    const history = await correctionHistory(current.reservationId, actor);
    assert(history.some(entry => entry.action === 'Correction:transfer'));
    await assert.rejects(correctionHistory(current.reservationId, { ...actor, propertyId: -1 }), /not found/); checks += 3;

    // Every recovery write is rolled back if its audit record cannot be saved.
    (prisma as any).$transaction = (work: any, options: any) => originalTransaction(async tx => {
      (tx.auditLog as any).create = async () => { throw new Error('Injected audit failure'); };
      return work(tx);
    }, options);
    await assert.rejects(cancelSafely(replacement.reservationId, actor), /Injected audit failure/);
    (prisma as any).$transaction = originalTransaction;
    assert.equal((await get(replacement.reservationId)).status, 'Confirmed'); checks++;

    const raced = await create(5, 7, 9);
    await cancelSafely(raced.reservationId, actor);
    const race = await Promise.allSettled([correction(raced.reservationId, { action: 'restore' }), create(5, 7, 9)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1); checks++;

    await prisma.payment.updateMany({ where: { reservationId: deposit.reservationId }, data: { status: 'Refunded' } });
    await assert.rejects(correction(deposit.reservationId, { action: 'restore' }), /already been refunded/); checks++;
    const livePayment = corrected.payments.find(p => p.status === 'Completed')!;
    const stalePreview = await correction(financial.reservationId, { action: 'correct-payment', paymentId: livePayment.paymentId, newAmount: 25, preview: true });
    await prisma.reservation.update({ where: { reservationId: financial.reservationId }, data: { notes: 'Changed after preview' } });
    await assert.rejects(correction(financial.reservationId, { action: 'correct-payment', paymentId: livePayment.paymentId, newAmount: 25, expectedVersion: stalePreview.version }), /changed after the preview/); checks++;
    await correction(financial.reservationId, { action: 'correct-payment', paymentId: livePayment.paymentId, newAmount: 0 });
    assert.equal(Number((await get(financial.reservationId)).amountPaid), 0); checks++;
    await assert.rejects(correction(financial.reservationId, { action: 'correct-date', stayId: financial.reservationRooms[0].reservationRoomId, newCheckOutDate: date(3), reason: 'bad' }), /reason/); checks++;

    const unused = await prisma.room.create({ data: { propertyId: property.propertyId, roomTypeId: type.roomTypeId, roomNumber: '7' } });
    const prior = await createHotelReservation({ propertyId: property.propertyId, propertyGuestId: guest.guestId, checkInDate: date(0), checkOutDate: date(2), rooms: [{ roomId: unused.roomId, roomTypeId: type.roomTypeId, agreedPricePerNight: 200 }] });
    const priorStayId = prior.reservationRooms[0].reservationRoomId;
    await recordPayment({ reservationId: prior.reservationId, amount: 400, paymentMethod: 'Cash', receivedBy: manager.userId });
    await transitionStay(priorStayId, 'CheckedIn', desk, { occupantName: 'Prior guest' });
    await transitionStay(priorStayId, 'CheckedOut', desk);
    const reused = await createHotelReservation({ propertyId: property.propertyId, propertyGuestId: guest.guestId, checkInDate: date(3), checkOutDate: date(5), rooms: [{ roomId: unused.roomId, roomTypeId: type.roomTypeId, agreedPricePerNight: 200 }] });
    await prisma.reservationRoom.update({ where: { reservationRoomId: reused.reservationRooms[0].reservationRoomId }, data: { actualCheckIn: new Date(Date.now() + 1000), status: 'CheckedOut' } });
    await assert.rejects(correction(prior.reservationId, { action: 'undo-checkout', stayId: priorStayId }), /used by another guest/); checks++;
    const managerToken = generateAccessToken({ ...actor, roleId: managerRole.roleId, username: manager.username });
    const receptionistToken = generateAccessToken({ ...desk, roleId: receptionRole.roleId, username: receptionist.username });
    const apiInput = { action: 'correct-date', stayId: financial.reservationRooms[0].reservationRoomId, newCheckOutDate: date(3), reason: 'Manager reviewed the departure mistake', preview: true };
    assert.equal((await request(app).post(`/api/reservations/${financial.reservationId}/corrections`).set('Authorization', `Bearer ${receptionistToken}`).send(apiInput)).status, 403);
    assert.equal((await request(app).post(`/api/reservations/${financial.reservationId}/corrections`).set('Authorization', `Bearer ${managerToken}`).send(apiInput)).status, 200);
    assert.equal((await request(app).post('/api/payments').send({ reservationId: financial.reservationId, amount: 1, paymentMethod: 'Cash' })).status, 401);
    assert.equal((await request(app).patch(`/api/payments/${original.paymentId}`).set('Authorization', `Bearer ${managerToken}`).send({ amount: 2 })).status, 400); checks += 4;
    await cancelSafely(future.reservationId, actor);
    await prisma.reservation.update({ where: { reservationId: future.reservationId }, data: { amountPaid: 1 } });
    await assert.rejects(correction(future.reservationId, { action: 'restore' }), /history and balance differ/); checks++;
    const undoRoom = await prisma.room.create({ data: { propertyId: property.propertyId, roomTypeId: type.roomTypeId, roomNumber: 'Undo check-in' } });
    const accidental = await createHotelReservation({ propertyId: property.propertyId, propertyGuestId: guest.guestId, checkInDate: date(0), checkOutDate: date(2), rooms: [{ roomId: undoRoom.roomId, roomTypeId: type.roomTypeId, agreedPricePerNight: 200 }] });
    const undoInput = { action: 'undo-checkin', stayId: accidental.reservationRooms[0].reservationRoomId };
    await recordPayment({ reservationId: accidental.reservationId, amount: 100, paymentMethod: 'Cash', receivedBy: manager.userId });
    await transitionStay(undoInput.stayId, 'CheckedIn', desk, { occupantName: 'Mistaken occupant' });
    await correction(accidental.reservationId, { ...undoInput, preview: true });
    assert.equal((await get(accidental.reservationId)).status, 'InHouse'); checks++;
    await assert.rejects(correction(accidental.reservationId, undoInput, desk), /manager/); checks++;
    await correction(accidental.reservationId, undoInput);
    const undone = await get(accidental.reservationId);
    assert.equal(undone.status, 'Confirmed'); assert.equal(undone.reservationRooms[0].status, 'Reserved');
    assert.equal(undone.reservationRooms[0].actualCheckIn, null); assert.equal(undone.reservationRooms[0].occupantName, null);
    assert.equal(Number(undone.amountPaid), 100); assert.equal(Number(undone.totalAmount), 400);
    const released = await prisma.room.findUniqueOrThrow({ where: { roomId: undoRoom.roomId } });
    assert.equal(released.operationalStatus, 'Available'); assert.equal(released.housekeepingStatus, 'Dirty');
    assert((await correctionHistory(accidental.reservationId, actor)).some(entry => entry.action === 'Correction:undo-checkin')); checks++;
    await assert.rejects(correction(accidental.reservationId, undoInput), /checked-in room/); checks++;
    const dailyResponse = await request(app).get('/api/reports/daily').set('Authorization', `Bearer ${managerToken}`);
    assert.equal(dailyResponse.status, 200);
    const daily = dailyResponse.body.data;
    assert.equal(daily.timeZone, 'Africa/Accra');
    assert(daily.byStaff.some((row: any) => row.name === 'Fixture manager'));
    assert(daily.payments.every((payment: any) => payment.guest === 'Fixture guest'));
    assert(daily.events.some((event: any) => event.action === 'Correction:undo-checkin'));
    const expectedCollections = daily.payments.filter((p: any) => p.status === 'Completed' && !p.correction).reduce((sum: number, p: any) => sum + p.amount, 0);
    assert.equal(daily.collections, expectedCollections); checks++;
    assert.equal((await request(app).get('/api/reports/daily').set('Authorization', `Bearer ${receptionistToken}`)).status, 403); checks++;
    assert.equal((await request(app).get('/api/reports/daily')).status, 401); checks++;
    assert.equal((await request(app).get('/api/reports/daily?date=2026-02-30').set('Authorization', `Bearer ${managerToken}`)).status, 400); checks++;
    console.log(`Passed ${checks} recovery scenarios against real local PostgreSQL, including undo check-in preview, permissions, preserved finances, room readiness and audit history.`);
  } finally {
    (prisma as any).$transaction = originalTransaction;
    await prisma.payment.deleteMany({ where: { propertyId: property.propertyId } });
    await prisma.reservation.deleteMany({ where: { propertyId: property.propertyId } });
    await prisma.auditLog.deleteMany({ where: { user: { propertyId: property.propertyId } } });
    await prisma.property.delete({ where: { propertyId: property.propertyId } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
