import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import axios from 'axios';
import request from 'supertest';
import app from '../src/app';
import * as subscriptionService from '../src/modules/payment/subscription.service';
import { prisma } from '../src/shared/utils/prisma';
import { verifyGuestPayment } from '../src/modules/payment/guest-payment.service';
import { processMoolreWebhook } from '../src/modules/payment/moolre-webhook.service';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../src/modules/payment/subscription.service', () => ({ processSubscriptionWebhook: jest.fn() }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {
  property: { findUnique: jest.fn() }, payment: { findFirst: jest.fn() }, $transaction: jest.fn(),
  guestPaymentAttempt: { findUnique: jest.fn(), updateMany: jest.fn() },
} }));

const reservationId = 'test-reservation';
const reference = `RES-${reservationId}-1`;
const secret = 'whsec_fixture';
const keys = { moolreUsername: 'hotel-user', moolrePublicKey: 'pub-fixture', moolreAccountNumber: '10203040', moolreWebhookSecret: secret };
const statusOk = (over: any = {}) => ({ data: { status: 1, code: 'SS01', message: 'Transaction Successful', data: { txstatus: 1, amount: '200', externalref: reference, ...over } } });
const body = (over: any = {}) => Buffer.from(JSON.stringify({ status: 1, code: 'P01', event_id: 'evt_1', event: 'payment.succeeded', data: { txstatus: 1, amount: '200.00', externalref: reference }, ...over }));
const signature = (raw: Buffer, key = secret, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${createHmac('sha256', key).update(`${t}.`).update(raw).digest('hex')}`;
const savedAttempt = { reference, reservationId, amount: 200, currency: 'GHS', reservation: { propertyId: 1, property: { propertyCode: 'hotel-test', ...keys } } };
const tx = {
  refund: { count: jest.fn<any>() },
  property: { findUnique: jest.fn<any>() },
  room: { findMany: jest.fn<any>() },
  $queryRaw: jest.fn<any>(),
  reservation: { findUniqueOrThrow: jest.fn<any>(), update: jest.fn<any>() },
  payment: { findFirst: jest.fn<any>(), create: jest.fn<any>() },
  reservationRoom: { updateMany: jest.fn<any>(), findMany: jest.fn<any>(), findFirst: jest.fn<any>(), update: jest.fn<any>() },
  auditLog: { create: jest.fn<any>() },
  guestPaymentAttempt: { findUnique: jest.fn<any>(), updateMany: jest.fn<any>() },
};

beforeEach(() => {
  jest.resetAllMocks();
  tx.refund.count.mockResolvedValue(0);
  (prisma.property.findUnique as any).mockResolvedValue({ propertyId: 1, propertyCode: 'hotel-test', currency: 'GHS', ...keys });
  (prisma.guestPaymentAttempt.findUnique as any).mockResolvedValue(savedAttempt);
  (axios.post as any).mockResolvedValue(statusOk());
  (prisma.$transaction as any).mockImplementation((callback: any) => callback(tx));
  tx.$queryRaw.mockResolvedValue([{ reservationId }]);
  tx.reservation.findUniqueOrThrow.mockResolvedValue({ confirmationCode: 'ABC', status: 'InHouse' });
  tx.payment.findFirst.mockResolvedValue(null);
  tx.property.findUnique.mockResolvedValue(null);
  tx.guestPaymentAttempt.findUnique.mockResolvedValue(savedAttempt);
  (prisma.payment.findFirst as any).mockResolvedValue(null);
});

describe('guest payment webhook recovery', () => {
  it('keeps a refunded expired booking released when another late payment arrives', async () => {
    tx.reservation.findUniqueOrThrow.mockResolvedValue({ reservationId, propertyId: 1, checkInDate: new Date('2030-01-01'), confirmationCode: 'ABC', status: 'Expired', source: 'Website', amountPaid: 0, totalAmount: 200 });
    tx.refund.count.mockResolvedValue(1);
    const result = await verifyGuestPayment('hotel-test', reference);
    expect(result.data.bookingStatus).toBe('Expired');
    expect(tx.reservationRoom.update).not.toHaveBeenCalled();
    expect(tx.reservationRoom.updateMany).toHaveBeenCalledWith({ where: { reservationId, status: 'Reserved' }, data: { status: 'Cancelled' } });
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 }, status: 'Expired' } }); // online payments are non-refundable: never marked as refund due
  });
  it('restores an expired allocation only when matching inventory is available', async () => {
    const hold = { reservationId, propertyId: 1, checkInDate: new Date('2030-01-01'), confirmationCode: 'ABC', status: 'Expired', source: 'Website', amountPaid: 0, totalAmount: 200 };
    tx.reservation.findUniqueOrThrow.mockResolvedValue(hold);
    tx.property.findUnique.mockResolvedValue({ isActive: true, status: 'Active', isOnlineBookingEnabled: true });
    tx.reservationRoom.findMany.mockResolvedValue([{ reservationRoomId: 1, roomId: 1, roomTypeId: 1, status: 'Cancelled', checkInDate: new Date('2030-01-01'), checkOutDate: new Date('2030-01-02') }]);
    tx.room.findMany.mockResolvedValue([{ roomId: 2, roomTypeId: 1, roomNumber: '102' }]);
    tx.reservationRoom.findFirst.mockResolvedValue(null);
    const result = await verifyGuestPayment('hotel-test', reference);
    expect(result.data.bookingStatus).toBe('Confirmed');
    expect(result.data.requiresRefundReview).toBe(false);
    expect(tx.reservationRoom.update).toHaveBeenCalledWith({ where: { reservationRoomId: 1 }, data: { roomId: 2, roomNumberSnapshot: '102', status: 'Reserved' } });
    tx.reservationRoom.findFirst.mockResolvedValue({ reservationRoomId: 2 });
    const unavailable = await verifyGuestPayment('hotel-test', reference);
    expect(unavailable.data.bookingStatus).toBe('Expired');
    expect(unavailable.data.requiresRefundReview).toBe(true);
  });
  it('recovers a committed payment even when provider verification is unavailable', async () => {
    (prisma.payment.findFirst as any).mockResolvedValue({ reservationId, amount: 200, paymentMethod: 'MobileMoney', reservation: { confirmationCode: 'ABC', status: 'Confirmed', refundStatus: 'None' } });
    const result = await verifyGuestPayment('hotel-test', reference);
    expect(result.status).toBe('success'); expect(result.data.amount).toBe(20000);
    expect(axios.post).not.toHaveBeenCalled(); expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('rejects absent/raw-body-invalid, forged and stale signatures before verification', async () => {
    await expect(processMoolreWebhook({}, signature(body()))).rejects.toMatchObject({ statusCode: 400 });
    await expect(processMoolreWebhook(body(), undefined)).rejects.toMatchObject({ statusCode: 401 });
    await expect(processMoolreWebhook(body(), signature(body(), 'wrong-key'))).rejects.toMatchObject({ statusCode: 401 });
    await expect(processMoolreWebhook(body(), signature(body(), secret, Math.floor(Date.now() / 1000) - 600))).rejects.toMatchObject({ statusCode: 401 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('re-verifies with the hotel keys and settles within a transaction without resetting stay status', async () => {
    await processMoolreWebhook(body(), signature(body()));
    expect(axios.post).toHaveBeenCalledWith('https://sandbox.moolre.com/open/transact/status',
      { type: 1, idtype: '1', id: reference, accountnumber: '10203040' },
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-USER': 'hotel-user', 'X-API-PUBKEY': 'pub-fixture' }) }));
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reservationId, amount: 200, gatewayReference: reference, paymentMethod: 'MobileMoney', verifiedProvider: 'Moolre' }) }));
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 } } });
  });

  it('does not credit a repeated reference again, including a browser verification', async () => {
    tx.payment.findFirst.mockResolvedValue({ reservationId, amount: 200 });
    await processMoolreWebhook(body(), signature(body()));
    const result = await verifyGuestPayment('hotel-test', reference);
    expect(result.data.confirmationCode).toBe('ABC');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it('propagates provider and database failures instead of acknowledging success', async () => {
    (axios.post as any).mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(processMoolreWebhook(body(), signature(body()))).rejects.toThrow('provider unavailable');
    (axios.post as any).mockResolvedValueOnce({ data: { status: 0, code: 'SS00', message: 'auth' } });
    await expect(processMoolreWebhook(body(), signature(body()))).rejects.toMatchObject({ statusCode: 502 });
    tx.reservation.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(processMoolreWebhook(body(), signature(body()))).rejects.toThrow('database unavailable');
  });

  it('rejects a different hotel, amount, reference, unknown attempt, or missing reservation', async () => {
    for (const invalid of [statusOk({ amount: '199.99' }), statusOk({ amount: undefined }), statusOk({ externalref: 'RES-other-1' })]) {
      (axios.post as any).mockResolvedValueOnce(invalid);
      await expect(verifyGuestPayment('hotel-test', reference)).rejects.toThrow();
    }
    (prisma.guestPaymentAttempt.findUnique as any).mockResolvedValueOnce({ ...savedAttempt, reservation: { propertyId: 2 } });
    await expect(verifyGuestPayment('hotel-test', reference)).rejects.toMatchObject({ statusCode: 404 });
    (prisma.guestPaymentAttempt.findUnique as any).mockResolvedValueOnce(null);
    await expect(verifyGuestPayment('hotel-test', reference)).rejects.toMatchObject({ statusCode: 404 });
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(verifyGuestPayment('hotel-test', reference)).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('never records pending, failed or unknown transactions as paid', async () => {
    (axios.post as any).mockResolvedValueOnce({ data: { status: '0', code: 'SS08', data: { txstatus: 0, externalref: reference } } });
    expect((await verifyGuestPayment('hotel-test', reference)).status).toBe('pending');
    (axios.post as any).mockResolvedValueOnce({ data: { status: 0, code: 'SS02', data: { txstatus: 2, externalref: reference } } });
    expect((await verifyGuestPayment('hotel-test', reference)).status).toBe('failed');
    (axios.post as any).mockResolvedValueOnce({ data: { status: 0, code: 'SS07', data: null } });
    expect((await verifyGuestPayment('hotel-test', reference)).status).toBe('not_found');
    (axios.post as any).mockResolvedValueOnce({ data: { status: '1', code: 'SS01', data: { txstatus: '0' } } });
    expect((await verifyGuestPayment('hotel-test', reference)).status).toBe('pending');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('flags late cancelled-booking payments for refund without resurrecting the booking', async () => {
    tx.reservation.findUniqueOrThrow.mockResolvedValueOnce({ confirmationCode: 'ABC', status: 'Cancelled' });
    await processMoolreWebhook(body(), signature(body()));
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 } } }); // online payments are non-refundable: never marked as refund due
  });

  it('confirms a timely hold and sends an expired hold to refund review when its hotel is unavailable', async () => {
    const hold = { confirmationCode: 'ABC', status: 'Pending', source: 'Website', platformGuestId: 1, staffId: null, amountPaid: 0, createdAt: new Date() };
    tx.reservation.findUniqueOrThrow.mockResolvedValueOnce(hold);
    const timely = await verifyGuestPayment('hotel-test', reference);
    expect(timely.data.bookingStatus).toBe('Confirmed');
    expect(timely.data.requiresRefundReview).toBe(false);
    tx.reservation.findUniqueOrThrow.mockResolvedValueOnce({ ...hold, createdAt: new Date(Date.now() - 11 * 60000) });
    const late = await verifyGuestPayment('hotel-test', reference);
    expect(late.data.bookingStatus).toBe('Expired');
    expect(late.data.requiresRefundReview).toBe(true);
    expect(tx.reservationRoom.updateMany).toHaveBeenCalledWith({ where: { reservationId, status: 'Reserved' }, data: { status: 'Cancelled' } });
    expect(tx.reservation.update).toHaveBeenLastCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 }, status: 'Expired' } }); // online payments are non-refundable: never marked as refund due
  });

  it('retries when a signed success event is not yet successful on verification', async () => {
    (axios.post as any).mockResolvedValueOnce({ data: { status: 0, code: 'SS08', data: { txstatus: 0 } } });
    await expect(processMoolreWebhook(body(), signature(body()))).rejects.toMatchObject({ statusCode: 503 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('marks the attempt failed only when Moolre confirms the failure', async () => {
    const failed = body({ status: 0, code: 'P02', event: 'payment.failed', data: { txstatus: 2, amount: '0', externalref: reference } });
    (axios.post as any).mockResolvedValueOnce({ data: { status: 0, code: 'SS02', data: { txstatus: 2 } } });
    await processMoolreWebhook(failed, signature(failed));
    expect(prisma.guestPaymentAttempt.updateMany).toHaveBeenCalledWith({ where: { reference, status: { not: 'Completed' } }, data: { status: 'Failed' } });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('mounts the raw-body webhook and returns retryable failures', async () => {
    const raw = body();
    const send = (sig: string) => request(app).post('/api/payments/webhooks/moolre')
      .set('Content-Type', 'application/json').set('x-moolre-signature', sig).send(raw.toString());
    expect((await send(signature(raw))).status).toBe(200);
    expect((await send(signature(raw, 'wrong-key'))).status).toBe(401);
    (axios.post as any).mockRejectedValueOnce(new Error('temporary provider failure'));
    expect((await send(signature(raw))).status).toBe(500);
  });

  it('routes signed subscription callbacks with the platform secret only', async () => {
    const saved = { ...process.env };
    Object.assign(process.env, { MOOLRE_USER: 'platform', MOOLRE_PUBKEY: 'pk', MOOLRE_ACCOUNT: '999', MOOLRE_WEBHOOK_SECRET: 'platform-secret' });
    try {
      (subscriptionService.processSubscriptionWebhook as any).mockResolvedValue({ status: 'success' });
      const sub = body({ data: { txstatus: 1, amount: '350.00', externalref: 'SUB-5-x' } });
      const send = (sig: string) => request(app).post('/api/payments/webhooks/moolre').set('Content-Type', 'application/json')
        .set('x-moolre-signature', sig).send(sub.toString());
      expect((await send(signature(sub, 'platform-secret'))).status).toBe(200);
      expect(subscriptionService.processSubscriptionWebhook).toHaveBeenCalledWith('SUB-5-x');
      expect((await send(signature(sub, secret))).status).toBe(401);
    } finally {
      for (const k of ['MOOLRE_USER', 'MOOLRE_PUBKEY', 'MOOLRE_ACCOUNT', 'MOOLRE_WEBHOOK_SECRET']) {
        if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
      }
    }
  });
});
