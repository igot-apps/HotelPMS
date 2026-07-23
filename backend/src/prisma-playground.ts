import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Inspecting Reservation & Room Data Structure...\n');

  // 1. Fetch a sample reservation with all its relations
  const sampleReservation = await prisma.reservation.findFirst({
    include: {
      propertyGuest: true,
      platformGuest: true,
      reservationRooms: {
        include: {
          room: { select: { roomId: true, roomNumber: true } },
          roomType: { select: { roomTypeId: true, typeName: true } }
        }
      }
    }
  });

  console.log('📅 Sample Reservation Data:');
  console.log(JSON.stringify(sampleReservation, null, 2));

  // 2. Print the exact field names available on the Reservation model
  if (sampleReservation) {
    console.log('\n🔑 Reservation Model Fields:', Object.keys(sampleReservation));
  }

  // 3. Print the exact field names available on the ReservationRoom model
  const sampleResRoom = await prisma.reservationRoom.findFirst();
  if (sampleResRoom) {
    console.log('\n🛏️ ReservationRoom Model Fields:', Object.keys(sampleResRoom));
  }

  // 4. Find how many reservations have multiple rooms (Potential Group Bookings)
  const allReservations = await prisma.reservation.findMany({
    include: {
      _count: { select: { reservationRooms: true } }
    }
  });

  const multiRoomReservations = allReservations.filter(r => r._count.reservationRooms > 1);
  
  console.log(`\n📊 Total Reservations: ${allReservations.length}`);
  console.log(`👥 Reservations with multiple rooms: ${multiRoomReservations.length}`);

  if (multiRoomReservations.length > 0) {
    console.log('\n📝 Sample Multi-Room Reservation:');
    // Fetch the full details of the first multi-room reservation
    const fullGroupBooking = await prisma.reservation.findUnique({
      where: { reservationId: multiRoomReservations[0].reservationId },
      include: {
        reservationRooms: {
          include: { room: true, roomType: true }
        }
      }
    });
    console.log(JSON.stringify(fullGroupBooking, null, 2));
  }
}

main()
  .catch((e) => console.error('❌ Playground Error:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });