// End-to-end check of a 3-room booking: per-room check-in, partial checkout, final checkout with money owed.
// LOCAL database only: creates a throwaway fixture hotel and deletes it afterwards.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { transitionStay } from '../src/modules/reservation/recovery.service';
import { recordPayment } from '../src/modules/payment/payment.service';
import { getOwedAfterCheckout } from '../src/modules/dashboard/owed-after-checkout.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'multi-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Multi-room fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  let userIds: number[] = [];
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const user = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: code + '-r', fullName: 'Fixture receptionist', roleId: role.roleId, passwordHash: 'no-login' } });
    userIds = [user.userId];
    const r = { userId: user.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const rooms = await Promise.all(['101', '102', '103'].map(n => prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: n, housekeepingStatus: n === '103' ? 'Dirty' : 'Clean' } })));
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const out = new Date(today.getTime() + 86400000);
    const res = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: code, guestNameSnapshot: 'Group guest', source: 'Walk-in', checkInDate: today, checkOutDate: out, totalAmount: 300, amountPaid: 100, status: 'Confirmed',
      reservationRooms: { create: rooms.map(room => ({ roomId: room.roomId, roomTypeId: type.roomTypeId, roomNumberSnapshot: room.roomNumber, checkInDate: today, checkOutDate: out, agreedPricePerNight: 100, status: 'Reserved' })) },
      payments: { create: { propertyId: hotel.propertyId, amount: 100, paymentMethod: 'Cash', receivedBy: user.userId } },
    }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });
    const [a, b, c] = res.reservationRooms;
    const reload = () => prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });

    // Check in each room with its own occupant (what the bulk dialog sends, one room at a time).
    await transitionStay(a.reservationRoomId, 'CheckedIn', r, { occupantName: 'Ama', occupantPhone: '0244000001' });
    await transitionStay(b.reservationRoomId, 'CheckedIn', r, { occupantName: 'Kofi' });
    await assert.rejects(() => transitionStay(c.reservationRoomId, 'CheckedIn', r, { occupantName: 'Yaw' }), (e: any) => e.code === 'ROOM_NOT_CLEAN');
    await transitionStay(c.reservationRoomId, 'CheckedIn', r, { occupantName: 'Yaw', uncleanRoomConfirmed: true });
    let booking = await reload();
    assert.equal(booking.status, 'InHouse');
    assert.deepEqual(booking.reservationRooms.map(s => s.status), ['CheckedIn', 'CheckedIn', 'CheckedIn']);
    console.log('1 ok: 3 rooms checked in, each with its own occupant; the room needing cleaning required confirmation');

    // Partial checkout: rooms 101 and 102 leave while 103 stays; GHS 200 owed stays on the booking, no reason needed.
    await transitionStay(a.reservationRoomId, 'CheckedOut', r, {});
    await transitionStay(b.reservationRoomId, 'CheckedOut', r, {});
    booking = await reload();
    assert.equal(booking.status, 'InHouse');
    assert.deepEqual(booking.reservationRooms.map(s => s.status), ['CheckedOut', 'CheckedOut', 'CheckedIn']);
    assert.equal(Number(booking.amountPaid), 100);
    assert.equal(Number(booking.totalAmount), 300);
    const freed = await prisma.room.findMany({ where: { roomId: { in: [a.roomId!, b.roomId!] } } });
    assert(freed.every(room => room.operationalStatus === 'Available' && room.housekeepingStatus === 'Dirty'));
    const partialAudit = await prisma.auditLog.findFirstOrThrow({ where: { userId: user.userId, action: 'CheckedOut' }, orderBy: { createdAt: 'desc' } });
    assert.equal((partialAudit.newData as any).value.partialCheckout, true);
    console.log('2 ok: two rooms checked out while one stays; no money-owed reason; booking still in house; balance unchanged; rooms need cleaning');

    // Final room: money still owed, so the usual rule applies.
    await assert.rejects(() => transitionStay(c.reservationRoomId, 'CheckedOut', r, {}), (e: any) => e.code === 'BALANCE_OWING' && e.details.balanceDue === 200);
    await recordPayment({ reservationId: res.reservationId, amount: 50, paymentMethod: 'Cash', receivedBy: user.userId });
    await transitionStay(c.reservationRoomId, 'CheckedOut', r, { overrideReason: 'Guest promised to pay later.' });
    booking = await reload();
    assert.equal(booking.status, 'Completed');
    assert.equal(Number(booking.amountPaid), 150);
    const owed = await getOwedAfterCheckout(hotel.propertyId);
    assert.equal(owed.bookings[0].balanceDue, 150);
    assert.equal(owed.bookings[0].reason, 'Guest promised to pay later.');
    console.log('3 ok: last room needed payment or a reason; GHS 150 left owing, listed under Owed after checkout');

    console.log('\nAll multi-room checks passed.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
