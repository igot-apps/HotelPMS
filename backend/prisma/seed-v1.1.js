// prisma/seed.js
const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database with fresh test data...');

  // ============================================================
  // 1. Create Tenants
  // ============================================================
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

  const sunset = await prisma.tenant.upsert({
    where: { tenantCode: 'SUNSET' },
    update: {},
    create: {
      tenantCode: 'SUNSET',
      businessName: 'Sunset Beach Resort',
      legalName: 'Sunset Beach Resorts Ltd.',
      subscriptionPlan: 'Starter',
      subscriptionStatus: 'Active',
      currency: 'GHS',
      timezone: 'Africa/Accra',
      country: 'Ghana',
      primaryEmail: 'info@sunsetbeach.com',
      primaryPhone: '0244000003',
      isActive: true,
    },
  });

  console.log('✅ Tenants created (3)');

  // ============================================================
  // 2. Create Properties
  // ============================================================
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
      totalRooms: 10,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      status: 'Active',
    },
  });

  const brassfieldAirport = await prisma.property.upsert({
    where: {
      tenantId_propertyCode: {
        tenantId: brassfield.tenantId,
        propertyCode: 'BFH-AIR',
      },
    },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyName: 'Brassfield Airport Hotel',
      propertyCode: 'BFH-AIR',
      propertyType: 'Hotel',
      address: 'Airport Road',
      city: 'Accra',
      country: 'Ghana',
      gpsCoordinates: '5.6000,-0.1700',
      totalRooms: 15,
      checkInTime: '14:00',
      checkOutTime: '12:00',
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
      totalRooms: 8,
      checkInTime: '15:00',
      checkOutTime: '11:00',
      status: 'Active',
    },
  });

  const sunsetProperty = await prisma.property.upsert({
    where: {
      tenantId_propertyCode: {
        tenantId: sunset.tenantId,
        propertyCode: 'SUN-BCH',
      },
    },
    update: {},
    create: {
      tenantId: sunset.tenantId,
      propertyName: 'Sunset Beach Resort',
      propertyCode: 'SUN-BCH',
      propertyType: 'Resort',
      address: 'Sunset Beach Road',
      city: 'Cape Coast',
      country: 'Ghana',
      gpsCoordinates: '5.1000,-1.2500',
      totalRooms: 12,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      status: 'Active',
    },
  });

  console.log('✅ Properties created (5)');

  // ============================================================
  // 3. Create Roles
  // ============================================================
  const roles = await Promise.all([
    prisma.role.upsert({
      where: { roleName: 'Manager' },
      update: {},
      create: { roleName: 'Manager', description: 'Full hotel access', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'Receptionist' },
      update: {},
      create: { roleName: 'Receptionist', description: 'Manage reservations, check-in, check-out, and guest services', isSystem: true },
    }),
    prisma.role.upsert({
      where: { roleName: 'Housekeeping' },
      update: {},
      create: { roleName: 'Housekeeping', description: 'Manage room cleaning and room status', isSystem: true },
    }),
  ]);

  console.log('✅ Roles created (6)');

  // ============================================================
  // 4. Create Users
  // ============================================================
  const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
  };

  const ReceptionistPassword = await hashPassword('reception123');
  const managerPassword = await hashPassword('manager123');
  const housekeepingPassword = await hashPassword('housekeeping123');

  const ReceptionistRole = roles.find(r => r.roleName === 'Receptionist');
  const managerRole = roles.find(r => r.roleName === 'Manager');
  const housekeepingRole = roles.find(r => r.roleName === 'Housekeeping');

  // Brassfield staff
  await prisma.user.upsert({
    where: { username: 'jmensah' },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyId: brassfieldProperty.propertyId,
      fullName: 'John Mensah',
      username: 'jmensah',
      email: 'john.mensah@brassfieldhotel.com',
      passwordHash: ReceptionistPassword,
      roleId: ReceptionistRole.roleId,
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
    where: { username: 'sakoto' },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyId: brassfieldProperty.propertyId,
      fullName: 'Sandra Akoto',
      username: 'sakoto',
      email: 'sandra.akoto@brassfieldhotel.com',
      passwordHash: housekeepingPassword,
      roleId: housekeepingRole.roleId,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'dkwakye' },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyId: brassfieldProperty.propertyId,
      fullName: 'Daniel Kwakye',
      username: 'dkwakye',
      email: 'daniel.kwakye@brassfieldhotel.com',
      passwordHash: housekeepingPassword,
      roleId: housekeepingRole.roleId,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'samed' },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyId: brassfieldAirport.propertyId,
      fullName: 'Sakina Amed',
      username: 'samed',
      email: 'sakina.amed@brassfieldhotel.com',
      passwordHash: ReceptionistPassword,
      roleId: ReceptionistRole.roleId,
      isActive: true,
    },
  });

  // Gold Coast staff
  await prisma.user.upsert({
    where: { username: 'efosu' },
    update: {},
    create: {
      tenantId: goldcoast.tenantId,
      propertyId: goldcoastProperty.propertyId,
      fullName: 'Efua Osu',
      username: 'efosu',
      email: 'efua.osu@goldcoastresort.com',
      passwordHash: ReceptionistPassword,
      roleId: ReceptionistRole.roleId,
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

  // Sunset staff
  await prisma.user.upsert({
    where: { username: 'eappiah' },
    update: {},
    create: {
      tenantId: sunset.tenantId,
      propertyId: sunsetProperty.propertyId,
      fullName: 'Esi Appiah',
      username: 'eappiah',
      email: 'esi.appiah@sunsetbeach.com',
      passwordHash: ReceptionistPassword,
      roleId: ReceptionistRole.roleId,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: 'kobbah' },
    update: {},
    create: {
      tenantId: sunset.tenantId,
      propertyId: sunsetProperty.propertyId,
      fullName: 'Kwabena Obbah',
      username: 'kobbah',
      email: 'kwabena.obbah@sunsetbeach.com',
      passwordHash: managerPassword,
      roleId: managerRole.roleId,
      isActive: true,
    },
  });

  console.log('✅ Users created (7)');

  // ============================================================
  // 5. Create Permissions
  // ============================================================
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

  console.log('✅ Permissions created (11)');

  // ============================================================
  // 6. Create Room Types
  // ============================================================
  const roomTypes = [
    // Brassfield Hotel - Accra
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, typeName: 'Standard Single', description: 'Single bed, basic amenities', basePrice: 30.00, maxOccupancy: 1 },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, typeName: 'Standard Double', description: 'Double bed or twin beds', basePrice: 45.00, maxOccupancy: 2 },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, typeName: 'Executive Suite', description: 'Premium suite with living area', basePrice: 85.00, maxOccupancy: 3 },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, typeName: 'Family Room', description: 'Spacious with two queen beds', basePrice: 65.00, maxOccupancy: 4 },
    
    // Brassfield Airport Hotel
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, typeName: 'Single', description: 'Comfortable single room', basePrice: 35.00, maxOccupancy: 1 },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, typeName: 'Double', description: 'Double room with work desk', basePrice: 50.00, maxOccupancy: 2 },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, typeName: 'Suite', description: 'Airport view suite', basePrice: 90.00, maxOccupancy: 3 },
    
    // Gold Coast Resort
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, typeName: 'Garden View', description: 'Ground floor with garden view', basePrice: 60.00, maxOccupancy: 2 },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, typeName: 'Ocean View', description: 'Sea-facing room', basePrice: 80.00, maxOccupancy: 2 },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, typeName: 'Ocean Suite', description: 'Premium ocean-facing suite', basePrice: 150.00, maxOccupancy: 3 },
    
    // Sunset Beach Resort
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, typeName: 'Beach View', description: 'Room with beach view', basePrice: 55.00, maxOccupancy: 2 },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, typeName: 'Beach Suite', description: 'Luxury beach suite', basePrice: 100.00, maxOccupancy: 3 },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, typeName: 'Family Villa', description: 'Spacious villa with kitchen', basePrice: 130.00, maxOccupancy: 5 },
  ];

  const createdRoomTypes = [];
  for (const rt of roomTypes) {
    const created = await prisma.roomType.upsert({
      where: {
        tenantId_propertyId_typeName: {
          tenantId: rt.tenantId,
          propertyId: rt.propertyId,
          typeName: rt.typeName,
        },
      },
      update: {},
      create: rt,
    });
    createdRoomTypes.push(created);
  }

  console.log(`✅ Room Types created (${createdRoomTypes.length})`);

  // ============================================================
  // 7. Create Rooms
  // ============================================================
  const rooms = [
    // Brassfield Hotel - Accra (10 rooms)
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '101', roomTypeId: 1, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '102', roomTypeId: 2, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '103', roomTypeId: 1, floor: 1, operationalStatus: 'Maintenance', housekeepingStatus: 'OutOfService' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '201', roomTypeId: 2, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Dirty' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '202', roomTypeId: 3, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '203', roomTypeId: 2, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '301', roomTypeId: 3, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '302', roomTypeId: 4, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '303', roomTypeId: 4, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '401', roomTypeId: 3, floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },

    // Brassfield Airport Hotel (15 rooms)
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A101', roomTypeId: 5, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A102', roomTypeId: 5, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A103', roomTypeId: 6, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A201', roomTypeId: 6, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A202', roomTypeId: 6, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A203', roomTypeId: 5, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Dirty' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A301', roomTypeId: 7, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A302', roomTypeId: 7, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A303', roomTypeId: 6, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A401', roomTypeId: 7, floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A402', roomTypeId: 5, floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A403', roomTypeId: 5, floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A501', roomTypeId: 6, floor: 5, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A502', roomTypeId: 6, floor: 5, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A503', roomTypeId: 7, floor: 5, operationalStatus: 'Available', housekeepingStatus: 'Clean' },

    // Gold Coast Resort (8 rooms)
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G101', roomTypeId: 8, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G102', roomTypeId: 8, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G103', roomTypeId: 9, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G201', roomTypeId: 9, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G202', roomTypeId: 9, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G203', roomTypeId: 10, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G301', roomTypeId: 10, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G302', roomTypeId: 10, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },

    // Sunset Beach Resort (12 rooms)
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S101', roomTypeId: 11, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S102', roomTypeId: 11, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S103', roomTypeId: 11, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S104', roomTypeId: 12, floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S201', roomTypeId: 12, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S202', roomTypeId: 12, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S203', roomTypeId: 13, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S204', roomTypeId: 13, floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S301', roomTypeId: 13, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S302', roomTypeId: 11, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S303', roomTypeId: 12, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S304', roomTypeId: 13, floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
  ];

  for (const room of rooms) {
    await prisma.room.upsert({
      where: {
        tenantId_propertyId_roomNumber: {
          tenantId: room.tenantId,
          propertyId: room.propertyId,
          roomNumber: room.roomNumber,
        },
      },
      update: {},
      create: room,
    });
  }

  console.log(`✅ Rooms created (${rooms.length})`);

  // ============================================================
  // 8. Create Rate Plans
  // ============================================================
  const ratePlans = [
    // Brassfield Hotel - Accra
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: 1, planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: 2, planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: 3, planName: 'Premium Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: 4, planName: 'Family Rate', minStay: 2, maxStay: 7, discountPercent: 10, isActive: true },
    
    // Brassfield Airport Hotel
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomTypeId: 5, planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomTypeId: 6, planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomTypeId: 7, planName: 'Corporate Rate', minStay: 3, maxStay: 30, discountPercent: 15, isActive: true },
    
    // Gold Coast Resort
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomTypeId: 8, planName: 'Standard Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomTypeId: 9, planName: 'Premium Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomTypeId: 10, planName: 'Luxury Rate', minStay: 3, maxStay: 21, discountPercent: 5, isActive: true },
    
    // Sunset Beach Resort
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomTypeId: 11, planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomTypeId: 12, planName: 'Premium Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomTypeId: 13, planName: 'Family Rate', minStay: 3, maxStay: 21, discountPercent: 12, isActive: true },
  ];

  for (const rp of ratePlans) {
    await prisma.ratePlan.upsert({
      where: {
        tenantId_propertyId_roomTypeId_planName: {
          tenantId: rp.tenantId,
          propertyId: rp.propertyId,
          roomTypeId: rp.roomTypeId,
          planName: rp.planName,
        },
      },
      update: {},
      create: rp,
    });
  }

  console.log(`✅ Rate Plans created (${ratePlans.length})`);

  // ============================================================
  // 9. Create Guests
  // ============================================================
  const guests = [
    // Brassfield guests
    { tenantId: brassfield.tenantId, fullName: 'Kwame Asante', phone: '0244123456', email: 'kwame.a@email.com', idNumber: 'GHA-001', address: 'Accra, Ghana', username: 'kasante', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Abena Owusu', phone: '0501234567', email: 'abena.o@email.com', idNumber: 'GHA-002', address: 'Kumasi, Ghana', username: 'aowusu', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Yaw Boateng', phone: '0277654321', email: 'yaw.b@email.com', idNumber: 'GHA-003', address: 'Takoradi, Ghana', username: 'yboateng', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Akua Sarpong', phone: '0244888888', email: 'akua.s@email.com', idNumber: 'GHA-007', address: 'Tema, Ghana', username: 'asarpong', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Kofi Annan', phone: '0509999999', email: 'kofi.a@email.com', idNumber: 'GHA-008', address: 'Cape Coast, Ghana', username: 'kannan', passwordHash: await hashPassword('guest123'), isActive: true },
    
    // Gold Coast guests
    { tenantId: goldcoast.tenantId, fullName: 'Yaa Nkrumah', phone: '0209998888', email: 'yaa.n@email.com', idNumber: 'GHA-004', address: 'Takoradi, Ghana', username: 'ynkrumah', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: goldcoast.tenantId, fullName: 'Kwesi Mensah', phone: '0244777777', email: 'kwesi.m@email.com', idNumber: 'GHA-009', address: 'Sekondi, Ghana', username: 'kmensah', passwordHash: await hashPassword('guest123'), isActive: true },
    
    // Sunset guests
    { tenantId: sunset.tenantId, fullName: 'Ama Serwaa', phone: '0244666666', email: 'ama.s@email.com', idNumber: 'GHA-010', address: 'Cape Coast, Ghana', username: 'aserwaa', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: sunset.tenantId, fullName: 'John Doe', phone: '0201111111', email: 'john.d@email.com', idNumber: 'GHA-011', address: 'Elmina, Ghana', username: 'jdoe', passwordHash: await hashPassword('guest123'), isActive: true },
  ];

  for (const guest of guests) {
    await prisma.guest.upsert({
      where: { username: guest.username },
      update: {},
      create: guest,
    });
  }

  console.log(`✅ Guests created (${guests.length})`);

  // ============================================================
  // 10. Create Reservations & Payments
  // ============================================================
  console.log('📅 Creating reservations with payments...');

  // Get created data for reference
  const allGuests = await prisma.guest.findMany();
  const allRooms = await prisma.room.findMany();
  const allRatePlans = await prisma.ratePlan.findMany();

  // Helper to get room by number and property
  const getRoom = (propertyCode, roomNumber) => {
    return allRooms.find(r => 
      r.roomNumber === roomNumber && 
      r.propertyId === (propertyCode === 'BFH-ACC' ? brassfieldProperty.propertyId :
                       propertyCode === 'BFH-AIR' ? brassfieldAirport.propertyId :
                       propertyCode === 'GCR-TKD' ? goldcoastProperty.propertyId :
                       sunsetProperty.propertyId)
    );
  };

  // Helper to get guest by username
  const getGuest = (username) => allGuests.find(g => g.username === username);

  // Helper to get rate plan
  const getRatePlan = (propertyCode, roomTypeName) => {
    // Find room type first
    const roomType = createdRoomTypes.find(rt => 
      rt.typeName === roomTypeName &&
      rt.propertyId === (propertyCode === 'BFH-ACC' ? brassfieldProperty.propertyId :
                        propertyCode === 'BFH-AIR' ? brassfieldAirport.propertyId :
                        propertyCode === 'GCR-TKD' ? goldcoastProperty.propertyId :
                        sunsetProperty.propertyId)
    );
    if (!roomType) return null;
    return allRatePlans.find(rp => rp.roomTypeId === roomType.roomTypeId);
  };

  // --- Brassfield Reservations ---
  const brassfieldRooms = allRooms.filter(r => r.propertyId === brassfieldProperty.propertyId);
  const brassfieldGuests = allGuests.filter(g => g.tenantId === brassfield.tenantId);

  if (brassfieldRooms.length >= 3 && brassfieldGuests.length >= 3) {
    // Reservation 1: Kwame Asante - CheckedIn
    const res1 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId,
        propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('kasante').guestId,
        staffId: 1,
        source: 'Walk-in',
        checkInDate: new Date('2026-06-20'),
        checkOutDate: new Date('2026-06-22'),
        status: 'CheckedIn',
        notes: 'Late check-in expected',
        totalAmount: 90.00,
        amountPaid: 90.00,
        balanceDue: 0.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res1.reservationId,
        roomId: brassfieldRooms[0].roomId,
        roomTypeId: brassfieldRooms[0].roomTypeId,
        checkInDate: new Date('2026-06-20'),
        checkOutDate: new Date('2026-06-22'),
        agreedPricePerNight: 45.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res1.reservationId,
        amount: 90.00,
        paymentMethod: 'Cash',
        paymentDate: new Date('2026-06-20'),
        receivedBy: 1,
        status: 'Completed',
      },
    });

    // Reservation 2: Abena Owusu - Confirmed
    const res2 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId,
        propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('aowusu').guestId,
        staffId: 1,
        source: 'Phone',
        checkInDate: new Date('2026-06-25'),
        checkOutDate: new Date('2026-06-27'),
        status: 'Confirmed',
        notes: '',
        totalAmount: 90.00,
        amountPaid: 60.00,
        balanceDue: 30.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res2.reservationId,
        roomId: brassfieldRooms[1].roomId,
        roomTypeId: brassfieldRooms[1].roomTypeId,
        checkInDate: new Date('2026-06-25'),
        checkOutDate: new Date('2026-06-27'),
        agreedPricePerNight: 45.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res2.reservationId,
        amount: 60.00,
        paymentMethod: 'MobileMoney',
        paymentDate: new Date('2026-06-24'),
        receivedBy: 1,
        status: 'Completed',
      },
    });

    // Reservation 3: Yaw Boateng - CheckedOut
    const res3 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId,
        propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('yboateng').guestId,
        staffId: 2,
        source: 'Walk-in',
        checkInDate: new Date('2026-06-10'),
        checkOutDate: new Date('2026-06-12'),
        status: 'CheckedOut',
        notes: 'Requested extra towels',
        totalAmount: 170.00,
        amountPaid: 170.00,
        balanceDue: 0.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res3.reservationId,
        roomId: brassfieldRooms[2].roomId,
        roomTypeId: brassfieldRooms[2].roomTypeId,
        checkInDate: new Date('2026-06-10'),
        checkOutDate: new Date('2026-06-12'),
        agreedPricePerNight: 85.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res3.reservationId,
        amount: 170.00,
        paymentMethod: 'Card',
        paymentDate: new Date('2026-06-12'),
        receivedBy: 2,
        status: 'Completed',
      },
    });

    // Reservation 4: Kwame Asante - Cancelled (second stay)
    const res4 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId,
        propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('kasante').guestId,
        staffId: 1,
        source: 'Direct',
        checkInDate: new Date('2026-06-28'),
        checkOutDate: new Date('2026-06-30'),
        status: 'Cancelled',
        notes: 'Guest changed travel plans',
        totalAmount: 180.00,
        amountPaid: 0.00,
        balanceDue: 180.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res4.reservationId,
        roomId: brassfieldRooms[0].roomId,
        roomTypeId: brassfieldRooms[0].roomTypeId,
        checkInDate: new Date('2026-06-28'),
        checkOutDate: new Date('2026-06-30'),
        agreedPricePerNight: 45.00,
      },
    });

    // Reservation 5: Akua Sarpong - Future stay
    const res5 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId,
        propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('asarpong').guestId,
        staffId: 1,
        source: 'Website',
        checkInDate: new Date('2026-07-15'),
        checkOutDate: new Date('2026-07-18'),
        status: 'Confirmed',
        notes: 'Honeymoon - request champagne',
        totalAmount: 135.00,
        amountPaid: 45.00,
        balanceDue: 90.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res5.reservationId,
        roomId: brassfieldRooms[3].roomId,
        roomTypeId: brassfieldRooms[3].roomTypeId,
        checkInDate: new Date('2026-07-15'),
        checkOutDate: new Date('2026-07-18'),
        agreedPricePerNight: 45.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: brassfield.tenantId,
        reservationId: res5.reservationId,
        amount: 45.00,
        paymentMethod: 'Online',
        paymentDate: new Date('2026-07-01'),
        receivedBy: 1,
        status: 'Completed',
      },
    });

    console.log('✅ Brassfield reservations created (5)');
  }

  // --- Gold Coast Reservations ---
  const goldcoastRooms = allRooms.filter(r => r.propertyId === goldcoastProperty.propertyId);
  const goldcoastGuests = allGuests.filter(g => g.tenantId === goldcoast.tenantId);

  if (goldcoastRooms.length >= 2 && goldcoastGuests.length >= 2) {
    const res6 = await prisma.reservation.create({
      data: {
        tenantId: goldcoast.tenantId,
        propertyId: goldcoastProperty.propertyId,
        guestId: getGuest('ynkrumah').guestId,
        staffId: 4,
        source: 'Website',
        checkInDate: new Date('2026-06-21'),
        checkOutDate: new Date('2026-06-24'),
        status: 'CheckedIn',
        notes: 'Honeymoon — late checkout requested',
        totalAmount: 240.00,
        amountPaid: 240.00,
        balanceDue: 0.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: goldcoast.tenantId,
        reservationId: res6.reservationId,
        roomId: goldcoastRooms[0].roomId,
        roomTypeId: goldcoastRooms[0].roomTypeId,
        checkInDate: new Date('2026-06-21'),
        checkOutDate: new Date('2026-06-24'),
        agreedPricePerNight: 80.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: goldcoast.tenantId,
        reservationId: res6.reservationId,
        amount: 240.00,
        paymentMethod: 'Online',
        paymentDate: new Date('2026-06-20'),
        receivedBy: 4,
        status: 'Completed',
        gatewayReference: 'stripe_ref_44x',
      },
    });

    const res7 = await prisma.reservation.create({
      data: {
        tenantId: goldcoast.tenantId,
        propertyId: goldcoastProperty.propertyId,
        guestId: getGuest('kmensah').guestId,
        staffId: 5,
        source: 'Walk-in',
        checkInDate: new Date('2026-07-01'),
        checkOutDate: new Date('2026-07-03'),
        status: 'Confirmed',
        notes: 'Business traveler',
        totalAmount: 160.00,
        amountPaid: 80.00,
        balanceDue: 80.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: goldcoast.tenantId,
        reservationId: res7.reservationId,
        roomId: goldcoastRooms[1].roomId,
        roomTypeId: goldcoastRooms[1].roomTypeId,
        checkInDate: new Date('2026-07-01'),
        checkOutDate: new Date('2026-07-03'),
        agreedPricePerNight: 80.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: goldcoast.tenantId,
        reservationId: res7.reservationId,
        amount: 80.00,
        paymentMethod: 'Cash',
        paymentDate: new Date('2026-07-01'),
        receivedBy: 5,
        status: 'Completed',
      },
    });

    console.log('✅ Gold Coast reservations created (2)');
  }

  // --- Sunset Reservations ---
  const sunsetRooms = allRooms.filter(r => r.propertyId === sunsetProperty.propertyId);
  const sunsetGuests = allGuests.filter(g => g.tenantId === sunset.tenantId);

  if (sunsetRooms.length >= 2 && sunsetGuests.length >= 2) {
    const res8 = await prisma.reservation.create({
      data: {
        tenantId: sunset.tenantId,
        propertyId: sunsetProperty.propertyId,
        guestId: getGuest('aserwaa').guestId,
        staffId: 6,
        source: 'Website',
        checkInDate: new Date('2026-07-10'),
        checkOutDate: new Date('2026-07-14'),
        status: 'Confirmed',
        notes: 'Family vacation',
        totalAmount: 220.00,
        amountPaid: 110.00,
        balanceDue: 110.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: sunset.tenantId,
        reservationId: res8.reservationId,
        roomId: sunsetRooms[0].roomId,
        roomTypeId: sunsetRooms[0].roomTypeId,
        checkInDate: new Date('2026-07-10'),
        checkOutDate: new Date('2026-07-14'),
        agreedPricePerNight: 55.00,
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: sunset.tenantId,
        reservationId: res8.reservationId,
        amount: 110.00,
        paymentMethod: 'Online',
        paymentDate: new Date('2026-07-05'),
        receivedBy: 6,
        status: 'Completed',
        gatewayReference: 'stripe_ref_88y',
      },
    });

    const res9 = await prisma.reservation.create({
      data: {
        tenantId: sunset.tenantId,
        propertyId: sunsetProperty.propertyId,
        guestId: getGuest('jdoe').guestId,
        staffId: 7,
        source: 'Phone',
        checkInDate: new Date('2026-08-01'),
        checkOutDate: new Date('2026-08-03'),
        status: 'Confirmed',
        notes: 'Weekend getaway',
        totalAmount: 200.00,
        amountPaid: 0.00,
        balanceDue: 200.00,
      },
    });

    await prisma.reservationRoom.create({
      data: {
        tenantId: sunset.tenantId,
        reservationId: res9.reservationId,
        roomId: sunsetRooms[1].roomId,
        roomTypeId: sunsetRooms[1].roomTypeId,
        checkInDate: new Date('2026-08-01'),
        checkOutDate: new Date('2026-08-03'),
        agreedPricePerNight: 100.00,
      },
    });

    console.log('✅ Sunset reservations created (2)');
  }

  console.log('✅ All reservations and payments created');

  console.log('\n🎉 Seeding complete!');
  console.log('📊 Summary:');
  console.log(`   - ${3} Tenants`);
  console.log(`   - ${5} Properties`);
  console.log(`   - ${6} Roles`);
  console.log(`   - ${7} Users`);
  console.log(`   - ${11} Permissions`);
  console.log(`   - ${createdRoomTypes.length} Room Types`);
  console.log(`   - ${rooms.length} Rooms`);
  console.log(`   - ${ratePlans.length} Rate Plans`);
  console.log(`   - ${guests.length} Guests`);
  console.log(`   - 9+ Reservations with Payments`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });