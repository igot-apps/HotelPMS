// End-to-end check of checkout with money owed, against the LOCAL database only.
// Creates a throwaway fixture hotel, runs the real services, then deletes that fixture hotel.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { transitionStay } from '../src/modules/reservation/recovery.service';
import { recordPayment } from '../src/modules/payment/payment.service';
import { getOwedAfterCheckout } from '../src/modules/dashboard/owed-after-checkout.service';
import { getDashboardGlance } from '../src/modules/dashboard/glance.service';
import { dailyOverview } from '../src/modules/reports/daily-overview.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'owing-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Owing checkout fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  let userIds: number[] = [];
  try {
    const managerRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Manager' } });
    const receptionRole = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const manager = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: code + '-m', fullName: 'Fixture manager', roleId: managerRole.roleId, passwordHash: 'no-login' } });
    const receptionist = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: code + '-r', fullName: 'Fixture receptionist', roleId: receptionRole.roleId, passwordHash: 'no-login' } });
    userIds = [manager.userId, receptionist.userId];
    const r = { userId: receptionist.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const arrival = new Date(); arrival.setUTCHours(0, 0, 0, 0); arrival.setUTCDate(arrival.getUTCDate() - 2);
    const departure = new Date(); departure.setUTCHours(0, 0, 0, 0); // leaving today
    const booking = async (roomNumber: string, total: number, paid: number) => {
      const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber, operationalStatus: 'Occupied', housekeepingStatus: 'Clean' } });
      const res = await prisma.reservation.create({ data: {
        propertyId: hotel.propertyId, confirmationCode: `${code}-${roomNumber}`, guestNameSnapshot: `Guest ${roomNumber}`, source: 'Walk-in', checkInDate: arrival, checkOutDate: departure, totalAmount: total, amountPaid: paid, status: 'InHouse',
        reservationRooms: { create: { roomId: room.roomId, roomTypeId: type.roomTypeId, roomNumberSnapshot: roomNumber, checkInDate: arrival, checkOutDate: departure, agreedPricePerNight: total / 2, status: 'CheckedIn', actualCheckIn: arrival } },
        ...(paid ? { payments: { create: { propertyId: hotel.propertyId, amount: paid, paymentMethod: 'Cash', receivedBy: r.userId } } } : {}),
      }, include: { reservationRooms: true } });
      return { room, res, stayId: res.reservationRooms[0].reservationRoomId };
    };
    const reload = (id: string) => prisma.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { reservationRooms: true } });

    // A: fully paid — normal checkout, no reason needed.
    const a = await booking('101', 200, 200);
    await transitionStay(a.stayId, 'CheckedOut', r, {});
    assert.equal((await reload(a.res.reservationId)).status, 'Completed');
    console.log('A ok: paid guest checked out normally');

    // B: owes 200 — refused without a reason; nothing changes.
    const b = await booking('102', 300, 100);
    await assert.rejects(() => transitionStay(b.stayId, 'CheckedOut', r, {}), (e: any) => e.code === 'BALANCE_OWING' && e.details.balanceDue === 200);
    assert.equal((await reload(b.res.reservationId)).reservationRooms[0].status, 'CheckedIn');
    console.log('B ok: refused without a reason, balance shown as 200');

    // C: payment first reduces the balance.
    await recordPayment({ reservationId: b.res.reservationId, amount: 50, paymentMethod: 'Cash', receivedBy: r.userId });
    assert.equal(Number((await reload(b.res.reservationId)).amountPaid), 150);
    console.log('C ok: payment of 50 recorded, 150 still owed');

    // B/D: checkout with a reason; debt, total and payments unchanged; room freed and needs cleaning.
    const paymentsBefore = await prisma.payment.count({ where: { reservationId: b.res.reservationId } });
    await transitionStay(b.stayId, 'CheckedOut', r, { overrideReason: 'Guest promised to pay later.' });
    const afterB = await reload(b.res.reservationId);
    assert.equal(afterB.status, 'Completed');
    assert.equal(afterB.reservationRooms[0].status, 'CheckedOut');
    assert(afterB.reservationRooms[0].actualCheckOut);
    assert.equal(Number(afterB.totalAmount), 300);
    assert.equal(Number(afterB.amountPaid), 150);
    assert.equal(await prisma.payment.count({ where: { reservationId: b.res.reservationId } }), paymentsBefore);
    const roomB = await prisma.room.findUniqueOrThrow({ where: { roomId: b.room.roomId } });
    assert.equal(roomB.operationalStatus, 'Available');
    assert.equal(roomB.housekeepingStatus, 'Dirty');
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CreditCheckoutApproved', userId: r.userId }, orderBy: { createdAt: 'desc' } });
    assert.equal((audit.newData as any).reason, 'Guest promised to pay later.');
    assert.equal((audit.newData as any).reservationId, b.res.reservationId);
    console.log('D ok: checked out owing 150; total, paid and payments unchanged; room free and needs cleaning; audit has reason and receptionist');

    // D: appears in the owed-after-checkout list (fully paid A does not).
    let owed = await getOwedAfterCheckout(hotel.propertyId);
    assert.equal(owed.bookings.length, 1);
    assert.deepEqual(
      { code: owed.bookings[0].confirmationCode, balance: owed.bookings[0].balanceDue, reason: owed.bookings[0].reason, by: owed.bookings[0].approvedBy, rooms: owed.bookings[0].roomNumbers },
      { code: `${code}-102`, balance: 150, reason: 'Guest promised to pay later.', by: 'Fixture receptionist', rooms: ['102'] },
    );
    assert(owed.bookings[0].checkedOutAt);
    const glance = await getDashboardGlance(hotel.propertyId, 'Manager');
    assert.equal(glance.inHouse.length, 0);
    const report = await dailyOverview(manager.userId, hotel.propertyId);
    assert.equal(report.activity.outstandingNow, 150);
    console.log('D ok: listed under Owed after checkout (150, reason, approver); no longer in house; daily report still counts 150 outstanding');

    // E: settling the debt later removes it from the list.
    await recordPayment({ reservationId: b.res.reservationId, amount: 100, paymentMethod: 'MobileMoney', receivedBy: r.userId });
    owed = await getOwedAfterCheckout(hotel.propertyId);
    assert.equal(owed.bookings[0].balanceDue, 50);
    await assert.rejects(() => recordPayment({ reservationId: b.res.reservationId, amount: 60, paymentMethod: 'Cash', receivedBy: r.userId }), /exceeds/);
    await recordPayment({ reservationId: b.res.reservationId, amount: 50, paymentMethod: 'Cash', receivedBy: r.userId });
    owed = await getOwedAfterCheckout(hotel.propertyId);
    assert.equal(owed.bookings.length, 0);
    console.log('E ok: later payments reduce the debt; overpaying refused; settled booking leaves the list');

    // F: receptionist limit set by the manager is enforced on the server.
    await prisma.user.update({ where: { userId: r.userId }, data: { financialDelegation: { 'credit-checkout': 100 } } });
    const c = await booking('103', 300, 0);
    await assert.rejects(() => transitionStay(c.stayId, 'CheckedOut', r, { overrideReason: 'Guest promised to pay later.' }), /above your limit/);
    assert.equal((await reload(c.res.reservationId)).reservationRooms[0].status, 'CheckedIn');
    await transitionStay(c.stayId, 'CheckedOut', { userId: manager.userId, propertyId: hotel.propertyId }, { overrideReason: 'Manager approved checkout with outstanding balance.' });
    const audits = await prisma.auditLog.findFirstOrThrow({ where: { action: 'CreditCheckoutApproved', userId: manager.userId } });
    assert.equal((audits.newData as any).reservationId, c.res.reservationId);
    console.log('F ok: receptionist over the 100 limit refused; manager can approve; audit names the manager');

    console.log('\nAll checkout-with-balance checks passed.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
