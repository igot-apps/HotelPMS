// End-to-end check of receptionist direct refunds, against the LOCAL database only.
// Creates a throwaway fixture hotel, runs the real refund service, then deletes that fixture hotel.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { requestRefund, completeRefund, refundOverview } from '../src/modules/reservation/refund.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'refund-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Direct refund fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  let userIds: number[] = [];
  try {
    const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const receptionist = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: code + '-r', fullName: 'Fixture receptionist', roleId: receptionRole.roleId, passwordHash: 'no-login' } });
    userIds = [receptionist.userId];
    const r = { userId: receptionist.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '201' } });
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    // Cancelled booking that paid 300: all 300 is refundable.
    const res = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: code, guestNameSnapshot: 'Refund guest', source: 'Walk-in', checkInDate: day, checkOutDate: new Date(day.getTime() + 2 * 86400000),
      totalAmount: 300, amountPaid: 300, status: 'Cancelled', cancellationDate: new Date(), refundDue: 300, refundStatus: 'Pending',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: day, checkOutDate: new Date(day.getTime() + 2 * 86400000), agreedPricePerNight: 150, status: 'Cancelled' } },
      payments: { create: { propertyId: hotel.propertyId, amount: 300, paymentMethod: 'Cash', receivedBy: r.userId, paymentDate: new Date(Date.now() - 3600000) } },
    }, include: { payments: true } });
    const paymentId = res.payments[0].paymentId;
    const id = res.reservationId;
    const returned = { method: 'Cash', reference: null, moneyReturned: true, policyException: true }; // fixture hotel is non-refundable (default)

    // A request left waiting from before direct refunds (holds GHS 100).
    const legacy = await prisma.correctionRequest.create({ data: { propertyId: hotel.propertyId, reservationId: id, requestedBy: r.userId, action: 'refund', expectedVersion: 'old', input: { paymentId, amount: 100, reason: 'Guest cancelled before arrival.', mode: 'Manual', recipientPhone: null } } });
    let overview: any = await refundOverview(r, id);
    assert.equal(overview.refundable, 200);
    console.log('1 ok: the waiting request holds GHS 100; only GHS 200 is available for new refunds');

    // Receptionist records a direct refund — no approval step.
    const body = { paymentId, amount: 150, reason: 'Guest cancelled before arrival.', mode: 'Manual' };
    const preview: any = await requestRefund(r, id, { ...body, preview: true });
    await assert.rejects(() => requestRefund(r, id, { ...body, expectedVersion: preview.version }), /Record refund/); // the old "request" path is gone
    const done: any = await requestRefund(r, id, { ...body, expectedVersion: preview.version, recordDirectly: true, ...returned });
    assert.equal(done.status, 'Completed');
    let booking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: id } });
    assert.equal(Number(booking.amountPaid), 150);
    assert.equal(Number(booking.totalAmount), 300);
    assert.equal(await prisma.payment.count({ where: { reservationId: id } }), 1); // original payment kept, not edited
    assert.equal(Number((await prisma.payment.findUniqueOrThrow({ where: { paymentId } })).amount), 300);
    const refund = await prisma.refund.findFirstOrThrow({ where: { reservationId: id } });
    assert.equal(Number(refund.amount), 150);
    assert.equal(refund.returnedBy, r.userId);
    assert(await prisma.auditLog.findFirst({ where: { action: 'RefundCompleted', userId: r.userId } }));
    console.log('2 ok: receptionist refunded GHS 150 directly; refund record, balance, original payment and audit all correct');

    // Over-refund is blocked, counting the waiting request's hold.
    const p2: any = await requestRefund(r, id, { ...body, amount: 50, preview: true });
    await assert.rejects(() => requestRefund(r, id, { ...body, amount: 60, preview: true }), /exceeds/);
    console.log('3 ok: only GHS 50 left after the waiting request\'s hold; GHS 60 refused');

    // The waiting request is resolved once by recording it; a second attempt cannot duplicate it.
    await completeRefund(r, legacy.requestId, returned);
    const again: any = await completeRefund(r, legacy.requestId, returned);
    assert.equal(await prisma.refund.count({ where: { requestId: legacy.requestId } }), 1);
    assert.equal(again.requestId, legacy.requestId);
    const closed = await prisma.correctionRequest.findUniqueOrThrow({ where: { requestId: legacy.requestId } });
    assert.equal(closed.status, 'Completed');
    assert.equal(closed.reviewedBy, r.userId);
    booking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: id } });
    assert.equal(Number(booking.amountPaid), 50);
    console.log('4 ok: waiting request recorded once (GHS 100); repeating it returns the same refund, no duplicate');

    // Final GHS 50, then nothing left to refund.
    await requestRefund(r, id, { ...body, amount: 50, expectedVersion: p2.version, recordDirectly: true, ...returned }).catch(async (e) => {
      if (!/changed/.test(e.message)) throw e;
      const fresh: any = await requestRefund(r, id, { ...body, amount: 50, preview: true });
      return requestRefund(r, id, { ...body, amount: 50, expectedVersion: fresh.version, recordDirectly: true, ...returned });
    });
    overview = await refundOverview(r, id);
    assert.equal(overview.refundable, 0);
    booking = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: id } });
    assert.equal(Number(booking.amountPaid), 0);
    assert.equal(booking.refundStatus, 'Processed');
    await assert.rejects(() => requestRefund(r, id, { ...body, amount: 1, preview: true }), /exceeds/);
    assert.equal(await prisma.refund.count({ where: { reservationId: id } }), 3);
    console.log('5 ok: fully refunded (150 + 100 + 50 = 300); nothing more can be refunded; 3 refund records');

    console.log('\nAll direct-refund checks passed.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
