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

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname));
  const app = express(); app.use(express.json()); app.use('/api/public', publicRoutes);
  const code = `checkout-${randomUUID().slice(0, 8)}`;
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Checkout fixture', businessName: 'Test', propertyType: 'Hotel', country: 'Ghana', isOnlineBookingEnabled: true, paystackSecretKey: 'sk_test_fixture', roomTypes: { create: { typeName: 'Standard', basePrice: 200 } } }, include: { roomTypes: true } });
  const guest = await prisma.platformGuest.create({ data: { fullName: 'Checkout fixture', phone: code, passwordHash: await hashPassword('123456789') } });
  const other = await prisma.platformGuest.create({ data: { fullName: 'Other fixture', phone: `${code}-2` } });
  const originalPost = axios.post;
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
    const booking = await request(app).post(base + '/reservations').set('Authorization', auth).send({ checkInDate: '2030-01-01', checkOutDate: '2030-01-02', roomTypeId: hotel.roomTypes[0].roomTypeId, agreedPricePerNight: 200, platformGuestId: other.guestId, guestFullName: 'Spoofed name', guestPhone: other.phone });
    assert.equal(booking.status, 201);
    const reservation = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: booking.body.data.reservationId } });
    assert.equal(reservation.platformGuestId, guest.guestId);
    assert.equal(reservation.guestNameSnapshot, guest.fullName);
    const otherToken = jwt.sign({ platformGuestId: other.guestId, type: 'guest' }, process.env.JWT_SECRET || 'your-super-secret-key');
    assert.equal((await request(app).post(base + '/payments/initialize').set('Authorization', `Bearer ${otherToken}`).send({ reservationId: reservation.reservationId })).status, 404);
    let sentAmount = 0;
    (axios as any).post = async (_url: string, data: any) => { sentAmount = data.amount; return { data: { data: { authorization_url: 'https://example.test/checkout' } } }; };
    assert.equal((await request(app).post(base + '/payments/initialize').set('Authorization', auth).send({ reservationId: reservation.reservationId, amount: 1 })).status, 200);
    assert.equal(sentAmount, 20000);
    await prisma.platformGuest.update({ where: { guestId: guest.guestId }, data: { isActive: false } });
    assert.equal((await request(app).post(base + '/reservations').set('Authorization', auth).send({})).status, 401);
    console.log('Passed: anonymous/staff/disabled guest rejection, session-bound identity, payment ownership, and server-side payment amount. No payment provider contacted.');
  } finally {
    axios.post = originalPost;
    await prisma.reservation.deleteMany({ where: { propertyId: hotel.propertyId } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.platformGuest.deleteMany({ where: { guestId: { in: [guest.guestId, other.guestId] } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
