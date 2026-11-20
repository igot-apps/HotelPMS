// End-to-end check of whole-booking refunds (no payment chosen: the server splits the amount across the
// booking's hotel payments), against the LOCAL database only. Creates a throwaway fixture hotel, then deletes it.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { requestRefund, refundOverview } from '../src/modules/reservation/refund.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'split-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Refund split fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const desk = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: code + '-r', fullName: 'Fixture receptionist', roleId: role.roleId, passwordHash: 'no-login' } });
    const A = { userId: desk.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '201' } });
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    const earlier = new Date(Date.now() - 3600000);
    // Cancelled booking paid GHS 50 cash + GHS 20 MoMo at the hotel + GHS 30 online (online is never refunded).
    const booking = (suffix: string) => prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: 'Refund guest', source: 'Walk-in', checkInDate: day, checkOutDate: new Date(day.getTime() + 86400000),
      totalAmount: 200, amountPaid: 100, status: 'Cancelled', cancellationDate: new Date(), refundDue: 100, refundStatus: 'Pending',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: day, checkOutDate: new Date(day.getTime() + 86400000), agreedPricePerNight: 200, status: 'Cancelled' } },
      payments: { create: [
        { propertyId: hotel.propertyId, amount: 50, paymentMethod: 'Cash', receivedBy: desk.userId, paymentDate: earlier },
        { propertyId: hotel.propertyId, amount: 20, paymentMethod: 'MobileMoney', receivedBy: desk.userId, paymentDate: earlier },
        { propertyId: hotel.propertyId, amount: 30, paymentMethod: 'Paystack', verifiedProvider: 'Paystack', verifiedAt: earlier, paymentDate: earlier },
      ] },
    }, include: { payments: { orderBy: { paymentId: 'asc' } } } });
    const returned = { method: 'Cash', reference: 'RCPT-1', moneyReturned: true, policyException: true, recordDirectly: true }; // fixture hotel is non-refundable (default)
    const body = { amount: 70, reason: 'Reservation was cancelled and a refund is due.', mode: 'Manual' };

    // 1. Full refund of GHS 70 with no payment chosen: split MoMo 20 (newest) + cash 50, online untouched.
    const res = await booking('FULL');
    const [cash, momo, online] = res.payments;
    assert.equal((await refundOverview(A, res.reservationId) as any).refundable, 70);
    const preview: any = await requestRefund(A, res.reservationId, { ...body, preview: true });
    assert.deepEqual(preview.parts.map((p: any) => [p.paymentId, p.amount]), [[momo.paymentId, 20], [cash.paymentId, 50]]);
    assert.match(preview.message, /GHS 70\.00 .*payment #\d+ \(MobileMoney\) GHS 20\.00 and payment #\d+ \(Cash\) GHS 50\.00/);
    const done: any = await requestRefund(A, res.reservationId, { ...body, expectedVersion: preview.version, ...returned });
    assert.equal(done.status, 'Completed');
    const refunds = await prisma.refund.findMany({ where: { reservationId: res.reservationId }, orderBy: { refundId: 'asc' } });
    assert.deepEqual(refunds.map(r => [r.paymentId, Number(r.amount), r.reference]), [[momo.paymentId, 20, 'RCPT-1 (part 1 of 2)'], [cash.paymentId, 50, 'RCPT-1 (part 2 of 2)']]);
    assert(!refunds.some(r => r.paymentId === online.paymentId), 'online payment never refunded');
    const after = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId } });
    assert.equal(Number(after.amountPaid), 30); assert.equal(Number(after.refundDue), 30);
    assert.equal(await prisma.auditLog.count({ where: { action: 'RefundCompleted', newData: { path: ['reservationId'], equals: res.reservationId } } }), 2);
    assert.equal((await refundOverview(A, res.reservationId) as any).refundable, 0);
    console.log('1 ok: GHS 70 split into MoMo 20 + cash 50 (one refund and audit entry each); online GHS 30 untouched');

    // 2. Partial refund fits in one payment: only the newest payment is used.
    const partial = await booking('PART');
    const p2: any = await requestRefund(A, partial.reservationId, { ...body, amount: 15, preview: true });
    assert.deepEqual(p2.parts.map((p: any) => p.paymentId), [partial.payments[1].paymentId]);
    await requestRefund(A, partial.reservationId, { ...body, amount: 15, expectedVersion: p2.version, ...returned, reference: null });
    assert.equal((await refundOverview(A, partial.reservationId) as any).refundable, 55);
    console.log('2 ok: a GHS 15 refund comes from one payment; GHS 55 still available');

    // 3. More than available, stale preview, and missing confirmations are refused; nothing is recorded.
    const over = await booking('OVER');
    await assert.rejects(() => requestRefund(A, over.reservationId, { ...body, amount: 70.01, preview: true }), /exceeds the available amount \(GHS 70\.00\)/);
    const p3: any = await requestRefund(A, over.reservationId, { ...body, preview: true });
    await prisma.payment.create({ data: { reservationId: over.reservationId, propertyId: hotel.propertyId, amount: 10, paymentMethod: 'Cash', receivedBy: desk.userId, paymentDate: earlier } });
    await prisma.reservation.update({ where: { reservationId: over.reservationId }, data: { amountPaid: 110 } });
    await assert.rejects(() => requestRefund(A, over.reservationId, { ...body, expectedVersion: p3.version, ...returned }), /booking changed/);
    await assert.rejects(() => requestRefund(A, over.reservationId, { ...body, expectedVersion: p3.version, ...returned, policyException: false }), /booking changed|non-refundable/);
    assert.equal(await prisma.refund.count({ where: { reservationId: over.reservationId } }), 0);
    console.log('3 ok: over-limit, stale preview and unconfirmed refunds are refused with nothing recorded');

    // 4. Choosing a payment still works as before.
    const single: any = await requestRefund(A, over.reservationId, { ...body, amount: 10, paymentId: over.payments[0].paymentId, preview: true });
    assert.equal(single.paymentId, over.payments[0].paymentId);
    console.log('4 ok: a refund for one chosen payment still works');
    console.log('\nAll whole-booking refund checks passed.');
  } finally {
    const ids = (await prisma.reservation.findMany({ where: { propertyId: hotel.propertyId }, select: { reservationId: true } })).map(r => r.reservationId);
    if (ids.length) {
      await prisma.auditLog.deleteMany({ where: { OR: ids.map(id => ({ newData: { path: ['reservationId'], equals: id } })) } });
      await prisma.refund.deleteMany({ where: { reservationId: { in: ids } } });
      await prisma.payment.deleteMany({ where: { reservationId: { in: ids } } });
    }
    await prisma.auditLog.deleteMany({ where: { user: { propertyId: hotel.propertyId } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
