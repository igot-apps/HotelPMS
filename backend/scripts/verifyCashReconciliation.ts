// End-to-end check of end-of-day cash reconciliation, against the LOCAL database only.
// Creates a throwaway fixture hotel and deletes it afterwards.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { recordPayment } from '../src/modules/payment/payment.service';
import { requestRefund } from '../src/modules/reservation/refund.service';
import { correctBooking, correctBookingInTransaction } from '../src/modules/reservation/recovery.service';
import { cashReconciliation, recordCashCount } from '../src/modules/reports/cash-reconciliation.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'cash-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Cash fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', isNonRefundable: false } });
  let userIds: number[] = [];
  try {
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
    const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const mk = (suffix: string, fullName: string, roleId: number) => prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-${suffix}`, fullName, roleId, passwordHash: 'no-login' } });
    const [m, ama, kofi] = await Promise.all([mk('m', 'Manager Mensah', managerRole.roleId), mk('a', 'Ama Desk', receptionRole.roleId), mk('k', 'Kofi Desk', receptionRole.roleId)]);
    userIds = [m.userId, ama.userId, kofi.userId];
    const M = { userId: m.userId, propertyId: hotel.propertyId }, A = { userId: ama.userId, propertyId: hotel.propertyId }, K = { userId: kofi.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 500 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '401' } });
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const res = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: code, guestNameSnapshot: 'Cash guest', source: 'Walk-in', checkInDate: day, checkOutDate: new Date(day.getTime() + 3 * 86400000), totalAmount: 1500, amountPaid: 0, status: 'Confirmed',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: day, checkOutDate: new Date(day.getTime() + 3 * 86400000), agreedPricePerNight: 500, status: 'Reserved' } },
    } });
    const id = res.reservationId;

    // Ama takes GHS 300 cash, Kofi GHS 200 cash + GHS 100 MoMo; GHS 500 arrives verified by Paystack.
    const amaCash = await recordPayment({ reservationId: id, amount: 300, paymentMethod: 'Cash', receivedBy: ama.userId });
    // Kofi's cash is on a second booking (corrections are blocked on bookings that already had a refund).
    const res2 = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: code + '-2', guestNameSnapshot: 'Second guest', source: 'Walk-in', checkInDate: new Date(day.getTime() + 5 * 86400000), checkOutDate: new Date(day.getTime() + 6 * 86400000), totalAmount: 500, amountPaid: 0, status: 'Confirmed',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: new Date(day.getTime() + 5 * 86400000), checkOutDate: new Date(day.getTime() + 6 * 86400000), agreedPricePerNight: 500, status: 'Reserved' } },
    } });
    const kofiCash = await recordPayment({ reservationId: res2.reservationId, amount: 200, paymentMethod: 'Cash', receivedBy: kofi.userId });
    await recordPayment({ reservationId: res2.reservationId, amount: 100, paymentMethod: 'MobileMoney', gatewayReference: `MOMO-${code}`, receivedBy: kofi.userId });
    const online = await prisma.payment.create({ data: { reservationId: id, propertyId: hotel.propertyId, amount: 500, paymentMethod: 'Card', gatewayReference: `RES-${code}`, receivedBy: null, status: 'Completed', verifiedProvider: 'Paystack', verifiedAt: new Date(), notes: 'Online payment verified with Paystack.' } });
    await prisma.reservation.update({ where: { reservationId: id }, data: { amountPaid: 800 } });
    // Ama returns GHS 50 in cash (refundable hotel, overpaid? no — reduce total so 50 is refundable).
    await prisma.reservation.update({ where: { reservationId: id }, data: { totalAmount: 750 } });
    const p: any = await requestRefund(A, id, { paymentId: amaCash.paymentId, amount: 50, reason: 'Guest overcharged by mistake.', mode: 'Manual', preview: true });
    await requestRefund(A, id, { paymentId: amaCash.paymentId, amount: 50, reason: 'Guest overcharged by mistake.', mode: 'Manual', expectedVersion: p.version, recordDirectly: true, method: 'Cash', reference: null, moneyReturned: true });

    let mgr: any = await cashReconciliation(M);
    const row = (data: any, userId: number) => data.staff.find((r: any) => r.userId === userId);
    assert.equal(row(mgr, ama.userId).expectedCash, 250);
    assert.equal(row(mgr, kofi.userId).expectedCash, 200);
    assert.equal(row(mgr, kofi.userId).mobileMoney, 100);
    assert.equal(mgr.totals.expectedCash, 450);
    assert.equal(mgr.totals.verifiedOnline, 500);
    assert.equal(mgr.totals.deskMobileMoney, 100);
    assert.equal(mgr.totals.refundsReturned, 50);
    assert.equal(mgr.totals.countedCash, null);
    console.log('1 ok: expected cash Ama 250 (300 − 50 refund), Kofi 200; MoMo 100, verified online 500 and refunds 50 shown separately');

    // Counts: Ama is GHS 10 short, Kofi matches. Receptionists only see / record their own.
    await recordCashCount(A, { countedAmount: 240, note: 'Counted at 6pm' });
    await assert.rejects(() => recordCashCount(A, { staffUserId: kofi.userId, countedAmount: 200 }), /your own cash/);
    await recordCashCount(M, { staffUserId: kofi.userId, countedAmount: 200 });
    const amaView: any = await cashReconciliation(A);
    assert.equal(amaView.staff.length, 1);
    assert.equal(amaView.totals, undefined);
    assert.equal(amaView.staff[0].differenceNow, -10);
    mgr = await cashReconciliation(M);
    assert.equal(mgr.totals.countedCash, 440);
    assert.equal(mgr.totals.difference, -10);
    assert.equal(mgr.totals.outstandingBalances > 0 || mgr.totals.outstandingBalances === 0, true);
    console.log('2 ok: Ama counted 240 (−10), Kofi 200; hotel total = sum of latest counts (440, −10); receptionists see only their own cash');

    // Recount adds history; nothing is overwritten.
    await recordCashCount(A, { countedAmount: 250, note: 'Found GHS 10 in the drawer' });
    mgr = await cashReconciliation(M);
    assert.equal(mgr.history.filter((c: any) => c.staffUserId === ama.userId).length, 2);
    assert.equal(row(mgr, ama.userId).differenceNow, 0);
    console.log('3 ok: recount kept both counts in the history; latest count now matches');

    // A later correction of Kofi's GHS 200 cash payment to GHS 190 by the manager stays on Kofi and that day.
    const preview: any = await prisma.$transaction(tx => correctBookingInTransaction(tx, res2.reservationId, M, { action: 'correct-payment', paymentId: kofiCash.paymentId, newAmount: 190, reason: 'Wrong amount typed.', preview: true }, true));
    await correctBooking(res2.reservationId, M, { action: 'correct-payment', paymentId: kofiCash.paymentId, newAmount: 190, reason: 'Wrong amount typed.', expectedVersion: preview.version });
    const replacement = await prisma.payment.findFirstOrThrow({ where: { reservationId: res2.reservationId, notes: { startsWith: `Correction of payment #${kofiCash.paymentId}` } } });
    assert.equal(replacement.receivedBy, kofi.userId);
    assert.equal(replacement.paymentDate.getTime(), kofiCash.paymentDate.getTime());
    mgr = await cashReconciliation(M);
    const kofiRow = row(mgr, kofi.userId);
    assert.equal(kofiRow.expectedCash, 190);
    assert.equal(kofiRow.latestCount.expectedAmount, 200); // snapshot unchanged
    assert.equal(kofiRow.latestCount.difference, 0);
    assert.equal(kofiRow.changedSinceCount, true);
    assert.equal(kofiRow.differenceNow, 10);
    assert.equal(mgr.totals.expectedCash, 440);
    console.log('4 ok: correction counted once, still Kofi’s cash on the same day; saved count keeps expected 200, live view shows 190 and flags the change');

    // Verified online payments are immutable for everyone, managers included.
    // (On its own booking, so no other safeguard — such as an earlier refund — blocks it first.)
    const res3 = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: code + '-3', guestNameSnapshot: 'Online guest', source: 'Website', checkInDate: new Date(day.getTime() + 8 * 86400000), checkOutDate: new Date(day.getTime() + 9 * 86400000), totalAmount: 500, amountPaid: 500, status: 'Confirmed',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: new Date(day.getTime() + 8 * 86400000), checkOutDate: new Date(day.getTime() + 9 * 86400000), agreedPricePerNight: 500, status: 'Reserved' } },
      payments: { create: { propertyId: hotel.propertyId, amount: 500, paymentMethod: 'MobileMoney', gatewayReference: `PSK-${code}`, receivedBy: null, status: 'Completed', verifiedProvider: 'Paystack', verifiedAt: new Date(), notes: 'Online payment verified with Paystack.' } },
    }, include: { payments: true } });
    void online;
    await assert.rejects(() => prisma.$transaction(tx => correctBookingInTransaction(tx, res3.reservationId, M, { action: 'correct-payment', paymentId: res3.payments[0].paymentId, newAmount: 0, reason: 'Trying to void it.', preview: true }, true)), /Verified online payments cannot be edited/);
    // A staff-typed MoMo reference does not make a payment "provider verified".
    const momo = await prisma.payment.findFirstOrThrow({ where: { reservationId: res2.reservationId, paymentMethod: 'MobileMoney' } });
    assert.equal(momo.verifiedProvider, null);
    const momoPreview: any = await prisma.$transaction(tx => correctBookingInTransaction(tx, res2.reservationId, K, { action: 'correct-payment', paymentId: momo.paymentId, newAmount: 90, reason: 'Wrong amount typed.', preview: true }, true));
    assert.equal(momoPreview.canApply, true);
    console.log('5 ok: verified Paystack payment refused even for the manager; staff MoMo with a reference stays correctable by a receptionist');

    const audits = await prisma.auditLog.count({ where: { action: 'CashCountRecorded', userId: { in: userIds } } });
    assert.equal(audits, 3);
    console.log('6 ok: every count is in the audit log');
    console.log('\nAll cash reconciliation checks passed.');
  } finally {
    await prisma.cashCount.deleteMany({ where: { propertyId: hotel.propertyId } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
