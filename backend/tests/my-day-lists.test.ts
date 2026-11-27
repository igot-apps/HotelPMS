import { expect, jest, test } from '@jest/globals';

const db: any = {
  property: { findUnique: jest.fn(async () => ({ timezone: 'Africa/Accra' })) },
  auditLog: { findMany: jest.fn() },
  reservation: { findMany: jest.fn() },
  payment: { findMany: jest.fn() },
};
jest.mock('../src/shared/utils/prisma', () => ({ prisma: db }));

import { getMyDay } from '../src/modules/dashboard/my-day.service';

test('my day returns the bookings and payments behind each figure', async () => {
  const at = new Date();
  db.auditLog.findMany.mockResolvedValue([
    { action: 'CheckedIn', newData: { reservationId: 'r1' }, createdAt: at },
    { action: 'CheckedIn', newData: { reservationId: 'r1' }, createdAt: at },
    { action: 'CheckedOut', newData: { reservationId: 'r2' }, createdAt: at },
  ]);
  db.reservation.findMany
    .mockResolvedValueOnce([{ reservationId: 'r3', confirmationCode: 'C3', guestNameSnapshot: 'Ama', createdAt: at }])
    .mockResolvedValueOnce([
      { reservationId: 'r1', confirmationCode: 'C1', guestNameSnapshot: null, propertyGuest: { fullName: 'Kofi' } },
      { reservationId: 'r2', confirmationCode: 'C2', guestNameSnapshot: 'Esi' },
    ]);
  db.payment.findMany.mockResolvedValue([{ paymentId: 9, amount: '150.5', paymentMethod: 'Cash', paymentDate: at, reservation: { reservationId: 'r1', confirmationCode: 'C1', guestNameSnapshot: 'Kofi' } }]);

  const day = await getMyDay(7, 1, at);
  expect(day.checkIns).toEqual({ bookings: 1, rooms: 2 });
  expect(day.bookingsMade).toBe(1);
  expect(day.payments).toEqual({ count: 1, total: 150.5 });
  expect(day.lists.checkIns).toEqual([{ reservationId: 'r1', confirmationCode: 'C1', guestName: 'Kofi', rooms: 2, at }]);
  expect(day.lists.checkOuts[0]).toMatchObject({ reservationId: 'r2', guestName: 'Esi', rooms: 1 });
  expect(day.lists.bookings[0]).toMatchObject({ reservationId: 'r3', guestName: 'Ama' });
  expect(day.lists.payments[0]).toMatchObject({ paymentId: 9, amount: 150.5, method: 'Cash', reservationId: 'r1' });
});
