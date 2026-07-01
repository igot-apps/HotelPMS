// prisma/seed.js
const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create Tenants
  const brassfield = await prisma.tenant.upsert({
    where: { tenantCode: 'BRASSFIELD' },
    update: {},
    create: {
      tenantCode: 'BRASSFIELD',
      businessName: 'Brassfield Hotel',
      legalName: 'Brassfield Hospitality Ltd.',
      subscriptionPlan: 'Growth',
      subscriptionStatus: 'Active',
      currency: 'GHS',
      timezone: 'Africa/Accra',
      country: 'Ghana',
      primaryEmail: 'info@brassfieldhotel.com',
      primaryPhone: '0244000001',
      isActive: true,
    },
  });

  const goldcoast = await prisma.tenant.upsert({
    where: { tenantCode: 'GOLDCOAST' },
    update: {},
    create: {
      tenantCode: 'GOLDCOAST',
      businessName: 'Gold Coast Resort',
      legalName: 'Gold Coast Resorts Ltd.',
      subscriptionPlan: 'Starter',
      subscriptionStatus: 'Active',
      currency: 'GHS',
      timezone: 'Africa/Accra',
      country: 'Ghana',
      primaryEmail: 'info@goldcoastresort.com',
      primaryPhone: '0244000002',
      isActive: true,
    },
  });

  console.log('✅ Tenants created');

  // 2. Create Properties
  const brassfieldProperty = await prisma.property.upsert({
    where: {
      tenantId_propertyCode: {
        tenantId: brassfield.tenantId,
        propertyCode: 'BFH-ACC',
      },
    },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyName: 'Brassfield Hotel - Accra',
      propertyCode: 'BFH-ACC',
      propertyType: 'Hotel',
      address: '12 Independence Ave',
      city: 'Accra',
      country: 'Ghana',
      gpsCoordinates: '5.6037,-0.1870',
      totalRooms: 6,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      status: 'Active',
    },
  });

  const goldcoastProperty = await prisma.property.upsert({
    where: {
      tenantId_propertyCode: {
        tenantId: goldcoast.tenantId,
        propertyCode: 'GCR-TKD',
      },
    },
    update: {},
    create: {
      tenantId: goldcoast.tenantId,
      propertyName: 'Gold Coast Resort - Takoradi',
      propertyCode: 'GCR-TKD',
      propertyType: 'Resort',
      address: 'Beach Road',
      city: 'Takoradi',
      country: 'Ghana',
      gpsCoordinates: '4.8845,-1.7554',
      totalRooms: 4,
      checkInTime: '15:00',
      checkOutTime: '11:00',
      status: 'Active',
    },
  });

  console.log('✅ Properties created');

  // 3. Create Roles
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { roleName: 'Super Admin' },
      update: {},
      create: { roleName: 'Super Admin', description: 'Full system access', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'General Manager' },
      update: {},
      create: { roleName: 'General Manager', description: 'Full hotel access', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'Front Desk' },
      update: {},
      create: { roleName: 'Front Desk', description: 'Reception and reservations', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'Reservations Agent' },
      update: {},
      create: { roleName: 'Reservations Agent', description: 'Create and manage reservations', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'Accountant' },
      update: {},
      create: { roleName: 'Accountant', description: 'Financial transactions and reports', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'Housekeeping' },
      update: {},
      create: { roleName: 'Housekeeping', description: 'Room cleaning and status', isSystem: true },
    }),
  ]);

  console.log('✅ Roles created');

  // 4. Create Users (with hashed passwords)
  const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
  };

  const userPassword = await hashPassword('reception123');
  const managerPassword = await hashPassword('manager123');

  const frontDeskRole = roles.find(r => r.roleName === 'Front Desk');
  const managerRole = roles.find(r => r.roleName === 'General Manager');

  await prisma.user.upsert({
    where: { username: 'jmensah' },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyId: brassfieldProperty.propertyId,
      fullName: 'John Mensah',
      username: 'jmensah',
      email: 'john.mensah@brassfieldhotel.com',
      passwordHash: userPassword,
      roleId: frontDeskRole.roleId,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'gtetteh' },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyId: brassfieldProperty.propertyId,
      fullName: 'Grace Tetteh',
      username: 'gtetteh',
      email: 'grace.tetteh@brassfieldhotel.com',
      passwordHash: managerPassword,
      roleId: managerRole.roleId,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'efosu' },
    update: {},
    create: {
      tenantId: goldcoast.tenantId,
      propertyId: goldcoastProperty.propertyId,
      fullName: 'Efua Osu',
      username: 'efosu',
      email: 'efua.osu@goldcoastresort.com',
      passwordHash: userPassword,
      roleId: frontDeskRole.roleId,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'kdarko' },
    update: {},
    create: {
      tenantId: goldcoast.tenantId,
      propertyId: goldcoastProperty.propertyId,
      fullName: 'Kojo Darko',
      username: 'kdarko',
      email: 'kojo.darko@goldcoastresort.com',
      passwordHash: managerPassword,
      roleId: managerRole.roleId,
      isActive: true,
    },
  });

  console.log('✅ Users created');

  // 5. Create Permissions
  const permissions = [
    { code: 'CanCreateReservation', name: 'Create Reservation', category: 'Reservations' },
    { code: 'CanCancelReservation', name: 'Cancel Reservation', category: 'Reservations' },
    { code: 'CanCheckInGuest', name: 'Check In Guest', category: 'Reservations' },
    { code: 'CanCheckOutGuest', name: 'Check Out Guest', category: 'Reservations' },
    { code: 'CanManageRates', name: 'Manage Rates', category: 'Inventory' },
    { code: 'CanViewFinancialReports', name: 'View Financial Reports', category: 'Reports' },
    { code: 'CanProcessPayments', name: 'Process Payments', category: 'Payments' },
    { code: 'CanIssueRefunds', name: 'Issue Refunds', category: 'Payments' },
    { code: 'CanManageHousekeeping', name: 'Manage Housekeeping', category: 'Operations' },
    { code: 'CanManageMaintenance', name: 'Manage Maintenance', category: 'Operations' },
    { code: 'CanManageStaffAndRoles', name: 'Manage Staff & Roles', category: 'Admin' },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: perm,
    });
  }

  console.log('✅ Permissions created');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });