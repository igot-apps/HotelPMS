import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function main() {
  const testPhone = '0540883880';
  console.log(`🔍 Testing Data Isolation for Phone: ${testPhone}\n`);

  // 🛡️ STEP 1: STRICTLY look in the ONLINE guest table (PlatformGuest)
  // We DO NOT look in PropertyGuest (PMS local guests). This guarantees zero data corruption.
  const onlineGuest = await prisma.platformGuest.findUnique({
    where: { phone: testPhone }
  });

  if (!onlineGuest) {
    console.log('❌ No ONLINE guest found with this phone.');
    console.log('✅ (If a local PMS guest has this phone, they are safely isolated in the PropertyGuest table and cannot access this data).');
    return;
  }

  console.log(`✅ Found ONLINE Guest: ${onlineGuest.fullName} (ID: ${onlineGuest.guestId})\n`);

  // 🛡️ STEP 2: Fetch reservations using the ONLINE guest's ID AND enforce source = 'Website'
  const reservations = await prisma.reservation.findMany({
    where: {
      platformGuestId: onlineGuest.guestId, // 🔒 Core security: Only fetch reservations tied to this specific online account
      source: 'Website'                     // 🔒 Core security: Only fetch web bookings
    },
    include: {
      property: { 
        select: { propertyName: true, city: true, propertyCode: true } 
      },
      reservationRooms: {
        include: { 
          roomType: { select: { typeName: true } } 
        }
      }
    },
    orderBy: { checkInDate: 'desc' }
  });

  console.log(`📅 Found ${reservations.length} 'Website' Reservation(s) for this online guest:\n`);
  console.log(JSON.stringify(reservations, null, 2));
}

main()
  .catch((e) => console.error('❌ Playground Error:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });