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
    // An abandoned payment releases only its allocation, not physical room status.
    await prisma.reservation.update({ where: { reservationId: reservation.reservationId }, data: { createdAt: new Date(Date.now() - 11 * 60000) } });
    assert.equal((await request(app).get(base + '/room-types')).status, 200);
    const expired = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId }, include: { reservationRooms: true } });
    assert.equal(expired.status, 'Expired'); assert.equal(expired.reservationRooms[0].status, 'Cancelled');
    assert.equal((await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: reservation.reservationId })).status, 404);
    const replacement = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-01-01', checkOutDate: '2030-01-02', roomTypeId: hotel.roomTypes[0].roomTypeId });
    assert.equal(replacement.status, 201);
    const settle = async (id: string) => {
      const reference = `RES-${id}-fixture`;
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
    await prisma.platformGuest.update({ where: { guestId: guest.guestId }, data: { isActive: false } });
    assert.equal((await request(app).post(base + '/reservations').set('Authorization', auth).send({})).status, 401);
    console.log('Passed: checkout/expiry/rebooking, cancellation ownership/authentication, required reason, check-in guard, paid/unpaid cancellation, preserved payment history, idempotent cancellation, occupancy isolation, and late payment refund review. No payment provider contacted.');
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
