import { PrismaClient } from '../src/generated/prisma';
// Note: Use 'bcrypt' if that's what your app uses, or 'bcryptjs'
import bcrypt from 'bcryptjs'; 

const prisma = new PrismaClient();

async function main() {
  const newPassword = 'password123';
  
  // Generate a real, secure bcrypt hash
  const hash = await bcrypt.hash(newPassword, 10);

  // Update both users in the database
  await prisma.user.updateMany({
    where: { 
      username: { in: ['kwame_admin', 'ama_manager'] } 
    },
    data: { passwordHash: hash },
  });

  console.log('\n✅ Success! Passwords have been updated.');
  console.log('👤 Users: kwame_admin, ama_manager');
  console.log(`🔑 New Password: ${newPassword}\n`);
  
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
 
});