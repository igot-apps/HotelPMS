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
  property: { findUnique: jest.fn() }, payment: { findFirst: jest.fn() }, $transaction: jest.fn(),
} }));

const reservationId = 'test-reservation';
const reference = `RES-${reservationId}-1`;
const secret = 'sk_test_fixture';
const transaction = { reference, status: 'success', currency: 'GHS', amount: 20000, channel: 'mobile_money', metadata: { propertyCode: 'hotel-test', reservationId } };
const body = () => Buffer.from(JSON.stringify({ event: 'charge.success', data: transaction }));
const signature = (raw: Buffer, key = secret) => createHmac('sha512', key).update(raw).digest('hex');
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
  (prisma.property.findUnique as any).mockResolvedValue({ propertyId: 1, propertyCode: 'hotel-test', currency: 'GHS', paystackSecretKey: secret });
  (axios.get as any).mockResolvedValue({ data: { status: true, data: transaction } });
  (prisma.$transaction as any).mockImplementation((callback: any) => callback(tx));
  tx.$queryRaw.mockResolvedValue([{ reservationId }]);
  tx.reservation.findUniqueOrThrow.mockResolvedValue({ confirmationCode: 'ABC', status: 'InHouse' });
  tx.payment.findFirst.mockResolvedValue(null);
  tx.property.findUnique.mockResolvedValue(null);
  tx.guestPaymentAttempt.findUnique.mockResolvedValue(null);
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
    expect(tx.reservation.update).toHaveBeenCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 }, status: 'Expired', refundDue: { increment: 200 }, refundStatus: 'Pending' } });
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
    (prisma.payment.findFirst as any).mockResolvedValue({ reservationId, amount: 200, paymentMethod: 'Card', reservation: { confirmationCode: 'ABC', status: 'Confirmed', refundStatus: 'None' } });
    const result = await verifyGuestPayment('hotel-test', reference);
    expect(result.status).toBe('success'); expect(result.data.amount).toBe(20000);
    expect(axios.get).not.toHaveBeenCalled(); expect(tx.payment.create).not.toHaveBeenCalled();
  });
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
    expect(tx.reservation.update).toHaveBeenLastCalledWith({ where: { reservationId }, data: { amountPaid: { increment: 200 }, status: 'Expired', refundDue: { increment: 200 }, refundStatus: 'Pending' } });
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
