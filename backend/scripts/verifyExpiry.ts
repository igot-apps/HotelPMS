// End-to-end check of automatic reservation expiry, against the LOCAL database only.
// Creates two throwaway fixture hotels, runs the scenarios, then deletes them. Sweeps are always scoped to
// the fixture hotels, so no other local data is touched.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { EXPIRED_MESSAGE, checkinBooking, expireUnarrivedStays, transitionStay } from '../src/modules/reservation/recovery.service';
import { onlineBookableRoom } from '../src/modules/reservation/stay-timing';
import { hotelDate } from '../src/modules/reports/daily-overview.service';
import { getDashboardGlance } from '../src/modules/dashboard/glance.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = 'exp-' + randomUUID().slice(0, 8);
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Expiry fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra', checkInTime: '14:00' } });
  const other = await prisma.property.create({ data: { propertyCode: `${code}-x`, propertyName: 'Other hotel', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel', timezone: 'Africa/Accra' } });
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const desk = await prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-r`, fullName: 'Ama Desk', roleId: role.roleId, passwordHash: 'no-login' } });
    const A = { userId: desk.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 100 } });
    const otherType = await prisma.roomType.create({ data: { propertyId: other.propertyId, typeName: 'Standard', basePrice: 100 } });
    const room = (propertyId: number, roomTypeId: number, n: string) => prisma.room.create({ data: { propertyId, roomTypeId, roomNumber: n, housekeepingStatus: 'Clean', isOnlineBookable: true } });
    const [r101, r102, r103, r104, r105, r106] = await Promise.all(['101', '102', '103', '104', '105', '106'].map(n => room(hotel.propertyId, type.roomTypeId, n)));
    const x201 = await room(other.propertyId, otherType.roomTypeId, '201');
    const today = hotelDate(new Date(), 'Africa/Accra');
    const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000);
    const book = (suffix: string, stays: { room: any; from: number; to: number; status?: string }[], money = { total: 100, paid: 0 }, status = 'Confirmed', propertyId = hotel.propertyId, roomTypeId = type.roomTypeId) => prisma.reservation.create({ data: {
      propertyId, confirmationCode: `${code}-${suffix}`, guestNameSnapshot: `Guest ${suffix}`, source: 'Walk-in', totalAmount: money.total, amountPaid: money.paid, status,
      checkInDate: day(Math.min(...stays.map(s => s.from))), checkOutDate: day(Math.max(...stays.map(s => s.to))),
      reservationRooms: { create: stays.map(s => ({ roomId: s.room.roomId, roomTypeId, roomNumberSnapshot: s.room.roomNumber, checkInDate: day(s.from), checkOutDate: day(s.to), agreedPricePerNight: 100,
        status: s.status || 'Reserved', occupantName: `Occupant ${suffix}`, ...(['CheckedIn', 'CheckedOut'].includes(s.status || '') ? { actualCheckIn: day(s.from) } : {}), ...(s.status === 'CheckedOut' ? { actualCheckOut: day(s.to) } : {}) })) },
    }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });
    const stayStatus = async (id: number) => (await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: id } })).status;
    const resOf = (id: string) => prisma.reservation.findUniqueOrThrow({ where: { reservationId: id } });
    const audits = (id: string, action: string) => prisma.auditLog.findMany({ where: { action, newData: { path: ['reservationId'], equals: id } } });
    const expired = (e: any) => e.message === EXPIRED_MESSAGE;

    // Set up every situation first, then run one sweep for this hotel.
    const single = await book('SINGLE', [{ room: r101, from: -2, to: 0 }], { total: 200, paid: 50 });
    const late = await book('LATE', [{ room: r102, from: -1, to: 1 }]);
    const mixed = await book('MIX', [{ room: r103, from: -3, to: -1, status: 'CheckedOut' }, { room: r104, from: -2, to: 2, status: 'CheckedIn' }, { room: r105, from: -2, to: 0 }], { total: 900, paid: 300 }, 'InHouse');
    const owed = await book('OWED', [{ room: r103, from: -4, to: -3, status: 'CheckedOut' }, { room: r106, from: -2, to: 0 }], { total: 300, paid: 100 });
    const future = await book('FUTURE', [{ room: r106, from: 1, to: 3 }]);
    const otherHotel = await book('OTHER', [{ room: x201, from: -2, to: 0 }], undefined, 'Confirmed', other.propertyId, otherType.roomTypeId);
    const before = await resOf(single.reservationId);

    // Not swept yet: check-in from the checkout date is refused on the server anyway.
    await assert.rejects(() => transitionStay(single.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Kofi Late' }), expired);
    console.log('0 ok: check-in on the checkout date is refused even before the sweep runs');

    const count = await expireUnarrivedStays(hotel.propertyId, { force: true });
    assert.equal(count, 3, 'SINGLE, MIX room 105 and OWED room 106');

    // 1. Single room: expired, money unchanged, system audit.
    assert.equal(await stayStatus(single.reservationRooms[0].reservationRoomId), 'NoShow');
    const after = await resOf(single.reservationId);
    assert.equal(after.status, 'NoShow');
    assert(after.cancellationDate);
    assert.equal(Number(after.totalAmount), Number(before.totalAmount)); assert.equal(Number(after.amountPaid), Number(before.amountPaid));
    assert.equal(after.refundStatus, before.refundStatus); assert.equal(Number(after.refundDue || 0), Number(before.refundDue || 0));
    const [log] = await audits(single.reservationId, 'RoomExpired');
    assert(log && log.userId === null, 'system audit entry');
    assert.deepEqual((log.newData as any).value.rooms, ['Room 101']);
    console.log('1 ok: single room expires on its checkout date; payments, balance and refund untouched; system audit written');

    // 2. Late arrival before the checkout date still checks in.
    assert.equal(await stayStatus(late.reservationRooms[0].reservationRoomId), 'Reserved');
    await transitionStay(late.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Esi Late' });
    assert.equal(await stayStatus(late.reservationRooms[0].reservationRoomId), 'CheckedIn');
    console.log('2 ok: a guest arriving late (before the checkout date) checks in');

    // 3. After expiry: single room and whole booking check-in refused with the guest-facing message.
    await assert.rejects(() => transitionStay(single.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Kofi Late' }), expired);
    await assert.rejects(() => checkinBooking(single.reservationId, A), expired);
    console.log('3 ok: check-in after expiry says the reservation has expired');

    // 4. Multi-room: only the room nobody checked into expires.
    const [stayed, inRoom, never] = mixed.reservationRooms;
    assert.deepEqual([await stayStatus(stayed.reservationRoomId), await stayStatus(inRoom.reservationRoomId), await stayStatus(never.reservationRoomId)], ['CheckedOut', 'CheckedIn', 'NoShow']);
    assert.equal((await resOf(mixed.reservationId)).status, 'InHouse');
    assert.equal(Number((await resOf(mixed.reservationId)).amountPaid), 300);
    console.log('4 ok: multi-room booking — stayed and in-house rooms untouched, the unarrived room expired');

    // 5. Booking completes with a balance owed: recorded like a checkout with a balance.
    const owedAfter = await resOf(owed.reservationId);
    assert.equal(owedAfter.status, 'Completed');
    assert.equal(Number(owedAfter.amountPaid), 100);
    const [credit] = await audits(owed.reservationId, 'CreditCheckoutApproved');
    assert(credit && (credit.newData as any).value.via === 'expiry' && (credit.newData as any).value.balanceDue === 200);
    console.log('5 ok: booking completed by expiry keeps its GHS 200 owed and appears under owed after checkout');

    // 6. Future reservations and other hotels untouched; expired rooms do not block new bookings.
    assert.equal(await stayStatus(future.reservationRooms[0].reservationRoomId), 'Reserved');
    assert.equal(await stayStatus(otherHotel.reservationRooms[0].reservationRoomId), 'Reserved', 'other hotel not swept by this hotel');
    const free = (await prisma.room.findMany({ where: { propertyId: hotel.propertyId, ...onlineBookableRoom(day(0), day(1)) } })).map(r => r.roomNumber);
    assert(free.includes('101') && free.includes('105'), 'expired rooms are bookable again');
    const fresh = await book('NEW', [{ room: r101, from: 0, to: 1 }]);
    await transitionStay(fresh.reservationRooms[0].reservationRoomId, 'CheckedIn', A, { occupantName: 'Yaa New' });
    console.log('6 ok: future stays and other hotels untouched; an expired room takes a new booking and check-in');

    // 7. Dashboard: expired bookings left Expected arrivals.
    const glance: any = await getDashboardGlance(hotel.propertyId, 'Receptionist');
    const waiting = glance.arrivals.waiting.map((s: any) => s.confirmationCode);
    assert(!waiting.includes(`${code}-SINGLE`) && !waiting.includes(`${code}-OWED`) && !('missed' in glance.arrivals));
    console.log('7 ok: expired bookings are no longer expected arrivals');
    console.log('\nAll expiry checks passed.');
  } finally {
    const ids = (await prisma.reservation.findMany({ where: { propertyId: { in: [hotel.propertyId, other.propertyId] } }, select: { reservationId: true } })).map(r => r.reservationId);
    if (ids.length) await prisma.auditLog.deleteMany({ where: { OR: ids.map(id => ({ newData: { path: ['reservationId'], equals: id } })) } });
    await prisma.auditLog.deleteMany({ where: { user: { propertyId: { in: [hotel.propertyId, other.propertyId] } } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.property.delete({ where: { propertyId: other.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exit(1); });
