import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { prisma } from '../src/shared/utils/prisma';
import { transitionStay, updateOccupantDetails, checkinBooking } from '../src/modules/reservation/recovery.service';
import reservationRoutes from '../src/modules/reservation/reservation.routes';
import { generateAccessToken } from '../src/shared/utils/jwt';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local tests only');
  const code = `occupant-${randomUUID().slice(0, 8)}`;
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Occupant fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel' } });
  let userId: number | undefined;
  try {
    const role = await prisma.role.findUniqueOrThrow({ where: { roleName: 'Receptionist' } });
    const user = await prisma.user.create({ data: { propertyId: hotel.propertyId, roleId: role.roleId, fullName: 'Fixture receptionist', username: code, passwordHash: 'no-fixture-login' } });
    userId = user.userId;
    const actor = { userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 200 } });
    const from = new Date('2030-01-01'), to = new Date('2030-01-02');
    const rooms = [];
    for (let i = 1; i <= 8; i++) rooms.push(await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: `10${i}`, housekeepingStatus: 'Clean' } }));
    const create = (indices: number[], label: string) => prisma.reservation.create({ data: { propertyId: hotel.propertyId, confirmationCode: `${code}-${label}`, status: 'Confirmed', totalAmount: 200 * indices.length, amountPaid: 0, guestNameSnapshot: 'Booking contact', guestPhoneSnapshot: '+233541234567', checkInDate: from, checkOutDate: to, reservationRooms: { create: indices.map(index => ({ roomId: rooms[index].roomId, roomTypeId: type.roomTypeId, roomNumberSnapshot: rooms[index].roomNumber, agreedPricePerNight: 200, checkInDate: from, checkOutDate: to })) } }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });
    const booking = await create([0, 1, 2], 'group');
    const [a, b, c] = booking.reservationRooms;
    assert(booking.reservationRooms.every(stay => stay.occupantName === null));
    await assert.rejects(checkinBooking(booking.reservationId, actor), /actual occupant/);
    await assert.rejects(transitionStay(a.reservationRoomId, 'CheckedIn', actor, {}), /occupant name/);
    const first = { occupantName: 'Ada Mensah', occupantPhone: '0541234567' };
    await transitionStay(a.reservationRoomId, 'CheckedIn', actor, first);
    const app = express(); app.use(express.json()); app.use('/api/reservations', reservationRoutes);
    const token = generateAccessToken({ ...actor, username: user.username, roleId: role.roleId });
    const endpoint = `/api/reservations/rooms/${b.reservationRoomId}/status`;
    const warning = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ status: 'CheckedIn', occupantName: '  ADA   MENSAH ', occupantPhone: '+233541234567' });
    assert.equal(warning.status, 409);
    assert.equal(warning.body.code, 'OCCUPANT_ALREADY_CHECKED_IN');
    assert.equal(warning.body.details.conflicts[0].roomNumber, '101');
    assert.equal((await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: b.reservationRoomId } })).status, 'Reserved');
    // Confirmation is tied to the exact identity and conflicts, not a blanket bypass.
    await prisma.reservationRoom.update({ where: { reservationRoomId: a.reservationRoomId }, data: { occupantPhone: '0540000001' } });
    await assert.rejects(transitionStay(b.reservationRoomId, 'CheckedIn', actor, { ...first, occupantPhone: '0540000001', duplicateOccupantConfirmation: warning.body.details.confirmation }), (e: any) => e.code === 'OCCUPANT_ALREADY_CHECKED_IN');
    await updateOccupantDetails(a.reservationRoomId, actor, first);
    const fresh = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ status: 'CheckedIn', ...first });
    assert.equal(fresh.status, 409);
    const intentional = await request(app).patch(endpoint).set('Authorization', `Bearer ${token}`).send({ status: 'CheckedIn', ...first, duplicateOccupantConfirmation: fresh.body.details.confirmation });
    assert.equal(intentional.status, 200);
    const history = await prisma.auditLog.findFirstOrThrow({ where: { userId, action: 'CheckedIn', newData: { path: ['reservationId'], equals: booking.reservationId } }, orderBy: { auditLogId: 'desc' } });
    assert.equal((history.newData as any).value.confirmedDuplicates.length, 1);
    // Same names with different phones, and no-phone entries, remain valid.
    await transitionStay(c.reservationRoomId, 'CheckedIn', actor, { occupantName: 'Ada Mensah', occupantPhone: '0540000003' });
    const editWarning = await request(app).patch(`/api/reservations/rooms/${c.reservationRoomId}/occupant`).set('Authorization', `Bearer ${token}`).send(first);
    assert.equal(editWarning.status, 409);
    assert.equal(editWarning.body.code, 'OCCUPANT_ALREADY_CHECKED_IN');
    assert.equal((await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: c.reservationRoomId } })).occupantPhone, '0540000003');
    await updateOccupantDetails(c.reservationRoomId, actor, { occupantName: 'Different room guest', occupantPhone: '' });
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: booking.reservationId } })).guestNameSnapshot, 'Booking contact');
    const noPhone = await create([3], 'no-phone');
    await transitionStay(noPhone.reservationRooms[0].reservationRoomId, 'CheckedIn', actor, { occupantName: 'Ada Mensah', occupantPhone: '' });
    // Cross-hotel reads cannot edit a stay or reveal its occupants.
    await assert.rejects(updateOccupantDetails(a.reservationRoomId, { ...actor, propertyId: hotel.propertyId + 99999 }, first), /not found/);
    const one = await create([4], 'race-a'), two = await create([5], 'race-b');
    const identity = { occupantName: 'Concurrent guest', occupantPhone: '0540000004' };
    const concurrent = await Promise.allSettled([transitionStay(one.reservationRooms[0].reservationRoomId, 'CheckedIn', actor, identity), transitionStay(two.reservationRooms[0].reservationRoomId, 'CheckedIn', actor, identity)]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = concurrent.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal(rejected.reason.code, 'OCCUPANT_ALREADY_CHECKED_IN');
    console.log('PASS: explicit occupants, no contact copying, duplicate warnings/confirmation, stale confirmation rejection, same-name and optional-phone support, editing without contact changes, audit and concurrent check-ins.');
  } finally {
    if (userId) await prisma.auditLog.deleteMany({ where: { userId } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
