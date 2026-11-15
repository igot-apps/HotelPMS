import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import auth from '../src/modules/public/public-auth.routes';
import booking from '../src/modules/public/public.routes';

const mock = () => jest.fn<(...args: any[]) => any>();
const mockSend = mock();
const mockCreateBooking = mock();
const mockCancel = mock();
const mockInitialize = mock();
const mockStatus = mock();
const mockVerify = mock();
const mockDb = {
  $transaction: mock(),
  $queryRaw: mock(),
  propertyWebsiteDomain: { findUnique: mock() },
  property: { findUnique: mock() },
  platformGuest: { findMany: mock(), findUnique: mock(), findFirst: mock(), create: mock(), update: mock() },
  guestEmailChallenge: { findMany: mock(), create: mock(), findUnique: mock(), updateMany: mock() },
  hotelGuestAccount: { upsert: mock(), findUnique: mock() },
  reservation: { count: mock(), findMany: mock(), findFirst: mock() },
};

jest.mock('resend', () => ({ Resend: function () { return { emails: { send: (...args: any[]) => mockSend(...args) } }; } }));
jest.mock('../src/shared/utils/prisma', () => ({ get prisma() { return mockDb; } }));
jest.mock('../src/modules/reservation/online-hold.service', () => ({ expireOnlineHolds: jest.fn() }));
jest.mock('../src/modules/reservation/booking-creation.service', () => ({ createHotelReservation: (...args: any[]) => mockCreateBooking(...args) }));
jest.mock('../src/modules/reservation/guest-cancellation.service', () => ({ cancelGuestReservation: (...args: any[]) => mockCancel(...args) }));
jest.mock('../src/modules/payment/guest-payment-attempt.service', () => ({
  initializeGuestPayment: (...args: any[]) => mockInitialize(...args),
  checkGuestPaymentStatus: (...args: any[]) => mockStatus(...args),
}));
jest.mock('../src/modules/payment/guest-payment.service', () => ({ verifyGuestPayment: (...args: any[]) => mockVerify(...args) }));

const app = express();
app.use(express.json());
app.use('/public/auth', auth);
app.use('/public', booking);
const hotelOne = 'https://hotel-one.example';
const hotelTwo = 'https://hotel-two.example';
const central = 'https://hideout24.com';
const email = 'guest@example.com';
const secret = 'only-for-guest-auth-tests';
const profile = { guestId: 7, email, fullName: 'Test Guest', phone: '+233241234567', isActive: true, isEmailVerified: true };
const hotel = (propertyId: number) => ({
  propertyId, propertyCode: propertyId === 1 ? 'hotel-one' : 'hotel-two',
  isActive: true, status: 'Active', isOnlineBookingEnabled: true,
});
const reservationId = 'b598a6c3-75ac-4d5b-8c88-77d49d36de25';
const reference = `RES-${reservationId}-test`;

beforeEach(() => {
  jest.resetAllMocks();
  process.env.JWT_SECRET = secret;
  process.env.RESEND_API_KEY = 'test-key';
  process.env.GUEST_EMAIL_FROM = 'noreply@example.com';
  const challenges = new Map<string, any>();
  const accounts = new Map<number, any>();
  mockDb.$transaction.mockImplementation(callback => callback(mockDb));
  mockDb.propertyWebsiteDomain.findUnique.mockImplementation(({ where }) => {
    const id = where.hostname === 'hotel-one.example' ? 1 : where.hostname === 'hotel-two.example' ? 2 : null;
    return id ? { isActive: true, property: hotel(id) } : null;
  });
  mockDb.property.findUnique.mockImplementation(({ where }) => hotel(where.propertyCode === 'hotel-one' ? 1 : 2));
  mockDb.platformGuest.findMany.mockResolvedValue([profile]);
  mockDb.platformGuest.findUnique.mockResolvedValue(profile);
  mockDb.platformGuest.update.mockResolvedValue(profile);
  mockDb.guestEmailChallenge.findMany.mockResolvedValue([]);
  mockDb.guestEmailChallenge.create.mockImplementation(({ data }) => challenges.set(data.id, { ...data, attempts: 0 }));
  mockDb.guestEmailChallenge.findUnique.mockImplementation(({ where }) => challenges.get(where.id));
  mockDb.guestEmailChallenge.updateMany.mockImplementation(({ where, data }) => {
    const challenge = challenges.get(where.id);
    if (!challenge || where.propertyId !== challenge.propertyId || (where.email && where.email !== challenge.email)) return { count: 0 };
    if (data.setupUsedAt) {
      if (!challenge.consumedAt || challenge.setupUsedAt) return { count: 0 };
      challenge.setupUsedAt = data.setupUsedAt;
    } else {
      if (challenge.consumedAt || challenge.attempts >= 5 || challenge.expiresAt <= where.expiresAt.gt) return { count: 0 };
      challenge.attempts++;
      if (data.consumedAt) challenge.consumedAt = data.consumedAt;
    }
    return { count: 1 };
  });
  mockDb.hotelGuestAccount.upsert.mockImplementation(({ create, update }) => {
    const previous = accounts.get(create.propertyId);
    const account = { ...create, passwordHash: update.passwordHash, sessionVersion: (previous?.sessionVersion ?? 0) + 1,
      platformGuest: profile, property: hotel(create.propertyId) };
    accounts.set(create.propertyId, account);
    return account;
  });
  mockDb.hotelGuestAccount.findUnique.mockImplementation(({ where }) => accounts.get(where.propertyId_email.propertyId));
  mockDb.reservation.count.mockResolvedValue(0);
  mockDb.reservation.findMany.mockResolvedValue([]);
  mockSend.mockResolvedValue({ data: { id: 'mock-email' } });
});

const authPost = (path: string, origin: string, data: object) =>
  request(app).post(`/public/auth/${path}`).set('Origin', origin).send(data);

async function getCode(origin: string) {
  const result = await authPost('email/request', origin, { email: ' GUEST@EXAMPLE.COM ' });
  expect(result.status).toBe(200);
  expect(result.body.data.testCode).toBeUndefined();
  const message = mockSend.mock.lastCall?.[0];
  expect(message.to).toEqual([email]);
  return { challengeId: result.body.data.challengeId, code: message.text.match(/\d{6}/)[0] };
}

async function hotelSetup(origin: string, password: string) {
  const verified = await authPost('email/verify', origin, await getCode(origin));
  expect(verified.status).toBe(200);
  expect(verified.body.data.needsPassword).toBe(true);
  const setupToken = verified.body.data.setupToken;
  const result = await authPost('hotel/complete', origin, { setupToken, password });
  expect(result.status).toBe(200);
  return { token: result.body.data.token as string, setupToken };
}

function guestRequest(method: 'get' | 'post', path: string, token: string, origin?: string) {
  const call = request(app)[method](`/public${path}`).set('Authorization', `Bearer ${token}`);
  return origin ? call.set('Origin', origin) : call;
}

describe('guest authentication by website', () => {
  it('keeps marketplace email sign-in and uses the same guest ID to book either hotel', async () => {
    const verified = await authPost('email/verify', central, await getCode(central));
    expect(verified.status).toBe(200);
    const token = verified.body.data.token;
    expect(jwt.decode(token)).toMatchObject({ type: 'central_guest', platformGuestId: 7 });
    mockCreateBooking.mockResolvedValue({ reservationId });
    for (const path of ['hotel-one', 'hotel-two']) {
      expect((await guestRequest('post', `/${path}/reservations`, token, central).send({ roomTypeId: 3 })).status).toBe(201);
    }
    expect(mockCreateBooking).toHaveBeenNthCalledWith(2, expect.objectContaining({ propertyId: 2, platformGuestId: 7, source: 'Website' }), true);
    expect((await guestRequest('get', '/reservations', token, hotelOne)).status).toBe(401);
    expect((await guestRequest('get', '/reservations', token, central)).status).toBe(200);
    expect(mockDb.reservation.findMany.mock.lastCall?.[0].where).toEqual({ platformGuestId: 7, source: 'Website' });
  });

  it('requires the right hotel for OTPs and maintains independent passwords and reset sessions', async () => {
    const challenge = await getCode(hotelOne);
    expect((await authPost('email/verify', hotelTwo, challenge)).status).toBe(400);
    const verified = await authPost('email/verify', hotelOne, challenge);
    const setup = { setupToken: verified.body.data.setupToken, password: 'Hotel one secret' };
    expect((await authPost('hotel/complete', hotelTwo, setup)).status).toBe(401);
    const first = await authPost('hotel/complete', hotelOne, setup);
    expect(first.status).toBe(200);
    expect((await authPost('hotel/complete', hotelOne, setup)).status).toBe(409);
    await hotelSetup(hotelTwo, 'Hotel two secret');
    expect((await authPost('hotel/login', hotelTwo, { email, password: setup.password })).status).toBe(401);
    expect((await authPost('hotel/login', hotelTwo, { email, password: 'Hotel two secret' })).status).toBe(200);
    expect((await authPost('hotel/login', hotelOne, { email, password: setup.password })).status).toBe(200);
    await hotelSetup(hotelOne, 'New hotel one secret');
    expect((await guestRequest('get', '/reservations', first.body.data.token, hotelOne)).status).toBe(401);
    expect((await authPost('hotel/login', hotelOne, { email, password: setup.password })).status).toBe(401);
    expect((await authPost('hotel/login', hotelOne, { email, password: 'New hotel one secret' })).status).toBe(200);
    expect((await authPost('hotel/login', hotelTwo, { email, password: 'Hotel two secret' })).status).toBe(200);
  });

  it('hosts new guest registration only after email proof', async () => {
    mockDb.platformGuest.findMany.mockResolvedValue([]);
    mockDb.platformGuest.create.mockResolvedValue(profile);
    const verified = await authPost('email/verify', hotelOne, await getCode(hotelOne));
    expect(verified.body.data.needsName).toBe(true);
    const setup = { setupToken: verified.body.data.setupToken, password: 'Hotel one secret' };
    expect((await authPost('hotel/complete', hotelOne, setup)).status).toBe(400);
    expect((await authPost('hotel/complete', hotelOne, { ...setup, fullName: profile.fullName, phone: profile.phone })).status).toBe(200);
    expect(mockDb.platformGuest.create).toHaveBeenCalledWith({ data: { email, fullName: profile.fullName, phone: profile.phone, isEmailVerified: true } });
  });

  it('keeps central registration behind a valid, single-use email code', async () => {
    mockDb.platformGuest.findMany.mockResolvedValue([]);
    mockDb.platformGuest.create.mockResolvedValue(profile);
    const challenge = await getCode(central);
    const wrong = challenge.code === '000000' ? '111111' : '000000';
    expect((await authPost('email/verify', central, { ...challenge, code: wrong })).status).toBe(400);
    const verified = await authPost('email/verify', central, challenge);
    expect(verified.body.data.needsName).toBe(true);
    expect((await authPost('email/verify', central, challenge)).status).toBe(400);
    const setup = { setupToken: verified.body.data.setupToken, fullName: profile.fullName, phone: profile.phone };
    expect((await authPost('email/complete', hotelOne, setup)).status).toBe(401);
    const complete = await authPost('email/complete', central, setup);
    expect(complete.status).toBe(201);
    expect(jwt.decode(complete.body.data.token)).toMatchObject({ type: 'central_guest', platformGuestId: 7 });
    expect(mockDb.hotelGuestAccount.upsert).not.toHaveBeenCalled();
  });

  it('scopes reservation lists, booking creation, cancellation and every browser payment endpoint', async () => {
    const { token } = await hotelSetup(hotelOne, 'Hotel one secret');
    expect((await guestRequest('get', '/reservations', token)).status).toBe(200);
    expect(mockDb.reservation.findMany.mock.lastCall?.[0].where).toEqual({ propertyId: 1, platformGuestId: 7, source: 'Website' });
    expect((await guestRequest('get', '/reservations?siteHostname=hotel-two.example', token)).status).toBe(404);
    expect((await guestRequest('get', '/reservations', token, hotelTwo)).status).toBe(401);
    expect((await guestRequest('post', '/hotel-two/reservations', token).send({ roomTypeId: 3 })).status).toBe(404);
    expect((await guestRequest('post', '/hotel-two/payments/initialize', token).send({ reservationId })).status).toBe(404);
    expect((await guestRequest('get', `/hotel-two/reservations/${reservationId}/payment-status`, token)).status).toBe(404);
    expect((await guestRequest('get', `/hotel-two/payments/verify/${reference}`, token)).status).toBe(404);
    expect(mockInitialize).not.toHaveBeenCalled();
    expect(mockStatus).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
    mockCreateBooking.mockResolvedValue({ reservationId });
    expect((await guestRequest('post', '/hotel-one/reservations', token, hotelOne).send({ roomTypeId: 3 })).status).toBe(201);
    expect(mockCreateBooking).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 1, platformGuestId: 7 }), true);
    mockInitialize.mockResolvedValue({ status: 'pending' });
    expect((await guestRequest('post', '/hotel-one/payments/initialize', token, hotelOne).send({ reservationId, siteHostname: 'hotel-two.example' })).status).toBe(200);
    expect(mockInitialize).toHaveBeenCalledWith('hotel-one', reservationId, profile, 'hotel-one.example', undefined);
    expect((await guestRequest('get', `/hotel-one/payments/verify/${reference}`, token)).status).toBe(404);
    mockDb.reservation.findFirst.mockResolvedValue({ reservationId });
    mockVerify.mockResolvedValue({ status: 'success', data: { confirmationCode: 'BOOKED', customer: { email } } });
    const paid = await guestRequest('get', `/hotel-one/payments/verify/${reference}`, token);
    expect(paid.body.data).toEqual({ confirmationCode: 'BOOKED' });
    expect(mockDb.reservation.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { reservationId, platformGuestId: 7, source: 'Website', property: { propertyCode: 'hotel-one' } } }));
    mockCancel.mockRejectedValue(Object.assign(new Error('Reservation not found.'), { statusCode: 404 }));
    expect((await guestRequest('post', `/reservations/${reservationId}/cancel`, token).send({ reason: 'Trip cancelled' })).status).toBe(404);
    expect(mockCancel).toHaveBeenCalledWith(reservationId, 7, 'Trip cancelled', 1);
  });
});
