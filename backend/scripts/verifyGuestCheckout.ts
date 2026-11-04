import 'dotenv/config';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import publicRoutes from '../src/modules/public/public.routes';
import { prisma } from '../src/shared/utils/prisma';
import { hashPassword } from '../src/shared/utils/password';
import { verifyGuestPayment } from '../src/modules/payment/guest-payment.service';
import { recordPayment } from '../src/modules/payment/payment.service';
import { refundReservation } from '../src/modules/reservation/reservation.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
  const app = express(); app.use(express.json()); app.use('/api/public', publicRoutes);
  const code = `checkout-${randomUUID().slice(0, 8)}`;
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Checkout fixture', businessName: 'Test', propertyType: 'Hotel', country: 'Ghana', isOnlineBookingEnabled: true, paystackSecretKey: 'sk_test_fixture', roomTypes: { create: { typeName: 'Standard', basePrice: 200 } } }, include: { roomTypes: true } });
  const guest = await prisma.platformGuest.create({ data: { fullName: 'Checkout fixture', phone: code, passwordHash: await hashPassword('123456789') } });
  const other = await prisma.platformGuest.create({ data: { fullName: 'Other fixture', phone: `${code}-2` } });
  const originalPost = axios.post;
  const originalGet = axios.get;
  try {
    (axios as any).get = async (url: string) => ({ data: { status: true, data: { reference: decodeURIComponent(url.split('/').pop()!), status: 'pending' } } });
    await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: hotel.roomTypes[0].roomTypeId, roomNumber: '101' } });
    const base = `/api/public/${code}`;
    for (const endpoint of ['/reservations', '/payments/initialize']) {
      assert.equal((await request(app).post(base + endpoint).send({ guestFullName: 'Bypass', guestPhone: '0540000000', platformGuestId: guest.guestId })).status, 401);
      const staffToken = jwt.sign({ userId: 1, type: 'staff' }, process.env.JWT_SECRET!);
      assert.equal((await request(app).post(base + endpoint).set('Authorization', `Bearer ${staffToken}`).send({})).status, 401);
    }
    const login = await request(app).post('/api/public/auth/login').send({ phone: code, password: '123456789' });
    assert.equal(login.status, 200);
    const token = login.body.data.token;
    assert(token, 'Real guest login must return a token.');
    const auth = `Bearer ${token}`;
    assert.equal((await request(app).get('/api/public/reservations').set('Authorization', auth)).status, 200);
    const booking = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-01-01', checkOutDate: '2030-01-02', roomTypeId: hotel.roomTypes[0].roomTypeId, agreedPricePerNight: 200, platformGuestId: other.guestId, guestFullName: 'Spoofed name', guestPhone: other.phone });
    assert.equal(booking.status, 201);
    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: booking.body.data.reservationId } });
    assert.equal(reservation.platformGuestId, guest.guestId);
    assert.equal(reservation.guestNameSnapshot, guest.fullName);
    assert.equal(reservation.status, 'Pending');
    const otherToken = jwt.sign({ platformGuestId: other.guestId, type: 'guest' }, process.env.JWT_SECRET || 'your-super-secret-key');
    assert.equal((await request(app).post(base + '/payments/initialize').set('Authorization', `Bearer ${otherToken}`).send({ reservationId: reservation.reservationId })).status, 404);
    let sentAmount = 0;
    (axios as any).post = async (_url: string, data: any) => { sentAmount = data.amount; return { data: { data: { authorization_url: 'https://example.test/checkout' } } }; };
    assert.equal((await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: reservation.reservationId, amount: 1 })).status, 200);
    assert.equal(sentAmount, 20000);
    const firstAttempt = await prisma.guestPaymentAttempt.findFirstOrThrow({ where: { reservationId: reservation.reservationId } });
    const repeatedInit = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: reservation.reservationId });
    assert.equal(repeatedInit.status, 200); assert.equal(repeatedInit.body.data.reference, firstAttempt.reference);
    assert.equal(await prisma.guestPaymentAttempt.count({ where: { reservationId: reservation.reservationId } }), 1);
    // An abandoned payment releases only its allocation, not physical room status.
    await prisma.reservation.update({ where: { reservationId: reservation.reservationId }, data: { createdAt: new Date(Date.now() - 11 * 60000) } });
    assert.equal((await request(app).get(base + '/room-types')).status, 200);
    const expired = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId }, include: { reservationRooms: true } });
    assert.equal(expired.status, 'Expired'); assert.equal(expired.reservationRooms[0].status, 'Cancelled');
    const expiredInit = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: reservation.reservationId });
    assert.equal(expiredInit.status, 200); assert.equal(expiredInit.body.data.status, 'released');
    const replacement = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-01-01', checkOutDate: '2030-01-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(replacement.status, 201);
    const settle = async (id: string) => {
      const savedAttempt = await prisma.guestPaymentAttempt.findFirst({ where: { reservationId: id }, orderBy: { attemptId: 'desc' } });
      const reference = savedAttempt?.reference || `RES-${id}-fixture`;
      (axios as any).get = async () => ({ data: { status: true, data: { reference, status: 'success', currency: 'GHS', amount: 20000, channel: 'card', metadata: { reservationId: id, propertyCode: code } } } });
      return verifyGuestPayment(code, reference);
    };
    const late = await settle(reservation.reservationId);
    assert.equal(late.data.requiresRefundReview, true);
    const lateBooking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId } });
    assert.equal(lateBooking.status, 'Expired'); assert.equal(Number(lateBooking.refundDue), 200);
    assert.equal((await settle(reservation.reservationId)).data.requiresRefundReview, true);
    assert.equal((await settle(replacement.body.data.reservationId)).data.bookingStatus, 'Confirmed');
    assert.equal((await prisma.room.findFirstOrThrow({ where: { propertyId: hotel.propertyId } })).operationalStatus, 'Available');
    const cancelUrl = `/api/public/reservations/${replacement.body.data.reservationId}/cancel`;
    assert.equal((await request(app).post(cancelUrl).send({ reason: 'My travel plans have changed.' })).status, 401);
    assert.equal((await request(app).post(cancelUrl).set('Authorization', `Bearer ${otherToken}`).send({ reason: 'My travel plans have changed.' })).status, 404);
    assert.equal((await request(app).post(cancelUrl).set('Authorization', auth).send({ reason: 'bad' })).status, 400);
    const paidStay = await prisma.reservationRoom.findFirstOrThrow({ where: { reservationId: replacement.body.data.reservationId } });
    await prisma.reservationRoom.update({ where: { reservationRoomId: paidStay.reservationRoomId }, data: { status: 'CheckedIn', actualCheckIn: new Date() } });
    assert.equal((await request(app).post(cancelUrl).set('Authorization', auth).send({ reason: 'My travel plans have changed.' })).status, 400);
    await prisma.reservationRoom.update({ where: { reservationRoomId: paidStay.reservationRoomId }, data: { status: 'Reserved', actualCheckIn: null } });
    const paidCancellation = await request(app).post(cancelUrl).set('Authorization', auth).send({ reason: 'My travel plans have changed.' });
    assert.equal(paidCancellation.status, 200); assert.equal(paidCancellation.body.data.refundDue, 200);
    const cancelledPaid = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: replacement.body.data.reservationId }, include: { payments: true } });
    assert.equal(cancelledPaid.status, 'Cancelled'); assert.equal(Number(cancelledPaid.amountPaid), 200); assert.equal(cancelledPaid.payments[0].status, 'Completed');
    assert.equal((await request(app).post(cancelUrl).set('Authorization', auth).send({ reason: 'My travel plans have changed.' })).status, 200);
    assert.equal(await prisma.auditLog.count({ where: { action: 'GuestCancelledReservation', newData: { path: ['reservationId'], equals: replacement.body.data.reservationId } } }), 1);
    const unpaid = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-01-01', checkOutDate: '2030-01-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(unpaid.status, 201);
    const physicalRoom = await prisma.room.findFirstOrThrow({ where: { propertyId: hotel.propertyId } });
    await prisma.room.update({ where: { roomId: physicalRoom.roomId }, data: { operationalStatus: 'Occupied' } });
    const unpaidCancellation = await request(app).post(`/api/public/reservations/${unpaid.body.data.reservationId}/cancel`).set('Authorization', auth).send({ reason: 'I made a duplicate reservation.' });
    assert.equal(unpaidCancellation.status, 200); assert.equal(unpaidCancellation.body.data.refundDue, 0);
    assert.equal((await prisma.room.findUniqueOrThrow({ where: { roomId: physicalRoom.roomId } })).operationalStatus, 'Occupied');
    assert.equal((await settle(unpaid.body.data.reservationId)).data.requiresRefundReview, true);
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: unpaid.body.data.reservationId } })).status, 'Cancelled');
    await prisma.room.update({ where: { roomId: physicalRoom.roomId }, data: { operationalStatus: 'Available' } });
    // Truly concurrent cancellation and settlement lock the same booking row.
    const raced = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-02-01', checkOutDate: '2030-02-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(raced.status, 201);
    const racedId = raced.body.data.reservationId;
    const raceResults = await Promise.all([
      settle(racedId),
      request(app).post(`/api/public/reservations/${racedId}/cancel`).set('Authorization', auth).send({ reason: 'My travel plans have changed.' }),
    ]);
    assert.equal(raceResults[1].status, 200);
    const racedBooking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: racedId }, include: { payments: true, reservationRooms: true } });
    assert.equal(racedBooking.status, 'Cancelled'); assert.equal(Number(racedBooking.amountPaid), 200);
    assert.equal(Number(racedBooking.refundDue), 200); assert.equal(racedBooking.refundStatus, 'Pending');
    assert.equal(racedBooking.payments.length, 1); assert(racedBooking.reservationRooms.every(s => s.status === 'Cancelled'));
    // A lost callback can recover from committed payment history without contacting Paystack again.
    (axios as any).get = async () => { throw new Error('Injected provider outage after settlement'); };
    const recovered = await verifyGuestPayment(code, `RES-${racedId}-fixture`);
    assert.equal(recovered.status, 'success'); assert.equal(recovered.data.requiresRefundReview, true);
    assert.equal(await prisma.payment.count({ where: { reservationId: racedId } }), 1);
    assert.equal((await request(app).get(`${base}/reservations/${racedId}/payment-status`).set('Authorization', `Bearer ${otherToken}`)).status, 404);
    const concurrent = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-03-01', checkOutDate: '2030-03-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    const concurrentId = concurrent.body.data.reservationId;
    let providerInitializations = 0;
    (axios as any).get = async (url: string) => ({ data: { status: true, data: { reference: decodeURIComponent(url.split('/').pop()!), status: 'pending' } } });
    (axios as any).post = async () => { providerInitializations++; await new Promise(resolve => setTimeout(resolve, 30)); return { data: { data: { authorization_url: 'https://example.test/resume' } } }; };
    const starts = await Promise.all([1, 2].map(() => request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: concurrentId })));
    assert(starts.every(response => response.status === 200)); assert.equal(providerInitializations, 1);
    assert.equal(await prisma.guestPaymentAttempt.count({ where: { reservationId: concurrentId } }), 1);
    const resumed = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: concurrentId });
    assert.equal(resumed.body.data.authorization_url, 'https://example.test/resume'); assert.equal(providerInitializations, 1);
    const lost = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-04-01', checkOutDate: '2030-04-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    const lostId = lost.body.data.reservationId;
    (axios as any).post = async () => { providerInitializations++; throw new Error('Lost response after provider received request'); };
    const lostStart = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: lostId });
    assert.equal(lostStart.body.data.status, 'unknown');
    (axios as any).get = async () => { throw new Error('Provider verification temporarily unavailable'); };
    const blockedRetry = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: lostId });
    assert.equal(blockedRetry.body.data.status, 'unknown'); assert.equal(providerInitializations, 2);
    const lostAttempt = await prisma.guestPaymentAttempt.findFirstOrThrow({ where: { reservationId: lostId } });
    (axios as any).get = async () => ({ data: { status: true, data: { reference: lostAttempt.reference, status: 'success', currency: 'GHS', amount: 20000, channel: 'mobile_money', metadata: { reservationId: lostId, propertyCode: code } } } });
    const recoveredStatus = await request(app).get(`${base}/reservations/${lostId}/payment-status`).set('Authorization', auth);
    assert.equal(recoveredStatus.body.data.status, 'paid');
    const noSecondCharge = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: lostId });
    assert.equal(noSecondCharge.body.data.status, 'paid'); assert.equal(providerInitializations, 2);
    assert.equal(await prisma.payment.count({ where: { reservationId: lostId } }), 1);
    // A checkout never received by the provider can recover using its original reference.
    const stalled = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2031-01-01', checkOutDate: '2031-01-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(stalled.status, 201);
    const stalledId = stalled.body.data.reservationId;
    const stalledAttempt = await prisma.guestPaymentAttempt.create({ data: { reservationId: stalledId, reference: `RES-${stalledId}-${randomUUID()}`, amount: 200, currency: 'GHS', status: 'Unknown' } });
    const missing = () => { throw Object.assign(new Error('Reference missing'), { response: { status: 400, data: { message: 'Transaction reference not found.' } } }); };
    (axios as any).get = async () => missing();
    assert.equal((await request(app).get(`${base}/reservations/${stalledId}/payment-status`).set('Authorization', auth)).body.data.status, 'unknown');
    await prisma.guestPaymentAttempt.update({ where: { attemptId: stalledAttempt.attemptId }, data: { updatedAt: new Date(Date.now() - 60000) } });
    (axios as any).get = async () => { throw Object.assign(new Error('Wrong key'), { response: { status: 401, data: { message: 'Invalid key' } } }); };
    assert.equal((await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: stalledId })).body.data.status, 'unknown');
    (axios as any).get = async () => missing();
    assert.equal((await request(app).get(`${base}/reservations/${stalledId}/payment-status`).set('Authorization', auth)).body.data.status, 'retryable');
    let recoveryStarts = 0;
    (axios as any).post = async (_url: string, body: any) => { recoveryStarts++; assert.equal(body.reference, stalledAttempt.reference); await new Promise(resolve => setTimeout(resolve, 30)); return { data: { data: { authorization_url: 'https://example.test/recovered' } } }; };
    const recovery = await Promise.all([1,2].map(() => request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: stalledId })));
    assert(recovery.some(response => response.body.data.authorization_url === 'https://example.test/recovered'));
    assert.equal(recoveryStarts, 1);
    assert.equal(await prisma.guestPaymentAttempt.count({ where: { reservationId: stalledId } }), 1);
    assert.equal((await prisma.guestPaymentAttempt.findUniqueOrThrow({ where: { attemptId: stalledAttempt.attemptId } })).reference, stalledAttempt.reference);
    // Hybrid payments: never reuse a stale full-price checkout after a cash deposit.
    // Payment after expiry restores inventory when it is still free, exactly once.
    const recoverable = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-06-01', checkOutDate: '2030-06-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(recoverable.status, 201);
    const recoverableId = recoverable.body.data.reservationId;
    await prisma.reservation.update({ where: { reservationId: recoverableId }, data: { createdAt: new Date(Date.now() - 11 * 60000) } });
    await request(app).get(base + '/room-types');
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: recoverableId } })).status, 'Expired');
    const lateRecovered = await settle(recoverableId);
    assert.equal(lateRecovered.data.bookingStatus, 'Confirmed'); assert.equal(lateRecovered.data.requiresRefundReview, false);
    await settle(recoverableId);
    const recoveredBooking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: recoverableId }, include: { reservationRooms: true, payments: true } });
    assert.equal(recoveredBooking.payments.length, 1); assert.equal(Number(recoveredBooking.amountPaid), 200);
    assert.equal(recoveredBooking.reservationRooms[0].status, 'Reserved'); assert.equal(Number(recoveredBooking.refundDue), 0);
    const blocked = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-06-01', checkOutDate: '2030-06-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.notEqual(blocked.status, 201);
    // A new booking and late settlement compete for the same released room.
    const racingHold = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-07-01', checkOutDate: '2030-07-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(racingHold.status, 201);
    const racingId = racingHold.body.data.reservationId;
    await prisma.reservation.update({ where: { reservationId: racingId }, data: { createdAt: new Date(Date.now() - 11 * 60000) } });
    await request(app).get(base + '/room-types');
    const [racePayment, raceBooking] = await Promise.all([
      settle(racingId),
      request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-07-01', checkOutDate: '2030-07-02', roomTypeId: hotel.roomTypes[0].roomTypeId }),
    ]);
    if (raceBooking.status === 201) {
      assert.equal(racePayment.data.bookingStatus, 'Expired'); assert.equal(racePayment.data.requiresRefundReview, true);
    } else assert.equal(racePayment.data.bookingStatus, 'Confirmed');
    assert.equal(await prisma.reservationRoom.count({ where: { roomId: recoveredBooking.reservationRooms[0].roomId, status: 'Reserved', checkInDate: new Date('2030-07-01'), reservation: { status: { in: ['Pending', 'Confirmed'] } } } }), 1);
    await prisma.roomType.update({ where: { roomTypeId: hotel.roomTypes[0].roomTypeId }, data: { basePrice: 700 } });
    const hybrid = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-05-01', checkOutDate: '2030-05-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    const hybridId = hybrid.body.data.reservationId;
    let hybridAmount = 0, hybridStarts = 0;
    (axios as any).post = async (_url: string, data: any) => { hybridAmount = data.amount; hybridStarts++; return { data: { data: { authorization_url: 'https://example.test/hybrid' } } }; };
    await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: hybridId });
    assert.equal(hybridAmount, 70000);
    const originalHybridAttempt = await prisma.guestPaymentAttempt.findFirstOrThrow({ where: { reservationId: hybridId } });
    await recordPayment({ reservationId: hybridId, amount: 200, paymentMethod: 'Cash' });
    (axios as any).get = async (url: string) => ({ data: { status: true, data: { reference: decodeURIComponent(url.split('/').pop()!), status: 'pending' } } });
    const stillProcessing = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: hybridId });
    assert.equal(stillProcessing.body.data.authorization_url, null); assert.equal(hybridStarts, 1);
    (axios as any).get = async (url: string) => ({ data: { status: true, data: { reference: decodeURIComponent(url.split('/').pop()!), status: 'abandoned' } } });
    const hybridInit = await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: hybridId });
    assert.equal(hybridInit.body.data.authorization_url, 'https://example.test/hybrid'); assert.equal(hybridAmount, 50000);
    assert.equal(hybridStarts, 2);
    assert.equal((await prisma.guestPaymentAttempt.findUniqueOrThrow({ where: { attemptId: originalHybridAttempt.attemptId } })).status, 'Superseded');
    const balanceAttempt = await prisma.guestPaymentAttempt.findFirstOrThrow({ where: { reservationId: hybridId, status: 'Pending' } });
    const settleHybrid = async (reference: string, amount: number) => {
      (axios as any).get = async () => ({ data: { status: true, data: { reference, status: 'success', currency: 'GHS', amount: amount * 100, channel: 'card', metadata: { reservationId: hybridId, propertyCode: code } } } });
      return verifyGuestPayment(code, reference);
    };
    await settleHybrid(balanceAttempt.reference, 500);
    const fullyPaid = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: hybridId } });
    assert.equal(Number(fullyPaid.amountPaid), 700); assert.equal(Number(fullyPaid.refundDue), 0);
    await settleHybrid(originalHybridAttempt.reference, 700);
    const overpaid = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: hybridId } });
    assert.equal(overpaid.status, 'Confirmed'); assert.equal(Number(overpaid.amountPaid), 1400);
    assert.equal(Number(overpaid.refundDue), 700); assert.equal(overpaid.refundStatus, 'Pending');
    await settleHybrid(originalHybridAttempt.reference, 700);
    assert.equal(await prisma.payment.count({ where: { reservationId: hybridId } }), 3);
    await prisma.platformGuest.update({ where: { guestId: guest.guestId }, data: { isActive: false } });
    assert.equal((await request(app).post(base + '/reservations').set('Authorization', auth).send({})).status, 401);
    await assert.rejects(refundReservation(reservation.reservationId), /refund requests/);
    const refundedLateBooking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId }, include: { payments: true } });
    assert.equal(refundedLateBooking.status, 'Expired'); assert.equal(refundedLateBooking.refundStatus, 'Pending');
    assert(Number(refundedLateBooking.amountPaid) > 0); assert.equal(refundedLateBooking.payments[0].status, 'Completed');
    console.log('Passed checkout, late-payment restoration, concurrent allocation, expired-booking refund recording, cancellation, settlement races, checkout resumption, lost-response protection, and duplicate-charge prevention. Paystack was mocked.');
  } finally {
    axios.post = originalPost;
    axios.get = originalGet;
    const fixtureBookings = await prisma.reservation.findMany({ where: { propertyId: hotel.propertyId }, select: { reservationId: true } });
    if (fixtureBookings.length) await prisma.auditLog.deleteMany({ where: { OR: fixtureBookings.map(r => ({ newData: { path: ['reservationId'], equals: r.reservationId } })) } });
    await prisma.reservation.deleteMany({ where: { propertyId: hotel.propertyId } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.platformGuest.deleteMany({ where: { guestId: { in: [guest.guestId, other.guestId] } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
