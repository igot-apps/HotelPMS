// 🚨 PROOF OF CUSTOM SCRIPT: THIS IS NOT THE SAFE DIAGNOSTIC TOOL!
// If you see the output below, it means the CLI tool successfully skipped overwriting this file.
import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function runCustomProof() {
  console.log('\n🚨 =========================================');
  console.log('🚨 THIS IS MY CUSTOM PLAYGROUND SCRIPT!');
  console.log('🚨 IT WAS NOT OVERWRITTEN BY THE CLI TOOL!');
  console.log('🚨 =========================================\n');

  try {
    // 🌟 Custom logic to prove this is YOUR file
    const totalProperties = await prisma.property.count();
    const totalUsers = await prisma.user.count();
    const totalRooms = await prisma.room.count();
    
    console.log(`📊 CUSTOM SCRIPT DATABASE STATS:`);
    console.log(`   - Total Properties: ${totalProperties}`);
    console.log(`   - Total Users: ${totalUsers}`);
    console.log(`   - Total Rooms: ${totalRooms}`);
    
    // Fetch the latest room type to show we can do custom queries
    const latestRoomType = await prisma.roomType.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { typeName: true, basePrice: true }
    });
    
    if (latestRoomType) {
        console.log(`\n🛏️  LATEST ROOM TYPE IN DB:`);
        console.log(`   - Name: ${latestRoomType.typeName}`);
        console.log(`   - Price: GH₵${latestRoomType.basePrice}`);
    }

    console.log('\n✅ CUSTOM SCRIPT EXECUTED SUCCESSFULLY!');
    console.log('✅ THIS FILE IS NOW YOUR PRIVATE SANDBOX.');
    console.log('✅ YOU CAN WRITE ANY TEST CODE (EVEN DESTRUCTIVE) BELOW THIS LINE.\n');
     
  } catch (error: any) {
    console.error('❌ CUSTOM SCRIPT ERROR:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

runCustomProof();