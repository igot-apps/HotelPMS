import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createHmac } from 'node:crypto';
import axios from 'axios';
import request from 'supertest';
import app from '../src/app';
import * as subscriptionService from '../src/modules/payment/subscription.service';
import { prisma } from '../src/shared/utils/prisma';
import { processGuestPaymentWebhook, verifyGuestPayment } from '../src/modules/payment/guest-payment.service';

jest.mock('axios', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../src/modules/payment/subscription.service', () => ({ processSubscriptionWebhook: jest.fn() }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {
  property: { findUnique: jest.fn() }, $transaction: jest.fn(),
} }));

const reservationId = 'test-reservation';
const reference = `RES-${reservationId}-1`;
const secret = 'sk_test_fixture';
const transaction = { reference, status: 'success', currency: 'GHS', amount: 20000, channel: 'mobile_money', metadata: { propertyCode: 'hotel-test', reservationId } };
const body = () => Buffer.from(JSON.stringify({ event: 'charge.success', data: transaction }));
const signature = (raw: Buffer, key = secret) => createHmac('sha512', key).update(raw).digest('hex');
const tx = {
  $queryRaw: jest.fn<any>(),
  reservation: { findUniqueOrThrow: jest.fn<any>(), update: jest.fn<any>() },
  payment: { findFirst: jest.fn<any>(), create: jest.fn<any>() },
};

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.property.findUnique as any).mockResolvedValue({ propertyId: 1, propertyCode: 'hotel-test', currency: 'GHS', paystackSecretKey: secret });
  (axios.get as any).mockResolvedValue({ data: { status: true, data: transaction } });
  (prisma.$transaction as any).mockImplementation((callback: any) => callback(tx));
  tx.$queryRaw.mockResolvedValue([{ reservationId }]);
  tx.reservation.findUniqueOrThrow.mockResolvedValue({ confirmationCode: 'ABC', status: 'InHouse' });
  tx.payment.findFirst.mockResolvedValue(null);
});

describe('guest payment webhook recovery', () => {
  it('rejects absent/raw-body-invalid and forged signatures before verification', async () => {
    await expect(processGuestPaymentWebhook({}, signature(body()))).rejects.toMatchObject({ statusCode: 401 });
    await expect(processGuestPaymentWebhook(body(), undefined)).rejects.toMatchObject({ statusCode: 401 });
    await expect(processGuestPaymentWebhook(body(), signature(body(), 'wrong-key'))).rejects.toMatchObject({ statusCode: 401 });
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('re-verifies with the property key and settles within a transaction without resetting stay status', async () => {
    await processGuestPaymentWebhook(body(), signature(body()));
    expect(axios.get).toHaveBeenCalledWith(expect.stringContaining(reference), expect.objectContaining({ headers: { Authorization: `Bearer ${secret}` } }));
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reservationId, amount: 200, gatewayReference: reference }) }));
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 } } });
  });

  it('does not credit a repeated reference again, including a browser verification', async () => {
    tx.payment.findFirst.mockResolvedValue({ reservationId, amount: 200 });
    await processGuestPaymentWebhook(body(), signature(body()));
    const result = await verifyGuestPayment('hotel-test', reference);
    expect(result.data.confirmationCode).toBe('ABC');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it('propagates provider and database failures instead of acknowledging success', async () => {
    (axios.get as any).mockRejectedValueOnce(new Error('provider unavailable'));
    await expect(processGuestPaymentWebhook(body(), signature(body()))).rejects.toThrow('provider unavailable');
    tx.reservation.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(processGuestPaymentWebhook(body(), signature(body()))).rejects.toThrow('database unavailable');
  });

  it('rejects a different hotel, currency, amount, reference, or missing reservation', async () => {
    for (const invalid of [
      { ...transaction, metadata: { ...transaction.metadata, propertyCode: 'other-hotel' } },
      { ...transaction, currency: 'USD' }, { ...transaction, amount: -1 },
      { ...transaction, reference: 'wrong-reference' },
    ]) {
      (axios.get as any).mockResolvedValueOnce({ data: { status: true, data: invalid } });
      await expect(verifyGuestPayment('hotel-test', reference)).rejects.toThrow();
    }
    tx.$queryRaw.mockResolvedValueOnce([]);
    await expect(verifyGuestPayment('hotel-test', reference)).rejects.toMatchObject({ statusCode: 404 });
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('flags late cancelled-booking payments for refund without resurrecting the booking', async () => {
    tx.reservation.findUniqueOrThrow.mockResolvedValueOnce({ confirmationCode: 'ABC', status: 'Cancelled' });
    await processGuestPaymentWebhook(body(), signature(body()));
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 }, refundDue: { increment: 200 }, refundStatus: 'Pending' } });
  });

  it('retries when a signed success event is not yet successful on verification', async () => {
    (axios.get as any).mockResolvedValueOnce({ data: { status: true, data: { ...transaction, status: 'pending' } } });
    await expect(processGuestPaymentWebhook(body(), signature(body()))).rejects.toMatchObject({ statusCode: 503 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('acknowledges signed unrelated event types without creating a payment', async () => {
    const raw = Buffer.from(JSON.stringify({ event: 'refund.processed', data: transaction }));
    await processGuestPaymentWebhook(raw, signature(raw));
    expect(axios.get).not.toHaveBeenCalled();
  });

  it('mounts raw-body guest webhooks on both API aliases and returns retryable failures', async () => {
    const raw = body();
    for (const prefix of ['/api/paystack', '/api/payments']) {
      const send = (sig: string) => request(app).post(`${prefix}/webhooks/guest-bookings`)
        .set('Content-Type', 'application/json').set('x-paystack-signature', sig).send(raw.toString());
      expect((await send(signature(raw))).status).toBe(200);
      expect((await send(signature(raw, 'wrong-key'))).status).toBe(401);
      (axios.get as any).mockRejectedValueOnce(new Error('temporary provider failure'));
      expect((await send(signature(raw))).status).toBe(500);
    }
  });

  it('keeps shared-account guest and subscription webhook routing compatible', async () => {
    const previous = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = secret;
    try {
      const raw = body();
      expect((await request(app).post('/api/paystack/webhooks/platform')
        .set('Content-Type', 'application/json').set('x-paystack-signature', signature(raw)).send(raw.toString())).status).toBe(200);
      const sub = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'SUB-test', metadata: { purpose: 'hotel_pms_subscription' } } }));
      for (const endpoint of ['platform', 'guest-bookings']) {
        expect((await request(app).post(`/api/paystack/webhooks/${endpoint}`)
          .set('Content-Type', 'application/json').set('x-paystack-signature', signature(sub)).send(sub.toString())).status).toBe(200);
      }
      expect(subscriptionService.processSubscriptionWebhook).toHaveBeenCalledTimes(2);
    } finally {
      if (previous === undefined) delete process.env.PAYSTACK_SECRET_KEY;
      else process.env.PAYSTACK_SECRET_KEY = previous;
    }
  });
});
