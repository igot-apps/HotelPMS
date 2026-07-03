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
    where: { tenantId_propertyCode: { tenantId: brassfield.tenantId, propertyCode: 'BFH-ACC' } },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyName: 'Brassfield Hotel - Accra',
      propertyCode: 'BFH-ACC',
      propertyType: 'Hotel',
      address: '12 Independence Ave, Accra',
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
    where: { tenantId_propertyCode: { tenantId: brassfield.tenantId, propertyCode: 'BFH-AIR' } },
    update: {},
    create: {
      tenantId: brassfield.tenantId,
      propertyName: 'Brassfield Airport Hotel',
      propertyCode: 'BFH-AIR',
      propertyType: 'Hotel',
      address: 'Airport City, Accra',
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
    where: { tenantId_propertyCode: { tenantId: goldcoast.tenantId, propertyCode: 'GCR-TKD' } },
    update: {},
    create: {
      tenantId: goldcoast.tenantId,
      propertyName: 'Gold Coast Resort - Takoradi',
      propertyCode: 'GCR-TKD',
      propertyType: 'Resort',
      address: 'Beach Road, Takoradi',
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
    where: { tenantId_propertyCode: { tenantId: sunset.tenantId, propertyCode: 'SUN-BCH' } },
    update: {},
    create: {
      tenantId: sunset.tenantId,
      propertyName: 'Sunset Beach Resort',
      propertyCode: 'SUN-BCH',
      propertyType: 'Resort',
      address: 'Beach Road, Cape Coast',
      city: 'Cape Coast',
      country: 'Ghana',
      gpsCoordinates: '5.1000,-1.2500',
      totalRooms: 12,
      checkInTime: '14:00',
      checkOutTime: '11:00',
      status: 'Active',
    },
  });

  console.log('✅ Properties created (4)');

  // ============================================================
  // 3. Create Roles
  // ============================================================
  const managerRole = await prisma.role.upsert({
    where: { roleName: 'Manager' },
    update: {},
    create: { roleName: 'Manager', description: 'Full hotel access', isSystem: true },
  });
  
  const receptionistRole = await prisma.role.upsert({
    where: { roleName: 'Receptionist' },
    update: {},
    create: { roleName: 'Receptionist', description: 'Manage reservations, check-in, check-out, and guest services', isSystem: true },
  });
  
  const housekeepingRole = await prisma.role.upsert({
    where: { roleName: 'Housekeeping' },
    update: {},
    create: { roleName: 'Housekeeping', description: 'Manage room cleaning and room status', isSystem: true },
  });

  console.log('✅ Roles created (3)');

  // ============================================================
  // 4. Create Users
  // ============================================================
  const hashPassword = async (password) => await bcrypt.hash(password, 10);

  const ReceptionistPassword = await hashPassword('reception123');
  const managerPassword = await hashPassword('manager123');
  const housekeepingPassword = await hashPassword('housekeeping123');

  // Brassfield Accra staff
  const jmensah = await prisma.user.upsert({
    where: { username: 'jmensah' },
    update: {},
    create: {
      tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
      fullName: 'Kwame Mensah', username: 'jmensah', email: 'kwame.mensah@brassfieldhotel.com',
      passwordHash: ReceptionistPassword, roleId: receptionistRole.roleId, isActive: true,
    },
  });

  const gtetteh = await prisma.user.upsert({
    where: { username: 'gtetteh' },
    update: {},
    create: {
      tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
      fullName: 'Abena Tetteh', username: 'gtetteh', email: 'abena.tetteh@brassfieldhotel.com',
      passwordHash: managerPassword, roleId: managerRole.roleId, isActive: true,
    },
  });

  const sakoto = await prisma.user.upsert({
    where: { username: 'sakoto' },
    update: {},
    create: {
      tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
      fullName: 'Akua Akoto', username: 'sakoto', email: 'akua.akoto@brassfieldhotel.com',
      passwordHash: housekeepingPassword, roleId: housekeepingRole.roleId, isActive: true,
    },
  });

  const dkwakye = await prisma.user.upsert({
    where: { username: 'dkwakye' },
    update: {},
    create: {
      tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
      fullName: 'Kofi Kwakye', username: 'dkwakye', email: 'kofi.kwakye@brassfieldhotel.com',
      passwordHash: housekeepingPassword, roleId: housekeepingRole.roleId, isActive: true,
    },
  });

  // Brassfield Airport staff
  const samed = await prisma.user.upsert({
    where: { username: 'samed' },
    update: {},
    create: {
      tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId,
      fullName: 'Afua Samed', username: 'samed', email: 'afua.samed@brassfieldhotel.com',
      passwordHash: ReceptionistPassword, roleId: receptionistRole.roleId, isActive: true,
    },
  });

  // Gold Coast staff
  const efosu = await prisma.user.upsert({
    where: { username: 'efosu' },
    update: {},
    create: {
      tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId,
      fullName: 'Efua Osu', username: 'efosu', email: 'efua.osu@goldcoastresort.com',
      passwordHash: ReceptionistPassword, roleId: receptionistRole.roleId, isActive: true,
    },
  });

  const kdarko = await prisma.user.upsert({
    where: { username: 'kdarko' },
    update: {},
    create: {
      tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId,
      fullName: 'Kojo Darko', username: 'kdarko', email: 'kojo.darko@goldcoastresort.com',
      passwordHash: managerPassword, roleId: managerRole.roleId, isActive: true,
    },
  });

  // Sunset staff
  const eappiah = await prisma.user.upsert({
    where: { username: 'eappiah' },
    update: {},
    create: {
      tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId,
      fullName: 'Esi Appiah', username: 'eappiah', email: 'esi.appiah@sunsetbeach.com',
      passwordHash: ReceptionistPassword, roleId: receptionistRole.roleId, isActive: true,
    },
  });

  const kobbah = await prisma.user.upsert({
    where: { username: 'kobbah' },
    update: {},
    create: {
      tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId,
      fullName: 'Kwabena Ofori', username: 'kobbah', email: 'kwabena.ofori@sunsetbeach.com',
      passwordHash: managerPassword, roleId: managerRole.roleId, isActive: true,
    },
  });

  console.log('✅ Users created (9)');

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
    await prisma.permission.upsert({ where: { code: perm.code }, update: {}, create: perm });
  }
  console.log('✅ Permissions created (11)');

  // ============================================================
  // 6. Create Room Types
  // ============================================================
  const roomTypesData = [
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
  for (const rt of roomTypesData) {
    const created = await prisma.roomType.upsert({
      where: { tenantId_propertyId_typeName: { tenantId: rt.tenantId, propertyId: rt.propertyId, typeName: rt.typeName } },
      update: {},
      create: rt,
    });
    createdRoomTypes.push(created);
  }
  console.log(`✅ Room Types created (${createdRoomTypes.length})`);

  // Helper to get RoomType ID dynamically
  const getRoomTypeId = (propertyId, typeName) => {
    const rt = createdRoomTypes.find(r => r.propertyId === propertyId && r.typeName === typeName);
    return rt ? rt.roomTypeId : null;
  };

  // ============================================================
  // 7. Create Rooms
  // ============================================================
  const rooms = [
    // Brassfield Hotel - Accra (10 rooms)
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '101', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Single'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '102', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Double'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '103', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Single'), floor: 1, operationalStatus: 'Maintenance', housekeepingStatus: 'OutOfService' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '201', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Double'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Dirty' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '202', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Executive Suite'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '203', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Double'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '301', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Executive Suite'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '302', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Family Room'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '303', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Family Room'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomNumber: '401', roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Executive Suite'), floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },

    // Brassfield Airport Hotel (15 rooms)
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A101', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Single'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A102', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Single'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A103', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A201', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A202', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A203', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Single'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Dirty' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A301', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Suite'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A302', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Suite'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A303', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A401', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Suite'), floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A402', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Single'), floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A403', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Single'), floor: 4, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A501', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), floor: 5, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A502', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), floor: 5, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomNumber: 'A503', roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Suite'), floor: 5, operationalStatus: 'Available', housekeepingStatus: 'Clean' },

    // Gold Coast Resort (8 rooms)
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G101', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Garden View'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G102', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Garden View'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G103', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean View'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G201', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean View'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G202', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean View'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G203', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean Suite'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G301', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean Suite'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomNumber: 'G302', roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean Suite'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },

    // Sunset Beach Resort (12 rooms)
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S101', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach View'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S102', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach View'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S103', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach View'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S104', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach Suite'), floor: 1, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S201', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach Suite'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S202', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach Suite'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S203', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Family Villa'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S204', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Family Villa'), floor: 2, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S301', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Family Villa'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S302', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach View'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S303', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach Suite'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomNumber: 'S304', roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Family Villa'), floor: 3, operationalStatus: 'Available', housekeepingStatus: 'Clean' },
  ];

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { tenantId_propertyId_roomNumber: { tenantId: room.tenantId, propertyId: room.propertyId, roomNumber: room.roomNumber } },
      update: {},
      create: room,
    });
  }
  console.log(`✅ Rooms created (${rooms.length})`);

  // ============================================================
  // 8. Create Rate Plans
  // ============================================================
  const ratePlans = [
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Single'), planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Standard Double'), planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Executive Suite'), planName: 'Premium Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId, roomTypeId: getRoomTypeId(brassfieldProperty.propertyId, 'Family Room'), planName: 'Family Rate', minStay: 2, maxStay: 7, discountPercent: 10, isActive: true },
    
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Single'), planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Double'), planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: brassfield.tenantId, propertyId: brassfieldAirport.propertyId, roomTypeId: getRoomTypeId(brassfieldAirport.propertyId, 'Suite'), planName: 'Corporate Rate', minStay: 3, maxStay: 30, discountPercent: 15, isActive: true },
    
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Garden View'), planName: 'Standard Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean View'), planName: 'Premium Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId, roomTypeId: getRoomTypeId(goldcoastProperty.propertyId, 'Ocean Suite'), planName: 'Luxury Rate', minStay: 3, maxStay: 21, discountPercent: 5, isActive: true },
    
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach View'), planName: 'Standard Rate', minStay: 1, maxStay: 14, isActive: true },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Beach Suite'), planName: 'Premium Rate', minStay: 2, maxStay: 14, isActive: true },
    { tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId, roomTypeId: getRoomTypeId(sunsetProperty.propertyId, 'Family Villa'), planName: 'Family Rate', minStay: 3, maxStay: 21, discountPercent: 12, isActive: true },
  ];

  for (const rp of ratePlans) {
    await prisma.ratePlan.upsert({
      where: { tenantId_propertyId_roomTypeId_planName: { tenantId: rp.tenantId, propertyId: rp.propertyId, roomTypeId: rp.roomTypeId, planName: rp.planName } },
      update: {},
      create: rp,
    });
  }
  console.log(`✅ Rate Plans created (${ratePlans.length})`);

  // ============================================================
  // 9. Create Guests
  // ============================================================
  const guests = [
    { tenantId: brassfield.tenantId, fullName: 'Kwasi Asante', phone: '0244123456', email: 'kwasi.a@email.com', idNumber: 'GHA-001', address: 'Accra, Ghana', username: 'kasante', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Adwoa Owusu', phone: '0501234567', email: 'adwoa.o@email.com', idNumber: 'GHA-002', address: 'Kumasi, Ghana', username: 'aowusu', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Yaw Boateng', phone: '0277654321', email: 'yaw.b@email.com', idNumber: 'GHA-003', address: 'Takoradi, Ghana', username: 'yboateng', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Akua Sarpong', phone: '0244888888', email: 'akua.s@email.com', idNumber: 'GHA-007', address: 'Tema, Ghana', username: 'asarpong', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: brassfield.tenantId, fullName: 'Kofi Antwi', phone: '0509999999', email: 'kofi.a@email.com', idNumber: 'GHA-008', address: 'Cape Coast, Ghana', username: 'kannan', passwordHash: await hashPassword('guest123'), isActive: true },
    
    { tenantId: goldcoast.tenantId, fullName: 'Yaa Pokua', phone: '0209998888', email: 'yaa.p@email.com', idNumber: 'GHA-004', address: 'Takoradi, Ghana', username: 'ynkrumah', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: goldcoast.tenantId, fullName: 'Kwesi Agyeman', phone: '0244777777', email: 'kwesi.a@email.com', idNumber: 'GHA-009', address: 'Sekondi, Ghana', username: 'kmensah', passwordHash: await hashPassword('guest123'), isActive: true },
    
    { tenantId: sunset.tenantId, fullName: 'Ama Serwaa', phone: '0244666666', email: 'ama.s@email.com', idNumber: 'GHA-010', address: 'Cape Coast, Ghana', username: 'aserwaa', passwordHash: await hashPassword('guest123'), isActive: true },
    { tenantId: sunset.tenantId, fullName: 'Kwaku Doe', phone: '0201111111', email: 'kwaku.d@email.com', idNumber: 'GHA-011', address: 'Elmina, Ghana', username: 'jdoe', passwordHash: await hashPassword('guest123'), isActive: true },
  ];

  for (const guest of guests) {
    await prisma.guest.upsert({ where: { username: guest.username }, update: {}, create: guest });
  }
  console.log(`✅ Guests created (${guests.length})`);

  // ============================================================
  // 10. Create Reservations & Payments
  // ============================================================
  console.log('📅 Creating reservations with payments...');

  const allGuests = await prisma.guest.findMany();
  const allRooms = await prisma.room.findMany();

  const getGuest = (username) => allGuests.find(g => g.username === username);

  // --- Brassfield Reservations ---
  const brassfieldRooms = allRooms.filter(r => r.propertyId === brassfieldProperty.propertyId);
  
  if (brassfieldRooms.length >= 4) {
    const res1 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('kasante').guestId, staffId: jmensah.userId, source: 'Walk-in',
        checkInDate: new Date('2026-06-20'), checkOutDate: new Date('2026-06-22'), status: 'CheckedIn',
        notes: 'Late check-in expected', totalAmount: 90.00, amountPaid: 90.00, balanceDue: 0.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: brassfield.tenantId, reservationId: res1.reservationId, roomId: brassfieldRooms[0].roomId, roomTypeId: brassfieldRooms[0].roomTypeId, checkInDate: new Date('2026-06-20'), checkOutDate: new Date('2026-06-22'), agreedPricePerNight: 45.00 } });
    await prisma.payment.create({ data: { tenantId: brassfield.tenantId, reservationId: res1.reservationId, amount: 90.00, paymentMethod: 'Cash', paymentDate: new Date('2026-06-20'), receivedBy: jmensah.userId, status: 'Completed' } });

    const res2 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('aowusu').guestId, staffId: jmensah.userId, source: 'Phone',
        checkInDate: new Date('2026-06-25'), checkOutDate: new Date('2026-06-27'), status: 'Confirmed',
        totalAmount: 90.00, amountPaid: 60.00, balanceDue: 30.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: brassfield.tenantId, reservationId: res2.reservationId, roomId: brassfieldRooms[1].roomId, roomTypeId: brassfieldRooms[1].roomTypeId, checkInDate: new Date('2026-06-25'), checkOutDate: new Date('2026-06-27'), agreedPricePerNight: 45.00 } });
    await prisma.payment.create({ data: { tenantId: brassfield.tenantId, reservationId: res2.reservationId, amount: 60.00, paymentMethod: 'MobileMoney', paymentDate: new Date('2026-06-24'), receivedBy: jmensah.userId, status: 'Completed' } });

    const res3 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('yboateng').guestId, staffId: gtetteh.userId, source: 'Walk-in',
        checkInDate: new Date('2026-06-10'), checkOutDate: new Date('2026-06-12'), status: 'CheckedOut',
        notes: 'Requested extra towels', totalAmount: 170.00, amountPaid: 170.00, balanceDue: 0.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: brassfield.tenantId, reservationId: res3.reservationId, roomId: brassfieldRooms[2].roomId, roomTypeId: brassfieldRooms[2].roomTypeId, checkInDate: new Date('2026-06-10'), checkOutDate: new Date('2026-06-12'), agreedPricePerNight: 85.00 } });
    await prisma.payment.create({ data: { tenantId: brassfield.tenantId, reservationId: res3.reservationId, amount: 170.00, paymentMethod: 'Card', paymentDate: new Date('2026-06-12'), receivedBy: gtetteh.userId, status: 'Completed' } });

    const res4 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('kasante').guestId, staffId: jmensah.userId, source: 'Direct',
        checkInDate: new Date('2026-06-28'), checkOutDate: new Date('2026-06-30'), status: 'Cancelled',
        notes: 'Guest changed travel plans', totalAmount: 180.00, amountPaid: 0.00, balanceDue: 180.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: brassfield.tenantId, reservationId: res4.reservationId, roomId: brassfieldRooms[0].roomId, roomTypeId: brassfieldRooms[0].roomTypeId, checkInDate: new Date('2026-06-28'), checkOutDate: new Date('2026-06-30'), agreedPricePerNight: 45.00 } });

    const res5 = await prisma.reservation.create({
      data: {
        tenantId: brassfield.tenantId, propertyId: brassfieldProperty.propertyId,
        guestId: getGuest('asarpong').guestId, staffId: jmensah.userId, source: 'Website',
        checkInDate: new Date('2026-07-15'), checkOutDate: new Date('2026-07-18'), status: 'Confirmed',
        notes: 'Honeymoon - request champagne', totalAmount: 135.00, amountPaid: 45.00, balanceDue: 90.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: brassfield.tenantId, reservationId: res5.reservationId, roomId: brassfieldRooms[3].roomId, roomTypeId: brassfieldRooms[3].roomTypeId, checkInDate: new Date('2026-07-15'), checkOutDate: new Date('2026-07-18'), agreedPricePerNight: 45.00 } });
    await prisma.payment.create({ data: { tenantId: brassfield.tenantId, reservationId: res5.reservationId, amount: 45.00, paymentMethod: 'Online', paymentDate: new Date('2026-07-01'), receivedBy: jmensah.userId, status: 'Completed' } });

    console.log('✅ Brassfield reservations created (5)');
  }

  // --- Gold Coast Reservations ---
  const goldcoastRooms = allRooms.filter(r => r.propertyId === goldcoastProperty.propertyId);
  if (goldcoastRooms.length >= 2) {
    const res6 = await prisma.reservation.create({
      data: {
        tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId,
        guestId: getGuest('ynkrumah').guestId, staffId: efosu.userId, source: 'Website',
        checkInDate: new Date('2026-06-21'), checkOutDate: new Date('2026-06-24'), status: 'CheckedIn',
        notes: 'Honeymoon — late checkout requested', totalAmount: 240.00, amountPaid: 240.00, balanceDue: 0.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: goldcoast.tenantId, reservationId: res6.reservationId, roomId: goldcoastRooms[0].roomId, roomTypeId: goldcoastRooms[0].roomTypeId, checkInDate: new Date('2026-06-21'), checkOutDate: new Date('2026-06-24'), agreedPricePerNight: 80.00 } });
    await prisma.payment.create({ data: { tenantId: goldcoast.tenantId, reservationId: res6.reservationId, amount: 240.00, paymentMethod: 'Online', paymentDate: new Date('2026-06-20'), receivedBy: efosu.userId, status: 'Completed', gatewayReference: 'stripe_ref_44x' } });

    const res7 = await prisma.reservation.create({
      data: {
        tenantId: goldcoast.tenantId, propertyId: goldcoastProperty.propertyId,
        guestId: getGuest('kmensah').guestId, staffId: kdarko.userId, source: 'Walk-in',
        checkInDate: new Date('2026-07-01'), checkOutDate: new Date('2026-07-03'), status: 'Confirmed',
        notes: 'Business traveler', totalAmount: 160.00, amountPaid: 80.00, balanceDue: 80.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: goldcoast.tenantId, reservationId: res7.reservationId, roomId: goldcoastRooms[1].roomId, roomTypeId: goldcoastRooms[1].roomTypeId, checkInDate: new Date('2026-07-01'), checkOutDate: new Date('2026-07-03'), agreedPricePerNight: 80.00 } });
    await prisma.payment.create({ data: { tenantId: goldcoast.tenantId, reservationId: res7.reservationId, amount: 80.00, paymentMethod: 'Cash', paymentDate: new Date('2026-07-01'), receivedBy: kdarko.userId, status: 'Completed' } });

    console.log('✅ Gold Coast reservations created (2)');
  }

  // --- Sunset Reservations ---
  const sunsetRooms = allRooms.filter(r => r.propertyId === sunsetProperty.propertyId);
  if (sunsetRooms.length >= 2) {
    const res8 = await prisma.reservation.create({
      data: {
        tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId,
        guestId: getGuest('aserwaa').guestId, staffId: eappiah.userId, source: 'Website',
        checkInDate: new Date('2026-07-10'), checkOutDate: new Date('2026-07-14'), status: 'Confirmed',
        notes: 'Family vacation', totalAmount: 220.00, amountPaid: 110.00, balanceDue: 110.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: sunset.tenantId, reservationId: res8.reservationId, roomId: sunsetRooms[0].roomId, roomTypeId: sunsetRooms[0].roomTypeId, checkInDate: new Date('2026-07-10'), checkOutDate: new Date('2026-07-14'), agreedPricePerNight: 55.00 } });
    await prisma.payment.create({ data: { tenantId: sunset.tenantId, reservationId: res8.reservationId, amount: 110.00, paymentMethod: 'Online', paymentDate: new Date('2026-07-05'), receivedBy: eappiah.userId, status: 'Completed', gatewayReference: 'stripe_ref_88y' } });

    const res9 = await prisma.reservation.create({
      data: {
        tenantId: sunset.tenantId, propertyId: sunsetProperty.propertyId,
        guestId: getGuest('jdoe').guestId, staffId: kobbah.userId, source: 'Phone',
        checkInDate: new Date('2026-08-01'), checkOutDate: new Date('2026-08-03'), status: 'Confirmed',
        notes: 'Weekend getaway', totalAmount: 200.00, amountPaid: 0.00, balanceDue: 200.00,
      },
    });
    await prisma.reservationRoom.create({ data: { tenantId: sunset.tenantId, reservationId: res9.reservationId, roomId: sunsetRooms[1].roomId, roomTypeId: sunsetRooms[1].roomTypeId, checkInDate: new Date('2026-08-01'), checkOutDate: new Date('2026-08-03'), agreedPricePerNight: 100.00 } });

    console.log('✅ Sunset reservations created (2)');
  }

  console.log('✅ All reservations and payments created');
  console.log('\n🎉 Seeding complete!');
  console.log('📊 Summary:');
  console.log(`   - 3 Tenants`);
  console.log(`   - 4 Properties`);
  console.log(`   - 3 Roles`);
  console.log(`   - 9 Users`);
  console.log(`   - 11 Permissions`);
  console.log(`   - ${createdRoomTypes.length} Room Types`);
  console.log(`   - ${rooms.length} Rooms`);
  console.log(`   - ${ratePlans.length} Rate Plans`);
  console.log(`   - ${guests.length} Guests`);
  console.log(`   - 9 Reservations with Payments`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });