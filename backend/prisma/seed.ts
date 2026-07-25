import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const permissionsData = [
  // Reservations
  { code: 'CanCreateReservation', name: 'Create Reservation', category: 'Reservations' },
  { code: 'CanCancelReservation', name: 'Cancel Reservation', category: 'Reservations' },
  { code: 'CanCheckInGuest', name: 'Check In Guest', category: 'Reservations' },
  { code: 'CanCheckOutGuest', name: 'Check Out Guest', category: 'Reservations' },
  
  // Inventory (Rooms)
  { code: 'CanViewRooms', name: 'View Rooms', category: 'Inventory' },
  { code: 'CanCreateRoom', name: 'Create Room', category: 'Inventory' },
  { code: 'CanUpdateRoom', name: 'Update Room', category: 'Inventory' },
  { code: 'CanDeleteRoom', name: 'Delete Room', category: 'Inventory' },
  { code: 'CanCreateRoomType', name: 'Create Room Type', category: 'Inventory' },
  { code: 'CanUpdateRoomType', name: 'Update Room Type', category: 'Inventory' },
  { code: 'CanDeleteRoomType', name: 'Delete Room Type', category: 'Inventory' },
  { code: 'CanUpdateRoomStatus', name: 'Update Room Status', category: 'Inventory' },
  { code: 'CanManageRates', name: 'Manage Rates', category: 'Inventory' },
  
  // Payments, Billing & Reports
  { code: 'CanProcessPayments', name: 'Process Payments', category: 'Billing' },
  { code: 'CanIssueRefunds', name: 'Issue Refunds', category: 'Billing' },
  { code: 'CanViewFinancialReports', name: 'View Financial Reports', category: 'Reports' },
  { code: 'CanManageBilling', name: 'Manage Billing', category: 'Billing' },
  
  // Operations & Admin
  { code: 'CanManageHousekeeping', name: 'Manage Housekeeping', category: 'Operations' },
  { code: 'CanManageMaintenance', name: 'Manage Maintenance', category: 'Operations' },
  { code: 'CanManageStaffAndRoles', name: 'Manage Staff & Roles', category: 'Admin' },
];

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Seed Permissions
  console.log('Seeding permissions...');
  for (const perm of permissionsData) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  // 2. Seed Roles
  console.log('Seeding roles...');
  const adminRole = await prisma.role.upsert({
    where: { roleName: 'Admin' },
    update: {},
    create: { roleName: 'Admin', description: 'Full system access', isSystem: true },
  });

  const managerRole = await prisma.role.upsert({
    where: { roleName: 'Manager' },
    update: {},
    create: { roleName: 'Manager', description: 'Property management access', isSystem: true },
  });

  const receptionistRole = await prisma.role.upsert({
    where: { roleName: 'Receptionist' },
    update: {},
    create: { roleName: 'Receptionist', description: 'Front desk operations', isSystem: true },
  });

  // 3. Link Permissions to Roles
  console.log('Linking permissions to roles...');
  const allPerms = await prisma.permission.findMany();

  // Admin gets EVERYTHING
  for (const perm of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.roleId, permissionId: perm.permissionId } },
      update: {},
      create: { roleId: adminRole.roleId, permissionId: perm.permissionId },
    });
  }

  // Manager gets everything EXCEPT Staff & Roles management
  const managerPerms = allPerms.filter(p => p.code !== 'CanManageStaffAndRoles');
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: managerRole.roleId, permissionId: perm.permissionId } },
      update: {},
      create: { roleId: managerRole.roleId, permissionId: perm.permissionId },
    });
  }

  // Receptionist gets front-desk specific permissions
  const receptionistPermCodes = [
    'CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest',
    'CanViewRooms', 'CanUpdateRoomStatus', 'CanProcessPayments'
  ];
  const receptionistPerms = allPerms.filter(p => receptionistPermCodes.includes(p.code));
  for (const perm of receptionistPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: receptionistRole.roleId, permissionId: perm.permissionId } },
      update: {},
      create: { roleId: receptionistRole.roleId, permissionId: perm.permissionId },
    });
  }

  console.log('✅ Database seeded successfully! Sidebar items will now appear.');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    
  })
  .finally(async () => {
    await prisma.$disconnect();
  });