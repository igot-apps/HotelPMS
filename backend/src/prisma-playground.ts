import { PrismaClient } from '../src/generated/prisma';
const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Forcing Billing Permissions into Database...\n');

  // 1. Ensure BOTH possible permission codes exist in the DB
  const codes = ['CanManageBilling', 'CanManageStaffAndRoles'];
  for (const code of codes) {
    await prisma.permission.upsert({
      where: { code },
      update: {},
      create: { code, name: code, category: 'Settings' },
    });
  }
  console.log('✅ Permission codes ensured in database.');

  // 2. Fetch the permissions and roles
  const perms = await prisma.permission.findMany({ where: { code: { in: codes } } });
  const admin = await prisma.role.findUnique({ where: { roleName: 'Admin' } });
  const manager = await prisma.role.findUnique({ where: { roleName: 'Manager' } });

  // 3. Force-link them to Admin
  if (admin) {
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: admin.roleId, permissionId: p.permissionId } },
        update: {},
        create: { roleId: admin.roleId, permissionId: p.permissionId },
      });
    }
    console.log('✅ Linked to Admin role.');
  }

  // 4. Force-link them to Manager
  if (manager) {
    for (const p of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: manager.roleId, permissionId: p.permissionId } },
        update: {},
        create: { roleId: manager.roleId, permissionId: p.permissionId },
      });
    }
    console.log('✅ Linked to Manager role.');
  }

  console.log('\n🎉 Done! The database now has the Billing permissions.');
  console.log('👉 CRITICAL NEXT STEP: You MUST log out and log back in!\n');
}

main()
  .catch((e) => console.error('❌ Error:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });