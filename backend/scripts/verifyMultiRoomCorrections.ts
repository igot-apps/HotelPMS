import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { correctBooking, correctBookingInTransaction } from '../src/modules/reservation/recovery.service';
import { createRequest, reviewRequest, previewRequest } from '../src/modules/reservation/correction-approval.service';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local tests only');
  const code = `multi-${randomUUID().slice(0, 8)}`;
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Multi-room fixture', businessName: 'Test', country: 'Ghana', propertyType: 'Hotel' } });
  let userIds: number[] = [];
  try {
    const roles = await prisma.role.findMany({ where: { roleName: { in: ['Manager', 'Receptionist'] } } });
    const users = [];
    for (const role of roles) users.push(await prisma.user.create({ data: { propertyId: hotel.propertyId, username: `${code}-${role.roleName}`, fullName: role.roleName, roleId: role.roleId, passwordHash: 'no-fixture-login' } }));
    userIds = users.map(u => u.userId);
    const m = { userId: users.find(u => u.roleId === roles.find(r => r.roleName === 'Manager')!.roleId)!.userId, propertyId: hotel.propertyId };
    const r = { userId: users.find(u => u.userId !== m.userId)!.userId, propertyId: hotel.propertyId };
    const type = await prisma.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 200 } });
    const rooms = [];
    for (let i = 1; i <= 3; i++) rooms.push(await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: type.roomTypeId, roomNumber: `10${i}`, operationalStatus: 'Occupied', housekeepingStatus: 'Clean' } }));
    const from = new Date('2030-01-01'), to = new Date('2030-01-02');
    const res = await prisma.reservation.create({ data: { propertyId: hotel.propertyId, confirmationCode: code, checkInDate: from, checkOutDate: to, status: 'InHouse', totalAmount: 600, amountPaid: 0, reservationRooms: { create: rooms.map(room => ({ roomId: room.roomId, roomTypeId: type.roomTypeId, roomNumberSnapshot: room.roomNumber, checkInDate: from, checkOutDate: to, agreedPricePerNight: 200, status: 'CheckedIn', actualCheckIn: new Date() })) } }, include: { reservationRooms: { orderBy: { reservationRoomId: 'asc' } } } });
    const ids = res.reservationRooms.slice(0, 2).map(stay => stay.reservationRoomId);
    const input = { action: 'undo-checkin', stayIds: ids, reason: 'Both rooms checked in by mistake.' };
    const p = await correctBooking(res.reservationId, m, { ...input, preview: true });
    assert.equal(p.roomLabels.length, 2);
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: res.reservationId, status: 'CheckedIn' } }), 3, 'Preview must not change any stay');
    await assert.rejects(correctBooking(res.reservationId, r, { ...input, expectedVersion: p.version }), /approval/);
    for (const bad of [[], [ids[0], ids[0]], [ids[0], 99999999], ['1']]) await assert.rejects(correctBooking(res.reservationId, m, { ...input, stayIds: bad, preview: true }), /Select|belong/);
    await assert.rejects(correctBooking(res.reservationId, m, { ...input, action: 'transfer', preview: true }), /Transfers/);
    const req = await createRequest(r, res.reservationId, { ...input, expectedVersion: p.version });
    assert.deepEqual((req.input as any).stayIds, ids);
    assert((req.input as any).roomLabel.includes('101') && (req.input as any).roomLabel.includes('102'));
    // A room becoming unavailable aborts the entire group and leaves approval pending.
    await prisma.room.update({ where: { roomId: rooms[1].roomId }, data: { operationalStatus: 'Available' } });
    await assert.rejects(reviewRequest(m, req.requestId, { decision: 'approve', expectedVersion: p.version }), /occupancy/);
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: res.reservationId, status: 'CheckedIn' } }), 3);
    assert.equal((await prisma.correctionRequest.findUniqueOrThrow({ where: { requestId: req.requestId } })).status, 'Pending');
    await prisma.room.update({ where: { roomId: rooms[1].roomId }, data: { operationalStatus: 'Occupied' } });
    await previewRequest(m, req.requestId);
    await reviewRequest(m, req.requestId, { decision: 'approve', expectedVersion: p.version });
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: res.reservationId, status: 'Reserved' } }), 2);
    assert.equal((await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: res.reservationRooms[2].reservationRoomId } })).status, 'CheckedIn');
    const date = { action: 'correct-date', stayIds: ids, newCheckOutDate: '2030-01-03', reason: 'Guest extends both selected rooms.' };
    const dp = await correctBooking(res.reservationId, m, { ...date, preview: true });
    assert.equal(dp.newTotal, 1000);
    await correctBooking(res.reservationId, m, { ...date, expectedVersion: dp.version });
    assert.equal(Number((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId } })).totalAmount), 1000);
    assert.equal((await prisma.reservationRoom.findUniqueOrThrow({ where: { reservationRoomId: res.reservationRooms[2].reservationRoomId } })).checkOutDate.toISOString(), to.toISOString());
    for (const stayId of ids) await prisma.reservationRoom.update({ where: { reservationRoomId: stayId }, data: { status: 'CheckedIn', actualCheckIn: new Date() } });
    for (const room of rooms.slice(0, 2)) await prisma.room.update({ where: { roomId: room.roomId }, data: { operationalStatus: 'Occupied', housekeepingStatus: 'Clean' } });
    const credit = { action: 'credit-checkout', stayIds: ids, reason: 'Company will pay after departure.' };
    const cp = await correctBooking(res.reservationId, m, { ...credit, preview: true });
    await correctBooking(res.reservationId, m, { ...credit, expectedVersion: cp.version });
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: res.reservationId, status: 'CheckedOut' } }), 2);
    assert.equal((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: res.reservationId } })).status, 'InHouse');
    const undo = { ...input, action: 'undo-checkout' };
    const up = await correctBooking(res.reservationId, m, { ...undo, preview: true });
    await correctBooking(res.reservationId, m, { ...undo, expectedVersion: up.version });
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: res.reservationId, status: 'CheckedIn' } }), 3);
    // Inject a failure after the first stay write to prove real DB rollback restores it.
    const beforeFailure = await correctBooking(res.reservationId, m, { ...input, preview: true });
    let writes = 0;
    await assert.rejects(prisma.$transaction(async tx => {
      const wrapped = new Proxy(tx, { get(target, key) { if (key === 'reservationRoom') return { ...target.reservationRoom, update: async (args: any) => { writes++; if (writes === 2) throw new Error('Injected second room failure'); return target.reservationRoom.update(args); } }; return (target as any)[key]; } });
      await correctBookingInTransaction(wrapped, res.reservationId, m, { ...input, expectedVersion: beforeFailure.version });
    }), /Injected/);
    assert.equal(writes, 2);
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: res.reservationId, status: 'CheckedIn' } }), 3);
    assert.equal(await prisma.room.count({ where: { propertyId: hotel.propertyId, operationalStatus: 'Occupied' } }), 3);
    console.log('PASS: multi-room preview, scoped selection, one approval for several rooms, grouped undo/checkout, combined repricing, unchanged unselected rooms and rollback after a partial write.');
  } finally {
    await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
