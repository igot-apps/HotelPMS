import { describe, expect, jest, test } from '@jest/globals';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: {} }));
jest.mock('../src/modules/notifications/simulated-sms.service', () => ({ recordSimulatedSms: jest.fn() }));

import { repriceDeparture } from '../src/modules/reservation/recovery.service';

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const room = (id: number, price: number, out: string, penalty = 0) => ({
  reservationRoomId: id, status: 'CheckedIn', agreedPricePerNight: price, earlyDeparturePenalty: penalty,
  checkInDate: day('2026-11-27'), checkOutDate: day(out),
});

describe('early-departure penalty repricing', () => {
  test('first shortening keeps the penalty share of the removed nights', () => {
    const res = { totalAmount: 2100, amountPaid: 1200, reservationRooms: [room(1, 200, '2026-11-30'), room(2, 500, '2026-11-30')] };
    const out = repriceDeparture(res, [res.reservationRooms[1]], day('2026-11-28'), 50);
    expect(out.totalAmount).toBe(1600);
    expect(out.penaltyKept).toBe(500);
    expect(out.revised[1].earlyDeparturePenalty).toBe(500);
  });

  test('a second shortening does not rescale the earlier penalty', () => {
    const res = { totalAmount: 1600, amountPaid: 1600, reservationRooms: [room(1, 200, '2026-11-30'), room(2, 500, '2026-11-28', 500)] };
    const out = repriceDeparture(res, [res.reservationRooms[0]], day('2026-11-28'), 50);
    expect(out.totalAmount).toBe(1400);
    expect(out.penaltyKept).toBe(200);
    expect(out.credit).toBe(200);
  });

  test('tax multiplier still applies to the kept penalty', () => {
    const res = { totalAmount: 660, amountPaid: 0, reservationRooms: [room(1, 200, '2026-11-30')] }; // 600 + 10% tax
    const out = repriceDeparture(res, [res.reservationRooms[0]], day('2026-11-28'), 50);
    expect(out.totalAmount).toBe(440); // (200 + 200 kept) * 1.1
    expect(out.penaltyKept).toBe(220);
  });
});
