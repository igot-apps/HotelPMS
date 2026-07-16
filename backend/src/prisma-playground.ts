import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function fixSidebarPermissions() {
  console.log('\n🛠️ =========================================');
  console.log('🛠️ FIXING SIDEBAR PERMISSIONS (EXACT MATCH)...');
  console.log('🛠️ =========================================\n');

  try {
    // 🌟 THESE ARE THE EXACT STRINGS FROM YOUR Sidebar.jsx
    const sidebarPermissions = [
      // Operations
      { code: 'CanCreateReservation', name: 'Create Reservation', category: 'Reservations' },
      { code: 'CanProcessPayments', name: 'Process Payments', category: 'Payments' },
      { code: 'CanViewFinancialReports', name: 'View Financial Reports', category: 'Reports' },
      
      // Configuration
      { code: 'CanCreateRoom', name: 'Create Room', category: 'Rooms' },
      { code: 'CanManageStaffAndRoles', name: 'Manage Staff & Roles', category: 'Settings' },
      { code: 'CanCreateRoomType', name: 'Create Room Type', category: 'Rooms' },
      { code: 'CanManageRates', name: 'Manage Rates', category: 'Rooms' },

      // Extra backend permissions (from room.routes.ts) just to be safe
      { code: 'CanUpdateRoomType', name: 'Update Room Type', category: 'Rooms' },
      { code: 'CanDeleteRoomType', name: 'Delete Room Type', category: 'Rooms' },
      { code: 'CanUpdateRoom', name: 'Update Room', category: 'Rooms' },
      { code: 'CanDeleteRoom', name: 'Delete Room', category: 'Rooms' },
      { code: 'CanUpdateRoomStatus', name: 'Update Room Status', category: 'Rooms' },
      { code: 'CanRecordPayment', name: 'Record Payment', category: 'Payments' },
    ];

    console.log('📝 Creating exact permission codes...');
    for (const perm of sidebarPermissions) {
      await prisma.permission.upsert({
        where: { code: perm.code },
        update: {},
        create: perm,
      });
    }

    // 🌟 LINK EVERYTHING TO THE MANAGER ROLE (ID: 1)
    console.log('🔗 Linking ALL permissions to Manager role...');
    const managerRole = await prisma.role.findUnique({ where: { roleId: 1 } });

    if (managerRole) {
      // 1. Clear old links
      await prisma.rolePermission.deleteMany({ where: { roleId: 1 } });
      
      // 2. Fetch all permissions from DB
      const dbPermissions = await prisma.permission.findMany();
      
      // 3. Create fresh links
      await prisma.rolePermission.createMany({
        data: dbPermissions.map(p => ({
          roleId: 1,
          permissionId: p.permissionId,
        })),
      });
      console.log(`✅ SUCCESS! Linked ${dbPermissions.length} permissions to Manager role.`);
    } else {
      console.log('⚠️ Manager role (ID: 1) not found.');
    }

  } catch (error: any) {
    console.error('❌ ERROR:', error.message);
  }

  console.log('\n🔍 =========================================');
  console.log('🔍 FIX COMPLETE.');
  console.log('🔍 =========================================\n');
  await prisma.$disconnect();
}

fixSidebarPermissions();