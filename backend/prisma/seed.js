const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with fresh test data...');

  // 1. Clear existing data in correct order to avoid foreign key constraints
  console.log('🧹 Clearing existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.reservationRoom.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.property.deleteMany();

  // 2. Create the Property (The Hotel - Root Entity)
  console.log('🏨 Creating Property...');
  const property = await prisma.property.create({
    data: {
      propertyCode: 'BHA-ACC',
      propertyName: 'Brassfield Hotel - Accra',
      businessName: 'Brassfield Hotel',
      propertyType: 'Hotel',
      address: '123 Airport City, East Legon',
      city: 'Accra',
      country: 'Ghana',
      totalRooms: 50,
      currency: 'GHS',
      timezone: 'Africa/Accra',
      primaryEmail: 'info@brassfieldhotel.com',
      primaryPhone: '+233 20 123 4567',
    },
  });

  // 3. Create Roles
  console.log('👥 Creating Roles...');
  const managerRole = await prisma.role.create({
    data: { roleName: 'Manager', description: 'Full system access', isSystem: true },
  });
  const receptionistRole = await prisma.role.create({
    data: { roleName: 'Receptionist', description: 'Front desk operations', isSystem: true },
  });

  // 4. Create Permissions
  console.log('🔑 Creating Permissions...');
  const permissionsData = [
    { code: 'CanCreateReservation', name: 'Create Reservation', category: 'Reservations' },
    { code: 'CanCancelReservation', name: 'Cancel Reservation', category: 'Reservations' },
    { code: 'CanCheckInGuest', name: 'Check In Guest', category: 'Reservations' },
    { code: 'CanCheckOutGuest', name: 'Check Out Guest', category: 'Reservations' },
    { code: 'CanViewReservations', name: 'View Reservations', category: 'Reservations' },
    { code: 'CanViewRooms', name: 'View Rooms', category: 'Rooms' },
    { code: 'CanCreateRoom', name: 'Create Room', category: 'Rooms' },
    { code: 'CanUpdateRoom', name: 'Update Room', category: 'Rooms' },
    { code: 'CanDeleteRoom', name: 'Delete Room', category: 'Rooms' },
    { code: 'CanUpdateRoomStatus', name: 'Update Room Status', category: 'Rooms' },
    { code: 'CanCreateRoomType', name: 'Create Room Type', category: 'Rooms' },
    { code: 'CanUpdateRoomType', name: 'Update Room Type', category: 'Rooms' },
    { code: 'CanDeleteRoomType', name: 'Delete Room Type', category: 'Rooms' },
    { code: 'CanManageRates', name: 'Manage Rates', category: 'Rooms' },
    { code: 'CanProcessPayments', name: 'Process Payments', category: 'Payments' },
    { code: 'CanIssueRefunds', name: 'Issue Refunds', category: 'Payments' },
    { code: 'CanViewFinancialReports', name: 'View Financial Reports', category: 'Reports' },
    { code: 'CanManageHousekeeping', name: 'Manage Housekeeping', category: 'Operations' },
    { code: 'CanManageMaintenance', name: 'Manage Maintenance', category: 'Operations' },
    { code: 'CanManageStaffAndRoles', name: 'Manage Staff & Roles', category: 'Admin' },
  ];

  const createdPermissions = [];
  for (const p of permissionsData) {
    const perm = await prisma.permission.create({ data: p });
    createdPermissions.push(perm);
  }

  // 5. Assign Permissions to Roles
  console.log('🔗 Assigning Permissions to Roles...');
  // Manager gets ALL permissions
  for (const perm of createdPermissions) {
    await prisma.rolePermission.create({
      data: { roleId: managerRole.roleId, permissionId: perm.permissionId },
    });
  }

  // Receptionist gets specific permissions
  const receptionistPerms = [
    'CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest',
    'CanViewReservations', 'CanViewRooms', 'CanUpdateRoomStatus', 'CanProcessPayments', 'CanViewFinancialReports'
  ];
  for (const p of createdPermissions.filter(p => receptionistPerms.includes(p.code))) {
    await prisma.rolePermission.create({
      data: { roleId: receptionistRole.roleId, permissionId: p.permissionId },
    });
  }

  // 6. Create Users (Linked directly to the Property)
  console.log('👤 Creating Users...');
  const passwordHash = await bcrypt.hash('manager123', 10);
  await prisma.user.create({
    data: {
      propertyId: property.propertyId,
      fullName: 'Abena Tetteh',
      username: 'gtetteh',
      email: 'abena.tetteh@brassfieldhotel.com',
      passwordHash,
      roleId: managerRole.roleId,
    },
  });

  const receptionistHash = await bcrypt.hash('reception123', 10);
  await prisma.user.create({
    data: {
      propertyId: property.propertyId,
      fullName: 'Kwame Mensah',
      username: 'jmensah',
      email: 'kwame.mensah@brassfieldhotel.com',
      passwordHash: receptionistHash,
      roleId: receptionistRole.roleId,
    },
  });

  // 7. Create Sample Room Types
  console.log('🛏️ Creating Room Types...');
  const standardRoom = await prisma.roomType.create({
    data: {
      propertyId: property.propertyId,
      typeName: 'Standard',
      description: 'Cozy room with a queen bed',
      basePrice: 350.00,
      maxOccupancy: 2,
    },
  });

  const deluxeRoom = await prisma.roomType.create({
    data: {
      propertyId: property.propertyId,
      typeName: 'Deluxe',
      description: 'Spacious room with a king bed and city view',
      basePrice: 550.00,
      maxOccupancy: 3,
    },
  });

  const executiveSuite = await prisma.roomType.create({
    data: {
      propertyId: property.propertyId,
      typeName: 'Executive Suite',
      description: 'Luxury suite with living area and premium amenities',
      basePrice: 950.00,
      maxOccupancy: 4,
    },
  });

  // 8. Create Sample Rooms
  console.log('🚪 Creating Rooms...');
  const roomsData = [
    { roomNumber: '101', roomTypeId: standardRoom.roomTypeId, floor: 1 },
    { roomNumber: '102', roomTypeId: standardRoom.roomTypeId, floor: 1 },
    { roomNumber: '103', roomTypeId: deluxeRoom.roomTypeId, floor: 1 },
    { roomNumber: '201', roomTypeId: deluxeRoom.roomTypeId, floor: 2 },
    { roomNumber: '202', roomTypeId: deluxeRoom.roomTypeId, floor: 2 },
    { roomNumber: '301', roomTypeId: executiveSuite.roomTypeId, floor: 3 },
  ];

  for (const r of roomsData) {
    await prisma.room.create({
      data: {
        propertyId: property.propertyId,
        roomNumber: r.roomNumber,
        roomTypeId: r.roomTypeId,
        floor: r.floor,
        operationalStatus: 'Available',
        housekeepingStatus: 'Clean',
      },
    });
  }

  // 9. Create Sample Rate Plans
  console.log('💰 Creating Rate Plans...');
  await prisma.ratePlan.create({
    data: {
      propertyId: property.propertyId,
      roomTypeId: standardRoom.roomTypeId,
      planName: 'Walk-in Rate',
      isPublic: true,
      minStay: 1,
      discountPercent: 0,
    },
  });

  await prisma.ratePlan.create({
    data: {
      propertyId: property.propertyId,
      roomTypeId: deluxeRoom.roomTypeId,
      planName: 'Weekend Special',
      isPublic: true,
      minStay: 2,
      discountPercent: 10,
    },
  });

  // 10. Create Sample Guests
  console.log('🧳 Creating Sample Guests...');
  await prisma.guest.create({
    data: {
      propertyId: property.propertyId,
      fullName: 'John Doe',
      phone: '+233 24 111 2222',
      email: 'john.doe@example.com',
      idNumber: 'GHA-123456',
    },
  });

  await prisma.guest.create({
    data: {
      propertyId: property.propertyId,
      fullName: 'Jane Smith',
      phone: '+233 20 999 8888',
      email: 'jane.smith@example.com',
      idNumber: 'GHA-654321',
    },
  });

  console.log('✅ Seeding complete!');
  console.log('👤 Manager Login -> Username: gtetteh | Password: manager123');
  console.log('👤 Receptionist Login -> Username: jmensah | Password: reception123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });