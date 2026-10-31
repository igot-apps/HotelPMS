import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/shared/utils/prisma';
import { permanentlyDeleteProperty } from '../src/modules/property/property.repository';

async function main() {
  const host = new URL(process.env.DATABASE_URL!).hostname;
  assert(['localhost', '127.0.0.1'].includes(host), 'Local database only.');
  const code = `delete-check-${randomUUID().slice(0, 8)}`;
  const before = await prisma.property.count();
  const role = await prisma.role.findFirstOrThrow();
  const hotel = await prisma.property.create({ data: {
    propertyCode: code, propertyName: 'Deletion test fixture', businessName: 'Test',
    propertyType: 'Hotel', country: 'Ghana',
    users: { create: { fullName: 'Test staff', username: code, email: `${code}@example.test`, passwordHash: 'test-only', roleId: role.roleId } },
    roomTypes: { create: { typeName: 'Test', basePrice: 200 } },
    propertyGuests: { create: { fullName: 'Test guest' } },
  }, include: { users: true, roomTypes: true, propertyGuests: true } });
  const guest = await prisma.platformGuest.create({ data: { fullName: 'Shared guest fixture', phone: code, passwordHash: 'test-only' } });
  try {
    const room = await prisma.room.create({ data: { propertyId: hotel.propertyId, roomTypeId: hotel.roomTypes[0].roomTypeId, roomNumber: '101' } });
    const reservation = await prisma.reservation.create({ data: {
      propertyId: hotel.propertyId, staffId: hotel.users[0].userId,
      propertyGuestId: hotel.propertyGuests[0].guestId, platformGuestId: guest.guestId,
      confirmationCode: code, checkInDate: new Date(), checkOutDate: new Date(Date.now() + 86400000),
      reservationRooms: { create: { roomId: room.roomId, roomTypeId: room.roomTypeId, checkInDate: new Date(), checkOutDate: new Date(Date.now() + 86400000), agreedPricePerNight: 200 } },
    } });
    await prisma.payment.create({ data: { reservationId: reservation.reservationId, propertyId: hotel.propertyId, receivedBy: hotel.users[0].userId, amount: 200, paymentMethod: 'Cash' } });
    await prisma.auditLog.create({ data: { userId: hotel.users[0].userId, action: 'Test', entityType: 'Property', entityId: hotel.propertyId } });
    await prisma.subscriptionPayment.create({ data: { propertyId: hotel.propertyId, initiatedBy: hotel.users[0].userId, reference: code, amount: 100, durationMonths: 1 } });
    await assert.rejects(permanentlyDeleteProperty(hotel.propertyId, 'wrong-code'), /exact property code/);
    assert.equal(await prisma.payment.count({ where: { reservationId: reservation.reservationId } }), 1);
    await permanentlyDeleteProperty(hotel.propertyId, code);
    assert.equal(await prisma.property.count(), before);
    for (const model of [prisma.room, prisma.roomType, prisma.user, prisma.propertyGuest, prisma.reservation, prisma.payment, prisma.subscriptionPayment] as any[]) {
      assert.equal(await model.count({ where: { propertyId: hotel.propertyId } }), 0);
    }
    assert.equal(await prisma.auditLog.count({ where: { userId: hotel.users[0].userId } }), 0);
    assert.equal(await prisma.reservationRoom.count({ where: { reservationId: reservation.reservationId } }), 0);
    assert(await prisma.platformGuest.findUnique({ where: { guestId: guest.guestId } }));
    console.log('Passed: confirmation guard, related-record deletion, shared guest preservation, and existing property count.');
  } finally {
    if (await prisma.property.findUnique({ where: { propertyId: hotel.propertyId } })) await permanentlyDeleteProperty(hotel.propertyId, code);
    await prisma.platformGuest.delete({ where: { guestId: guest.guestId } });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
