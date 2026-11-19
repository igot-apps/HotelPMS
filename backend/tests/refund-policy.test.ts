import { describe, expect, jest, test } from '@jest/globals';
import { cancellationRefund, hotelIsNonRefundable } from '../src/modules/reservation/refund-policy';

const tx = (isNonRefundable: boolean | undefined) => ({ property: { findUnique: jest.fn<(...args: any[]) => any>().mockResolvedValue(isNonRefundable === undefined ? null : { isNonRefundable }) } });

describe('hotel refund policy', () => {
  test('non-refundable is the default, including when the setting is missing', async () => {
    expect(await hotelIsNonRefundable(tx(true), 3)).toBe(true);
    expect(await hotelIsNonRefundable(tx(undefined), 3)).toBe(true);
    expect(await hotelIsNonRefundable(tx(false), 3)).toBe(false);
  });
  test('cancelling a non-refundable booking keeps the money: nothing becomes due', () => {
    expect(cancellationRefund(300, true)).toEqual({ refundDue: 0, refundStatus: 'None', refundPolicy: 'NonRefundable' });
  });
  test('cancelling a refundable booking makes the amount paid due back to the guest', () => {
    expect(cancellationRefund(300, false)).toEqual({ refundDue: 300, refundStatus: 'Pending', refundPolicy: 'Refundable' });
    expect(cancellationRefund(0, false)).toEqual({ refundDue: 0, refundStatus: 'None', refundPolicy: 'Refundable' });
  });
});

describe('online payments are never refundable', () => {
  test('only money paid at the hotel counts towards a cancellation refund', async () => {
    const { paidAtHotel } = await import('../src/modules/reservation/refund-policy');
    const res = { payments: [
      { amount: 300, status: 'Completed', verifiedProvider: 'Paystack' },
      { amount: 200, status: 'Completed', verifiedProvider: null },
      { amount: 50, status: 'Voided', verifiedProvider: null },
    ] };
    expect(paidAtHotel(res)).toBe(200);
    expect(cancellationRefund(paidAtHotel(res), false)).toMatchObject({ refundDue: 200, refundStatus: 'Pending' });
    expect(cancellationRefund(paidAtHotel({ payments: [res.payments[0]] }), false)).toMatchObject({ refundDue: 0, refundStatus: 'None' });
  });
});
