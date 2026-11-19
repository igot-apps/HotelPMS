// End-to-end check of no-show handling (whole booking and single rooms), against the LOCAL database only.
// Creates a throwaway fixture hotel, runs the scenarios, then deletes it.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { markAsNoShow } from '../src/modules/reservation/reservation.service';
import { markRoomsNoShow, transitionStay, checkoutBooking, correctBooking } from '../src/modules/reservation/recovery.service';
import { getOwedAfterCheckout } from '../src/modules/dashboard/owed-after-checkout.service';
import { getFullDashboardReport } from '../src/modules/reports/report.service';
import { hotelDate } from '../src/modules/reports/daily-overview.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'nsh-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'No-show fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', checkInTime: '14:00', isNonRefundable: true } });
  let userIds: number[] = [];
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const desk = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-r`, fullName: 'Ama Desk', roleId: role.roleId, passwordHash: 'no-login' } });
    userIds = [desk.userId];
    const A = { userId: desk.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const rooms = await Promise.all(['101', '102', '103', '104'].map(n => prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: n, housekeepingStatus: 'Clean' } })));
    const today = hotelDate(new Date(), 'Africa/Accra');
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000);
    const book = (suffix: string, roomList: any[], from: number, to: number, total: number, paid: number) => prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: `Guest ${suffix}`, source: 'Walk-in', totalAmount: total, amountPaid: paid, status: 'Confirmed',
      checkInDate: day(from), checkOutDate: day(to),
      reservationRooms: { create: roomList.map(r => ({ roomId: r.roomId, roomTypeId: type.roomTypeId, roomNumberSnapshot: r.roomNumber, checkInDate: day(from), checkOutDate: day(to), agreedPricePerNight: 100, status: 'Reserved' })) },
      ...(paid ? { payments: { create: { propertyId: hotel.propertyId, amount: paid, paymentMethod: 'Cash', paymentDate: new Date(), receivedBy: desk.userId } } } : {}),
    }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });
    const blocking = (roomId: number, from: Date, to: Date) => prisma.reservationRoom.count({ where: { roomId, status: { in: ['Reserved', 'CheckedIn'] }, reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } }, checkInDate: { lt: to }, checkOutDate: { gt: from } } });
    const status = async (id: string) => (await prisma.reservation.findUniqueOrThrow({ where: { reservationId: id }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } }, payments: true } }));

    // 1. Not yet due: arrival tomorrow → refused, room stays reserved.
    const future = await book('FUT', [rooms[3]], 1, 2, 100, 0);
    await assert.rejects(() => markAsNoShow(future.reservationId, hotel.propertyId, desk.userId), /can still arrive/);
    await assert.rejects(() => markRoomsNoShow(future.reservationId, A, [future.reservationRooms[0].reservationRoomId]), /can still arrive/);
    assert.equal((await status(future.reservationId)).reservationRooms[0].status, 'Reserved');
    console.log('1 ok: before the no-show time (check-in 14:00 + 6 h, hotel time) nothing can be released');

    // 2. Single-room booking, guest never came (arrived yesterday): whole booking → No Show.
    const single = await book('ONE', [rooms[3]], -1, 1, 200, 50);
    assert.equal(await blocking(rooms[3].roomId, day(-1), day(1)), 1, 'room is held until the no-show');
    await markAsNoShow(single.reservationId, hotel.propertyId, desk.userId, 'Phone unreachable');
    let s = await status(single.reservationId);
    assert.equal(s.status, 'NoShow');
    assert.equal(s.reservationRooms[0].status, 'NoShow');
    assert.equal(s.payments.length, 1); assert.equal(Number(s.amountPaid), 50); // payment kept
    assert.equal(await blocking(rooms[3].roomId, day(-1), day(1)), 0, 'room released');
    const log = await prisma.auditLog.findFirst({ where: { userId: desk.userId, action: 'ReservationNoShow' }, orderBy: { createdAt: 'desc' } });
    assert.equal((log!.newData as any).reason, 'Phone unreachable'); assert.deepEqual((log!.newData as any).rooms, ['Room 104']);
    console.log('2 ok: single room → booking No-show, room released, GHS 50 payment kept, audit has who/reason/room');

    // 3. Three rooms: two arrive, the third never comes.
    const group = await book('GRP', rooms.slice(0, 3), -1, 1, 600, 400);
    const [s1, s2, s3] = group.reservationRooms;
    await transitionStay(s1.reservationRoomId, 'CheckedIn', A, { occupantName: 'Kofi' });
    await transitionStay(s2.reservationRoomId, 'CheckedIn', A, { occupantName: 'Esi' });
    await assert.rejects(() => markAsNoShow(group.reservationId, hotel.propertyId, desk.userId), /InHouse|checked in/);
    await assert.rejects(() => markRoomsNoShow(group.reservationId, A, [s1.reservationRoomId]), /not waiting for arrival/);
    await markRoomsNoShow(group.reservationId, A, [s3.reservationRoomId], 'Third guest cancelled by phone');
    s = await status(group.reservationId);
    assert.equal(s.status, 'InHouse');
    assert.deepEqual(s.reservationRooms.map(r => r.status), ['CheckedIn', 'CheckedIn', 'NoShow']);
    assert.equal(Number(s.amountPaid), 400); assert.equal(Number(s.totalAmount), 600); assert.equal(s.payments.length, 1);
    assert.equal(await blocking(rooms[2].roomId, day(-1), day(1)), 0, 'only room 103 released');
    const roomLog = await prisma.auditLog.findFirst({ where: { userId: desk.userId, action: 'RoomNoShow' }, orderBy: { createdAt: 'desc' } });
    assert.deepEqual((roomLog!.newData as any).value.rooms, ['Room 103']); assert.equal((roomLog!.newData as any).reason, 'Third guest cancelled by phone');
    console.log('3 ok: 3 rooms, 2 checked in, room 103 no-show → booking stays In house, only 103 released, money unchanged, audited');

    // 4. Late arrival: restore room 103 while free; once someone else books it, restore is refused.
    const restore = async () => {
      const p: any = await correctBooking(group.reservationId, A, { action: 'restore', stayIds: [s3.reservationRoomId], reason: 'Guest arrived late', preview: true });
      return correctBooking(group.reservationId, A, { action: 'restore', stayIds: [s3.reservationRoomId], reason: 'Guest arrived late', expectedVersion: p.version });
    };
    await restore();
    assert.equal((await status(group.reservationId)).reservationRooms[2].status, 'Reserved');
    await transitionStay(s3.reservationRoomId, 'CheckedIn', A, { occupantName: 'Late Yaw' });
    await prisma.$executeRaw`UPDATE reservation_rooms SET status = 'NoShow', "actualCheckIn" = NULL WHERE "reservationRoomId" = ${s3.reservationRoomId}`;
    await prisma.room.update({ where: { roomId: rooms[2].roomId }, data: { operationalStatus: 'Available' } });
    await book('TAKE', [rooms[2]], 0, 1, 100, 0); // room 103 resold for tonight
    await assert.rejects(() => restore(), /conflicting dates/);
    console.log('4 ok: late guest restored and checked in while room was free; restore refused once the room was resold');

    // 5. Departure: the two real stays check out → Completed (not No-show); the balance still shows as owed.
    await checkoutBooking(group.reservationId, A, 'Guest will pay the rest by transfer');
    s = await status(group.reservationId);
    assert.equal(s.status, 'Completed');
    const owed = await getOwedAfterCheckout(hotel.propertyId);
    const row = owed.bookings.find(b => b.reservationId === group.reservationId);
    assert(row, 'debt is visible after checkout'); assert.equal(row!.balanceDue, 200);
    await assert.rejects(() => markAsNoShow(group.reservationId, hotel.propertyId, desk.userId), /Only "Confirmed"/);
    console.log('5 ok: after checkout the booking is Completed and its GHS 200 balance appears under "Owed by guests who left"');

    // 6. A booking where a guest already stayed and left can never become a whole-booking no-show.
    const mixed = await book('MIX', [rooms[0], rooms[1]], -1, 1, 200, 0);
    await transitionStay(mixed.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Ato', uncleanRoomConfirmed: true });
    await transitionStay(mixed.reservationRooms[0].reservationRoomId, 'CheckedOut', A, { overrideReason: 'Will pay later' });
    assert.equal((await status(mixed.reservationId)).status, 'Confirmed');
    await assert.rejects(() => markAsNoShow(mixed.reservationId, hotel.propertyId, desk.userId), /already stayed/);
    await markRoomsNoShow(mixed.reservationId, A, [mixed.reservationRooms[1].reservationRoomId]);
    assert.equal((await status(mixed.reservationId)).status, 'Completed');
    console.log('6 ok: one room stayed, the other never came → whole no-show refused; room no-show completes the booking');

    // 7. Occupancy counts only rooms that were really used (no-show rooms excluded).
    const report: any = await getFullDashboardReport(hotel.propertyId, hotelDate(day(-1), 'Africa/Accra'), hotelDate(day(-1), 'Africa/Accra'));
    // Yesterday: GRP rooms 101 + 102, MIX room 101. Not: ONE (no-show), GRP 103 (no-show), MIX 102 (no-show).
    assert.equal(report.summary.actualOccupiedNights, 3);
    console.log('7 ok: occupancy for yesterday counts 3 used room-nights; the 3 no-show rooms are not counted');
    console.log('\nAll no-show checks passed.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
