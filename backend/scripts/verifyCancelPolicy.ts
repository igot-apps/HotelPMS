// End-to-end check: cancelling under the non-refundable (default) and refundable policies. LOCAL database only.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { cancelSafely } from '../src/modules/reservation/recovery.service';
import { refundOverview, requestRefund } from '../src/modules/reservation/refund.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'cancel-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Cancel policy fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  let userIds: number[] = [];
  try {
    assert.equal(hotel.isNonRefundable, true);
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const user = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: code + '-r', fullName: 'Fixture receptionist', roleId: role.roleId, passwordHash: 'no-login' } });
    userIds = [user.userId];
    const actor = { userId: user.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: '301' } });
    const day = new Date(); day.setUTCHours(0, 0, 0, 0); day.setUTCDate(day.getUTCDate() + 3);
    const booking = (n: string) => prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-${n}`, source: 'Walk-in', checkInDate: day, checkOutDate: new Date(day.getTime() + 2 * 86400000), totalAmount: 200, amountPaid: 200, status: 'Confirmed',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: day, checkOutDate: new Date(day.getTime() + 2 * 86400000), agreedPricePerNight: 100, status: 'Reserved' } },
      payments: { create: { propertyId: hotel.propertyId, amount: 200, paymentMethod: 'Cash', receivedBy: user.userId } },
    } });
    const a = await booking('A');
    const cancelledA = await cancelSafely(a.reservationId, actor);
    assert.equal(cancelledA.status, 'Cancelled');
    assert.equal(Number(cancelledA.refundDue), 0);
    assert.equal(cancelledA.refundStatus, 'None');
    assert.equal(Number(cancelledA.amountPaid), 200);
    console.log('1 ok: non-refundable hotel — cancelled, hotel keeps GHS 200, no refund due');
    await prisma.property.update({ where: { propertyId: hotel.propertyId }, data: { isNonRefundable: false } });
    const b = await booking('B');
    const cancelledB = await cancelSafely(b.reservationId, actor);
    assert.equal(Number(cancelledB.refundDue), 200);
    assert.equal(cancelledB.refundStatus, 'Pending');
    console.log('2 ok: refundable hotel — cancelled, GHS 200 becomes a refund due');
    // Refundable hotel, booking paid GHS 300 online (Paystack-verified) + GHS 200 cash: only the cash can be refunded.
    const c = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-C`, source: 'Website', checkInDate: day, checkOutDate: new Date(day.getTime() + 2 * 86400000), totalAmount: 500, amountPaid: 500, status: 'Confirmed',
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, checkInDate: day, checkOutDate: new Date(day.getTime() + 2 * 86400000), agreedPricePerNight: 250, status: 'Reserved' } },
      payments: { create: [
        { propertyId: hotel.propertyId, amount: 300, paymentMethod: 'Card', gatewayReference: `PSK-${code}`, receivedBy: null, verifiedProvider: 'Paystack', verifiedAt: new Date(), notes: 'Online payment verified with Paystack.' },
        { propertyId: hotel.propertyId, amount: 200, paymentMethod: 'Cash', receivedBy: user.userId },
      ] },
    }, include: { payments: true } });
    const cancelledC = await cancelSafely(c.reservationId, actor);
    assert.equal(Number(cancelledC.refundDue), 200);
    const overview: any = await refundOverview(actor, c.reservationId);
    assert.equal(overview.refundable, 200);
    assert.equal(overview.payments.find((p: any) => p.online).available, 0);
    const onlinePayment = c.payments.find(p => p.verifiedProvider)!;
    await assert.rejects(() => requestRefund(actor, c.reservationId, { paymentId: onlinePayment.paymentId, amount: 50, reason: 'Guest asked for money back.', mode: 'Manual', preview: true }), /Online payments are non-refundable/);
    console.log('3 ok: refundable hotel — cancelling refunds only the GHS 200 cash; the GHS 300 online payment cannot be refunded by anyone');

    console.log('\nAll cancellation policy checks passed.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
