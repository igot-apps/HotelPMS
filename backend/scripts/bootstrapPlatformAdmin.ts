import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import { hashPassword } from '../src/shared/utils/password';

const prisma = new PrismaClient();

async function main() {
  const phone = process.env.PLATFORM_ADMIN_PHONE?.replace(/\D/g, '');
  const initialPassword = process.env.PLATFORM_ADMIN_INITIAL_PASSWORD;
  const fullName = process.env.PLATFORM_ADMIN_NAME?.trim() || 'Platform Administrator';

  if (!phone || !/^\d{10}$/.test(phone)) {
    throw new Error('Set PLATFORM_ADMIN_PHONE to the platform administrator 10-digit phone number.');
  }
  if (!initialPassword || initialPassword.length < 8) {
    throw new Error('Set PLATFORM_ADMIN_INITIAL_PASSWORD to a one-time password of at least 8 characters.');
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ phone }, { username: `platform_admin_${phone}` }] },
  });
  if (existing) {
    if (existing.propertyId !== null) {
      throw new Error('That phone belongs to a hotel account. Use a separate phone for the platform administrator.');
    }
    if (existing.isPlatformAdmin) {
      console.log('Platform administrator account already exists; no changes made.');
      return;
    }
  }

  const role = await prisma.role.upsert({
    where: { roleName: 'Platform Admin' },
    update: {},
    create: { roleName: 'Platform Admin', description: 'Platform-level property administration', isSystem: true },
  });
  const passwordHash = await hashPassword(initialPassword);

  if (existing) {
    await prisma.user.update({
      where: { userId: existing.userId },
      data: { isPlatformAdmin: true, isActive: true, passwordHash, roleId: role.roleId },
    });
  } else {
    await prisma.user.create({
      data: {
        propertyId: null,
        phone,
        fullName,
        username: `platform_admin_${phone}`,
        passwordHash,
        roleId: role.roleId,
        isPlatformAdmin: true,
        isActive: true,
      },
    });
  }

  console.log(`Platform administrator account created for phone ending in ${phone.slice(-4)}.`);
}

main()
  .catch((error) => {
    console.error(error.message || 'Could not bootstrap platform administrator.');
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
