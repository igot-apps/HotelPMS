import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import axios from 'axios';
import { prisma } from '../src/shared/utils/prisma';
import { initializeGuestPayment, submitGuestPaymentOtp } from '../src/modules/payment/guest-payment-attempt.service';
import { normalizeChannel, normalizePayer } from '../src/modules/payment/moolre.client';

jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../src/modules/reservation/online-hold.service', () => ({ isExpiredOnlineHold: () => false }));
jest.mock('../src/modules/reservation/public-booking-policy', () => ({ canBookOnline: () => true, publicBookingFields: {}, OnlineBookingPausedError: class extends Error {} }));
jest.mock('../src/modules/payment/guest-payment.service', () => ({
  paymentConfiguration: jest.fn(async () => ({ property: { propertyId: 1, currency: 'GHS' }, moolre: { user: 'u', pubkey: 'pk', account: '10203040' } })),
  verifyGuestPayment: jest.fn(),
}));
const tx: any = {
  $queryRaw: jest.fn(), reservation: { findUniqueOrThrow: jest.fn() }, property: { findUniqueOrThrow: jest.fn() },
  guestPaymentAttempt: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
};
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {
  reservation: { findFirst: jest.fn() },
  guestPaymentAttempt: { findFirst: jest.fn(), updateMany: jest.fn() },
  $transaction: jest.fn(),
} }));

const reference = 'RES-r1-abc';
const attempt = { attemptId: 7, reference, amount: 200, payer: '0240000111', channel: 'MTN', status: 'OtpRequired', updatedAt: new Date() };
const booking = { reservationId: 'r1', status: 'Pending', totalAmount: 200, amountPaid: 0, refundDue: 0, refundStatus: 'None', confirmationCode: 'ABC' };
const reply = (code: string, status = 1) => ({ data: { status, code, message: code } });
const post = axios.post as any;
const updates = () => (prisma.guestPaymentAttempt.updateMany as any).mock.calls.map((c: any) => c[0]);

beforeEach(() => {
  jest.clearAllMocks();
  post.mockReset();
  (prisma.reservation.findFirst as any).mockResolvedValue(booking);
  (prisma.guestPaymentAttempt.findFirst as any).mockResolvedValue(attempt);
  (prisma.guestPaymentAttempt.updateMany as any).mockResolvedValue({ count: 1 });
  (prisma.$transaction as any).mockImplementation((fn: any) => fn(tx));
  tx.$queryRaw.mockResolvedValue([{ reservationId: 'r1' }]);
  tx.reservation.findUniqueOrThrow.mockResolvedValue(booking);
  tx.property.findUniqueOrThrow.mockResolvedValue({});
  tx.guestPaymentAttempt.findFirst.mockResolvedValue(null);
  tx.guestPaymentAttempt.create.mockImplementation(({ data }: any) => ({ attemptId: 8, ...data }));
});

describe('Moolre guest payment flow', () => {
  it('normalises Ghana numbers and networks', () => {
    expect(normalizePayer('+233 24 000 0111')).toBe('0240000111');
    expect(normalizePayer('233240000111')).toBe('0240000111');
    expect(normalizePayer('24000011')).toBeNull();
    expect(normalizeChannel('vodafone')).toBe('TELECEL');
    expect(normalizeChannel('card')).toBeNull();
  });

  it('rejects a bad number before touching the booking or Moolre', async () => {
    await expect(initializeGuestPayment('h', 'r1', { guestId: 1 }, { phone: '123', network: 'MTN' })).rejects.toThrow('10-digit');
    await expect(initializeGuestPayment('h', 'r1', { guestId: 1 }, { phone: '0240000111', network: 'VISA' })).rejects.toThrow('network');
    expect(post).not.toHaveBeenCalled();
  });

  it('saves the attempt before contacting Moolre and asks for the SMS code', async () => {
    (prisma.guestPaymentAttempt.findFirst as any).mockResolvedValue(null);
    post.mockResolvedValueOnce(reply('TP14'));
    const result: any = await initializeGuestPayment('h', 'r1', { guestId: 1 }, { phone: '0240000111', network: 'MTN' });
    expect(result.status).toBe('otp_required');
    const created = tx.guestPaymentAttempt.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ reservationId: 'r1', amount: 200, currency: 'GHS', payer: '0240000111', channel: 'MTN' });
    expect(post.mock.calls[0][1]).toEqual({ type: 1, channel: 'MTN', currency: 'GHS', payer: '0240000111', amount: '200.00', externalref: created.reference, accountnumber: '10203040' });
    expect(post.mock.calls[0][2].headers['Idempotency-Key']).toBeUndefined();
    expect(updates()).toContainEqual({ where: { attemptId: 8, status: { in: ['Initializing'] } }, data: { status: 'OtpRequired' } });
  });

  it('verifies the code, then resends the identical body with the reference as Idempotency-Key', async () => {
    post.mockResolvedValueOnce(reply('TP17')).mockResolvedValueOnce(reply('TR099'));
    const result: any = await submitGuestPaymentOtp('h', 'r1', { guestId: 1 }, '123456');
    expect(result.status).toBe('pending');
    const [first, second] = post.mock.calls;
    expect(first[1].otpcode).toBe('123456');
    const { otpcode, ...original } = first[1]; void otpcode;
    expect(second[1]).toEqual(original);
    expect(second[2].headers['Idempotency-Key']).toBe(reference);
    expect(updates()).toEqual([
      { where: { attemptId: 7, status: 'OtpRequired' }, data: { status: 'Verifying' } },
      { where: { attemptId: 7, status: { in: ['Verifying'] } }, data: { status: 'Pending' } },
    ]);
  });

  it('a wrong code goes back to waiting for a code and sends no prompt', async () => {
    post.mockResolvedValueOnce(reply('TP15', 0));
    const result: any = await submitGuestPaymentOtp('h', 'r1', { guestId: 1 }, '000000');
    expect(result.status).toBe('otp_required');
    expect(post).toHaveBeenCalledTimes(1);
    expect(updates()[1]).toEqual({ where: { attemptId: 7, status: { in: ['Verifying'] } }, data: { status: 'OtpRequired' } });
  });

  it('a lost reply or unknown code is Unknown, never Failed', async () => {
    post.mockResolvedValueOnce(reply('TP17')).mockRejectedValueOnce(new Error('socket hang up'));
    expect(((await submitGuestPaymentOtp('h', 'r1', { guestId: 1 }, '123456')) as any).status).toBe('unknown');
    expect(updates()[1].data).toEqual({ status: 'Unknown' });
    post.mockResolvedValueOnce(reply('TP18', 0));
    (prisma.guestPaymentAttempt.updateMany as any).mockClear();
    expect(((await submitGuestPaymentOtp('h', 'r1', { guestId: 1 }, '123456')) as any).status).toBe('unknown');
    expect(updates()[1].data).toEqual({ status: 'Unknown' });
  });

  it('a double submit cannot send a second prompt', async () => {
    (prisma.guestPaymentAttempt.updateMany as any).mockResolvedValueOnce({ count: 0 });
    await expect(submitGuestPaymentOtp('h', 'r1', { guestId: 1 }, '123456')).rejects.toMatchObject({ statusCode: 409 });
    expect(post).not.toHaveBeenCalled();
  });

  it('a request Moolre refuses outright is Failed (nothing was charged)', async () => {
    post.mockResolvedValueOnce(reply('TP06', 0));
    (prisma.guestPaymentAttempt.findFirst as any).mockResolvedValue(null);
    const result: any = await initializeGuestPayment('h', 'r1', { guestId: 1 }, { phone: '0240000888', network: 'MTN' });
    expect(result.status).toBe('failed');
    expect(updates()).toContainEqual({ where: { attemptId: 8, status: { in: ['Initializing'] } }, data: { status: 'Failed' } });
  });
});
