// End-to-end check of manager visibility for refunds and cash corrections, against the LOCAL database only.
// Creates a throwaway fixture hotel and deletes it afterwards.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { recordPayment } from '../src/modules/payment/payment.service';
import { requestRefund } from '../src/modules/reservation/refund.service';
import { correctBooking, correctBookingInTransaction } from '../src/modules/reservation/recovery.service';
import { cashReconciliation, recordCashCount } from '../src/modules/reports/cash-reconciliation.service';
import { dailyOverview, hotelDate } from '../src/modules/reports/daily-overview.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'vis-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Visibility fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', isNonRefundable: false } });
  let userIds: number[] = [];
  try {
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
    const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const mk = (s: string, name: string, roleId: number) => prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-${s}`, fullName: name, roleId, passwordHash: 'no-login' } });
    const [m, ama, kofi] = await Promise.all([mk('m', 'Manager Mensah', managerRole.roleId), mk('a', 'Ama Desk', receptionRole.roleId), mk('k', 'Kofi Desk', receptionRole.roleId)]);
    userIds = [m.userId, ama.userId, kofi.userId];
    const M = { userId: m.userId, propertyId: hotel.propertyId }, A = { userId: ama.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 300 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '501' } });
    const today = hotelDate(new Date(), 'Africa/Accra');
    const day0 = new Date(`${today}T00:00:00Z`);
    const booking = (suffix: string, total: number, offsetDays: number) => prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: `Guest ${suffix}`, source: 'Walk-in', totalAmount: total, amountPaid: 0, status: 'Confirmed',
      checkInDate: new Date(day0.getTime() + offsetDays * 86400000), checkOutDate: new Date(day0.getTime() + (offsetDays + 1) * 86400000),
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: new Date(day0.getTime() + offsetDays * 86400000), checkOutDate: new Date(day0.getTime() + (offsetDays + 1) * 86400000), agreedPricePerNight: total, status: 'Reserved' } },
    } });
    const refund = async (actor: any, reservationId: string, paymentId: number, amount: number, reason: string, extra: any = {}) => {
      const p: any = await requestRefund(actor, reservationId, { paymentId, amount, reason, mode: 'Manual', preview: true });
      return requestRefund(actor, reservationId, { paymentId, amount, reason, mode: 'Manual', expectedVersion: p.version, recordDirectly: true, method: 'Cash', reference: null, moneyReturned: true, ...extra });
    };
    const row = (data: any, userId: number) => data.staff.find((r: any) => r.userId === userId);

    // 1. Normal refund (refundable hotel): reason shown, no exception label.
    const b1 = await booking('N', 300, 3);
    const p1 = await recordPayment({ reservationId: b1.reservationId, amount: 300, paymentMethod: 'Cash', receivedBy: ama.userId });
    await prisma.reservation.update({ where: { reservationId: b1.reservationId }, data: { totalAmount: 250 } }); // GHS 50 overpaid
    await refund(A, b1.reservationId, p1.paymentId, 50, 'Overcharged by mistake.');
    let report: any = await dailyOverview(m.userId, hotel.propertyId, today);
    const normal = report.refunds.find((r: any) => r.reservationId === b1.reservationId);
    assert.equal(normal.reason, 'Overcharged by mistake.');
    assert.equal(normal.policyException, false);
    assert.equal(normal.recordedOn, today);
    console.log('1 ok: normal refund shows its reason, no "Policy exception" label, recorded today');

    // 2. Policy exception (non-refundable hotel). Ama took GHS 300 cash, counted only GHS 200 (gave GHS 100 back unrecorded).
    await prisma.property.update({ where: { propertyId: hotel.propertyId }, data: { isNonRefundable: true } });
    const b2 = await booking('X', 300, 4);
    const p2 = await recordPayment({ reservationId: b2.reservationId, amount: 300, paymentMethod: 'Cash', receivedBy: ama.userId });
    let mgr: any = await cashReconciliation(M);
    const expectedBefore = row(mgr, ama.userId).expectedCash; // 300 + 300 − 50
    assert.equal(expectedBefore, 550);
    await recordCashCount(A, { countedAmount: 450, note: 'Short by 100' });
    await prisma.reservation.update({ where: { reservationId: b2.reservationId }, data: { status: 'Cancelled', cancellationDate: new Date() } });
    await refund(A, b2.reservationId, p2.paymentId, 100, 'Guest had a family emergency.', { policyException: true });
    report = await dailyOverview(m.userId, hotel.propertyId, today);
    const exception = report.refunds.find((r: any) => r.reservationId === b2.reservationId);
    assert.equal(exception.policyException, true);
    assert.equal(exception.reason, 'Guest had a family emergency.');
    console.log('2 ok: exception refund shows "Policy exception" and its reason');

    // 3. Historical reconciliation: the saved count keeps −100; the live view shows the refund recorded after the count.
    mgr = await cashReconciliation(M);
    const amaRow = row(mgr, ama.userId);
    assert.equal(amaRow.latestCount.expectedAmount, 550);
    assert.equal(amaRow.latestCount.difference, -100);
    assert.equal(amaRow.expectedCash, 450);
    assert.equal(amaRow.differenceNow, 0);
    assert.equal(amaRow.changedSinceCount, true);
    const after = amaRow.changesAfterCount.find((c: any) => c.kind === 'refund');
    assert.equal(after.effect, -100);
    assert.match(after.detail, /policy exception/);
    console.log('3 ok: saved count unchanged (expected 550, −100); live now matches; refund listed as recorded after the count');

    // 4. Late-recorded refund: Kofi returned GHS 40 yesterday, records it today.
    const b3 = await booking('L', 200, 5);
    const yesterday = new Date(Date.now() - 24 * 3600000);
    const p3 = await prisma.payment.create({ data: { reservationId: b3.reservationId, propertyId: hotel.propertyId, amount: 200, paymentMethod: 'Cash', receivedBy: kofi.userId, paymentDate: new Date(yesterday.getTime() - 3600000) } });
    await prisma.reservation.update({ where: { reservationId: b3.reservationId }, data: { amountPaid: 200, totalAmount: 160 } });
    await refund({ userId: kofi.userId, propertyId: hotel.propertyId }, b3.reservationId, p3.paymentId, 40, 'Extra night not used.', { policyException: true, returnedAt: yesterday.toISOString() });
    const yesterdayDate = hotelDate(yesterday, 'Africa/Accra');
    const todayReport: any = await dailyOverview(m.userId, hotel.propertyId, today);
    const yesterdayReport: any = await dailyOverview(m.userId, hotel.propertyId, yesterdayDate);
    assert(todayReport.refundsRecordedLate.some((r: any) => r.reservationId === b3.reservationId));
    assert(!todayReport.refunds.some((r: any) => r.reservationId === b3.reservationId));
    assert.equal(todayReport.refundsReturned, 150); // 50 + 100 — the late GHS 40 is not counted today
    const lateLine = yesterdayReport.refunds.find((r: any) => r.reservationId === b3.reservationId);
    assert.equal(lateLine.returnedOn, yesterdayDate);
    assert.equal(lateLine.recordedOn, today);
    assert.equal(yesterdayReport.refundsReturned, 40);
    console.log('4 ok: late refund counted only on its return date, listed today under "recorded today for earlier dates", marked recorded later');

    // 5. Payment reduction: Kofi took GHS 200 cash today, counted 200, then the manager corrects it to GHS 150.
    const b4 = await booking('C', 200, 6);
    const p4 = await recordPayment({ reservationId: b4.reservationId, amount: 200, paymentMethod: 'Cash', receivedBy: kofi.userId });
    await recordCashCount(M, { staffUserId: kofi.userId, countedAmount: 200 });
    const preview: any = await prisma.$transaction(tx => correctBookingInTransaction(tx, b4.reservationId, M, { action: 'correct-payment', paymentId: p4.paymentId, newAmount: 150, reason: 'Typed the wrong amount.', preview: true }, true));
    await correctBooking(b4.reservationId, M, { action: 'correct-payment', paymentId: p4.paymentId, newAmount: 150, reason: 'Typed the wrong amount.', expectedVersion: preview.version });
    mgr = await cashReconciliation(M);
    const kofiRow = row(mgr, kofi.userId);
    const corr = kofiRow.cashCorrections.find((c: any) => c.paymentId === p4.paymentId);
    assert.deepEqual({ original: corr.original, corrected: corr.corrected, difference: corr.difference, collectedBy: corr.collectedBy, correctedBy: corr.correctedBy, reason: corr.reason },
      { original: 200, corrected: 150, difference: -50, collectedBy: 'Kofi Desk', correctedBy: 'Manager Mensah', reason: 'Typed the wrong amount.' });
    assert.equal(kofiRow.latestCount.expectedAmount, 200);
    assert(kofiRow.changesAfterCount.some((c: any) => c.kind === 'correction' && c.effect === -50));
    console.log('5 ok: correction shows original 200 → 150 (−50), collected by Kofi, corrected by the manager, with reason; flagged as after the count; saved count unchanged');

    // 6. Totals unchanged by the new views; audit trail intact.
    assert.equal(await prisma.auditLog.count({ where: { action: 'RefundCompleted', userId: { in: userIds } } }), 3);
    assert(await prisma.auditLog.findFirst({ where: { action: 'Correction:correct-payment', userId: m.userId } }));
    console.log('6 ok: refunds and the correction are all in the audit log');
    console.log('\nAll refund visibility checks passed.');
  } finally {
    await prisma.cashCount.deleteMany({ where: { propertyId: hotel.propertyId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
