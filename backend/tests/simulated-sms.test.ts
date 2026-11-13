import { beforeEach, expect, jest, test } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { normalizeGhanaSmsNumber, recordSimulatedSms } from '../src/modules/notifications/simulated-sms.service';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { reservation: { findUnique: jest.fn() }, simulatedSms: { create: jest.fn(), update: jest.fn() } } }));
const db = prisma as any;
const booking = {
  reservationId: 'res-1', propertyId: 8, status: 'Confirmed', source: 'Website', amountPaid: 200, totalAmount: 200, confirmationCode: 'RES-123',
  guestPhoneSnapshot: '0244123456', checkInDate: new Date('2026-12-02T00:00:00Z'),
  checkOutDate: new Date('2026-12-03T00:00:00Z'),
  payments: [{ amount: 200 }],
  property: { propertyName: 'Test Hotel', timezone: 'Africa/Accra', smsSimulationEnabled: true },
};

beforeEach(() => { delete process.env.MOOLRE_SMS_VAS_KEY; jest.clearAllMocks(); db.reservation.findUnique.mockResolvedValue(booking); db.simulatedSms.create.mockResolvedValue({ messageId: 1 }); });

test('normalizes only usable Ghana mobile numbers', () => {
  expect(normalizeGhanaSmsNumber('0244123456')).toBe('+233244123456');
  expect(normalizeGhanaSmsNumber('+233244123456')).toBe('+233244123456');
  expect(normalizeGhanaSmsNumber('233244123456')).toBe('+233244123456');
  expect(normalizeGhanaSmsNumber('244123456')).toBe('+233244123456');
  expect(normalizeGhanaSmsNumber('not a number')).toBeNull();
});

test('records a confirmed booking once by event key with simulation content', async () => {
  await recordSimulatedSms('res-1', 'confirmed');
  expect(db.simulatedSms.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    propertyId: 8, eventKey: 'res-1:confirmed', kind: 'confirmed', recipient: '+233244123456',
    body: expect.stringContaining('RES-123'),
  }) });
  db.simulatedSms.create.mockRejectedValueOnce({ code: 'P2002' });
  await expect(recordSimulatedSms('res-1', 'confirmed')).resolves.toBeUndefined();
});

test('does not record pending, disabled, or uncontactable bookings', async () => {
  for (const changed of [
    { status: 'Pending' }, { source: 'WalkIn' }, { amountPaid: 0 }, { amountPaid: 100 }, { payments: [] }, { property: { ...booking.property, smsSimulationEnabled: false } }, { guestPhoneSnapshot: null },
  ]) {
    db.reservation.findUnique.mockResolvedValueOnce({ ...booking, ...changed });
    await recordSimulatedSms('res-1', 'confirmed');
  }
  expect(db.simulatedSms.create).not.toHaveBeenCalled();
});
