// End-to-end check of check-in rules and online availability, against the LOCAL database only.
// Creates a throwaway fixture hotel, runs the scenarios, then deletes it.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { checkinBooking, transitionStay } from '../src/modules/reservation/recovery.service';
import { onlineBookableRoom } from '../src/modules/reservation/stay-timing';
import { hotelDate } from '../src/modules/reports/daily-overview.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'cin-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Check-in fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', checkInTime: '14:00' } });
  const other = await prisma.property.create({ data: { propertyCode: `${code}-x`, propertyName: 'Other hotel', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  let userIds: number[] = [];
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const desk = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-r`, fullName: 'Ama Desk', roleId: role.roleId, passwordHash: 'no-login' } });
    const otherDesk = await prisma.user.create({ data: { propertyId: other.propertyId, username: `${code}-x`, fullName: 'Other Desk', roleId: role.roleId, passwordHash: 'no-login' } });
    userIds = [desk.userId, otherDesk.userId];
    const A = { userId: desk.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const rooms = await Promise.all(['101', '102', '103', '104', '105'].map(n => prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: n, housekeepingStatus: 'Clean' } })));
    const [r101, r102, r103, r104, r105] = rooms;
    const today = hotelDate(new Date(), 'Africa/Accra');
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000);
    // Inserted directly (bypassing booking rules) to set up the situations staff meet at the desk.
    const book = (suffix: string, stays: { room: any; from: number; to: number; status?: string; name?: string }[], status = 'Confirmed') => prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: `Guest ${suffix}`, source: 'Walk-in', totalAmount: 100 * stays.length, amountPaid: 0, status,
      checkInDate: day(Math.min(...stays.map(s => s.from))), checkOutDate: day(Math.max(...stays.map(s => s.to))),
      reservationRooms: { create: stays.map(s => ({ roomId: s.room.roomId, roomTypeId: type.roomTypeId, roomNumberSnapshot: s.room.roomNumber, checkInDate: day(s.from), checkOutDate: day(s.to), agreedPricePerNight: 100,
        status: s.status || 'Reserved', occupantName: s.name || `Occupant ${suffix}`, ...(s.status === 'CheckedIn' ? { actualCheckIn: day(s.from) } : {}) })) },
    }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });
    const stayStatus = async (id: number) => (await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: id } })).status;
    const occupants = (roomId: number) => prisma.reservationRoom.count({ where: { roomId, status: 'CheckedIn' } });

    // 1. Arrival tomorrow: single-room and whole-booking check-in refused (hotel date); nothing changes.
    const early = await book('EARLY', [{ room: r104, from: 1, to: 2 }]);
    await assert.rejects(() => transitionStay(early.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Kofi Early' }), (e: any) => e.code === 'ARRIVAL_NOT_DUE' && /before its arrival date/.test(e.message));
    await assert.rejects(() => checkinBooking(early.reservationId, A), /before its arrival date/);
    assert.equal(await stayStatus(early.reservationRooms[0].reservationRoomId), 'Reserved');
    console.log('1 ok: check-in before the arrival date is refused on the server (single room and whole booking)');

    // 2. Same-day arrival (any hour) checks in.
    const sameDay = await book('TODAY', [{ room: r104, from: 0, to: 1 }]);
    await transitionStay(sameDay.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Esi Today' });
    assert.equal(await stayStatus(sameDay.reservationRooms[0].reservationRoomId), 'CheckedIn');
    console.log('2 ok: a same-day arrival checks in whatever the hour');

    // 3. Room 105 case: previous guest still checked in past departure; two-room booking arriving today.
    const overdue = await book('OVER', [{ room: r105, from: -2, to: 0, status: 'CheckedIn', name: 'Yaw Overstay' }], 'InHouse');
    await prisma.room.update({ where: { roomId: r105.roomId }, data: { operationalStatus: 'Occupied' } });
    const pair = await book('PAIR', [{ room: r105, from: 0, to: 2 }, { room: r103, from: 0, to: 2 }]);
    const [blocked, free] = pair.reservationRooms;
    await assert.rejects(() => transitionStay(blocked.reservationRoomId, 'CheckedIn', A, { occupantName: 'Ama Arriving' }), (e: any) => {
      assert.equal(e.code, 'ROOM_CONFLICT'); assert.equal(e.statusCode, 409);
      assert.match(e.message, new RegExp(`Room 105 is still occupied by Yaw Overstay \\(${code}-OVER\\)`));
      assert.match(e.message, /Check that guest out \(or verify their departure\) first, or move this guest to another room/);
      assert.equal(e.details.confirmationCode, `${code}-OVER`); assert.equal(e.details.status, 'CheckedIn');
      return true;
    });
    await transitionStay(free.reservationRoomId, 'CheckedIn', A, { occupantName: 'Kwame Other' });
    assert.equal(await stayStatus(blocked.reservationRoomId), 'Reserved');
    assert.equal(await stayStatus(free.reservationRoomId), 'CheckedIn');
    assert.equal(await occupants(r105.roomId), 1, 'no double occupancy');
    assert.equal(await stayStatus(overdue.reservationRooms[0].reservationRoomId), 'CheckedIn', 'previous guest untouched');
    console.log('3 ok: overdue occupant blocks Room 105 with a clear message; the other room of the booking checks in; no double occupancy');

    // 4. Two reservations for the same room and nights (data error) → names the other booking.
    await book('DUP1', [{ room: r102, from: 0, to: 1, name: 'Abena First' }]);
    const dup2 = await book('DUP2', [{ room: r102, from: 0, to: 1 }]);
    await assert.rejects(() => transitionStay(dup2.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Kojo Second' }),
      new RegExp(`Room 102 is already reserved for Abena First \\(${code}-DUP1\\), .+ Move one of the two bookings`));
    assert.equal(await occupants(r102.roomId), 0);
    console.log('4 ok: overlapping reservation conflict names the other booking and its dates');

    // 5. Online availability (same filter for search, online booking and late-payment allocation).
    // 104: occupied tonight, leaves tomorrow. 105: overdue guest. 103: occupied until day 2. 102: reserved tonight. 101: under maintenance.
    await prisma.room.update({ where: { roomId: r101.roomId }, data: { operationalStatus: 'Maintenance', maintenanceReason: 'Plumbing repair' } });
    await prisma.room.updateMany({ where: { roomId: { in: [r103.roomId, r104.roomId] } }, data: { operationalStatus: 'Occupied' } });
    await book('NEXTWK', [{ room: r102, from: 7, to: 9 }]);
    const free_ = async (from: number, to: number) => (await prisma.room.findMany({ where: { propertyId: hotel.propertyId, ...onlineBookableRoom(day(from), day(to)) }, orderBy: { roomNumber: 'asc' } })).map(r => r.roomNumber);
    assert.deepEqual(await free_(0, 1), [], 'tonight everything is taken, overdue or in maintenance');
    assert.deepEqual(await free_(1, 2), ['102'], 'tomorrow: only 102 (its two bookings end tonight); 104 and 105 are reserved, 103 still occupied');
    assert.deepEqual(await free_(3, 5), ['102', '103', '104', '105'], 'rooms occupied today are offered for future dates');
    assert.deepEqual(await free_(8, 10), ['103', '104', '105'], 'future reservation still blocks its nights');
    assert.equal(await prisma.room.count({ where: { propertyId: other.propertyId, ...onlineBookableRoom(day(3), day(5)) } }), 0, 'other hotel unaffected');
    console.log('5 ok: online availability — occupied-today rooms offered for future dates; overdue, maintenance and overlaps respected');
    console.log('\nAll check-in and availability checks passed.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.property.delete({ where: { propertyId: other.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
