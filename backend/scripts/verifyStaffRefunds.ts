// Builds a throwaway fixture hotel on the LOCAL database, records refunds, and writes today's Daily
// overview to the file given as the first argument (used to test the manager dashboard's per-staff refunds).
import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { recordPayment } from '../src/modules/payment/payment.service';
import { requestRefund } from '../src/modules/reservation/refund.service';
import { dailyOverview, hotelDate } from '../src/modules/reports/daily-overview.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const out = process.argv[2];
  assert(out, 'Pass an output file path.');
  const code = 'srf-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Staff refunds fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', isNonRefundable: false } });
  let userIds: number[] = [];
  try {
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
    const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const mk = (s: string, name: string, roleId: number) => prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-${s}`, fullName: name, roleId, passwordHash: 'no-login' } });
    const [m, ama, kofi] = await Promise.all([mk('m', 'Manager Mensah', managerRole.roleId), mk('a', 'Ama Desk', receptionRole.roleId), mk('k', 'Kofi Desk', receptionRole.roleId)]);
    userIds = [m.userId, ama.userId, kofi.userId];
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 300 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '601' } });
    const today = hotelDate(new Date(), 'Africa/Accra');
    const day0 = new Date(`${today}T00:00:00Z`);
    const booking = (suffix: string, guest: string, total: number, offset: number) => prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: guest, source: 'Walk-in', totalAmount: total, amountPaid: 0, status: 'Confirmed',
      checkInDate: new Date(day0.getTime() + offset * 86400000), checkOutDate: new Date(day0.getTime() + (offset + 1) * 86400000),
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: new Date(day0.getTime() + offset * 86400000), checkOutDate: new Date(day0.getTime() + (offset + 1) * 86400000), agreedPricePerNight: total, status: 'Reserved' } },
    } });
    const refund = async (userId: number, reservationId: string, paymentId: number, amount: number, reason: string, extra: any = {}) => {
      const actor = { userId, propertyId: hotel.propertyId };
      const p: any = await requestRefund(actor, reservationId, { paymentId, amount, reason, mode: 'Manual', preview: true });
      return requestRefund(actor, reservationId, { paymentId, amount, reason, mode: 'Manual', expectedVersion: p.version, recordDirectly: true, method: 'Cash', reference: null, moneyReturned: true, ...extra });
    };
    // Ama: two cash payments today, one normal refund and one policy-exception refund.
    const b1 = await booking('A1', 'Efua Mensah', 300, 3);
    const p1 = await recordPayment({ reservationId: b1.reservationId, amount: 300, paymentMethod: 'Cash', receivedBy: ama.userId });
    await prisma.reservation.update({ where: { reservationId: b1.reservationId }, data: { totalAmount: 250 } });
    await refund(ama.userId, b1.reservationId, p1.paymentId, 50, 'Overcharged by mistake.');
    await prisma.property.update({ where: { propertyId: hotel.propertyId }, data: { isNonRefundable: true } });
    const b2 = await booking('A2', 'Kwesi Boateng', 200, 4);
    const p2 = await recordPayment({ reservationId: b2.reservationId, amount: 200, paymentMethod: 'Cash', receivedBy: ama.userId });
    await prisma.reservation.update({ where: { reservationId: b2.reservationId }, data: { status: 'Cancelled', cancellationDate: new Date() } });
    await refund(ama.userId, b2.reservationId, p2.paymentId, 80, 'Family emergency.', { policyException: true });
    // Kofi: no payments today; records today a refund he returned yesterday (late).
    const b3 = await booking('K1', 'Abena Owusu', 200, 5);
    const yesterday = new Date(Date.now() - 24 * 3600000);
    const p3 = await prisma.payment.create({ data: { reservationId: b3.reservationId, propertyId: hotel.propertyId, amount: 200, paymentMethod: 'Cash', receivedBy: kofi.userId, paymentDate: new Date(yesterday.getTime() - 3600000) } });
    await prisma.reservation.update({ where: { reservationId: b3.reservationId }, data: { amountPaid: 200, totalAmount: 160 } });
    await refund(kofi.userId, b3.reservationId, p3.paymentId, 40, 'Extra night not used.', { policyException: true, returnedAt: yesterday.toISOString() });

    const report = await dailyOverview(m.userId, hotel.propertyId, today);
    writeFileSync(out, JSON.stringify({ report, ids: { ama: ama.userId, kofi: kofi.userId, b1: b1.reservationId, b2: b2.reservationId, b3: b3.reservationId } }));
    console.log('Daily overview written for', today);
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
