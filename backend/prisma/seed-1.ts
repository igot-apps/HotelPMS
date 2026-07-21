import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed...\n');

  // ==========================================
  // 1. CLEAR EXISTING DATA (Strict Order)
  // ==========================================
  console.log('🧹 Clearing existing data...');
  await prisma.roomTypeAmenity.deleteMany();
  await prisma.reservationRoom.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.room.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.propertyGuest.deleteMany();
  await prisma.platformGuest.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.property.deleteMany();
  console.log('✅ Database cleared.\n');

  // ==========================================
  // 2. ROLES & PERMISSIONS (Sidebar Fix)
  // ==========================================
  console.log('👤 Creating Roles & Permissions...');
  const adminRole = await prisma.role.upsert({ where: { roleName: 'Admin' }, update: {}, create: { roleName: 'Admin', description: 'Full system access', isSystem: true } });
  const managerRole = await prisma.role.upsert({ where: { roleName: 'Manager' }, update: {}, create: { roleName: 'Manager', description: 'Property management', isSystem: true } });
  const receptionistRole = await prisma.role.upsert({ where: { roleName: 'Receptionist' }, update: {}, create: { roleName: 'Receptionist', description: 'Front desk', isSystem: true } });

  const permissionCodes = [
    'CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest',
    'CanViewRooms', 'CanCreateRoom', 'CanUpdateRoom', 'CanDeleteRoom',
    'CanCreateRoomType', 'CanUpdateRoomType', 'CanDeleteRoomType', 'CanUpdateRoomStatus', 'CanManageRates',
    'CanProcessPayments', 'CanIssueRefunds', 'CanViewFinancialReports',
    'CanManageBilling', 'CanManageHousekeeping', 'CanManageMaintenance', 'CanManageStaffAndRoles'
  ];

  const createdPermissions = [];
  for (const code of permissionCodes) {
    const perm = await prisma.permission.upsert({
      where: { code }, update: {},
      create: { code, name: code.replace(/([A-Z])/g, ' $1').trim(), category: 'General' },
    });
    createdPermissions.push(perm);
  }

  // Map ALL to Admin
  for (const perm of createdPermissions) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: adminRole.roleId, permissionId: perm.permissionId } }, update: {}, create: { roleId: adminRole.roleId, permissionId: perm.permissionId } });
  }
  // Map to Manager (Includes Billing, Excludes Staff/Roles)
  const managerPerms = createdPermissions.filter(p => p.code !== 'CanManageStaffAndRoles');
  for (const perm of managerPerms) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: managerRole.roleId, permissionId: perm.permissionId } }, update: {}, create: { roleId: managerRole.roleId, permissionId: perm.permissionId } });
  }
  // Map to Receptionist (Basic Ops)
  const recPerms = createdPermissions.filter(p => ['CanCreateReservation', 'CanCheckInGuest', 'CanCheckOutGuest', 'CanViewRooms'].includes(p.code));
  for (const perm of recPerms) {
    await prisma.rolePermission.upsert({ where: { roleId_permissionId: { roleId: receptionistRole.roleId, permissionId: perm.permissionId } }, update: {}, create: { roleId: receptionistRole.roleId, permissionId: perm.permissionId } });
  }
  console.log('✅ Roles and Permissions mapped.\n');

  // ==========================================
  // 3. PROPERTIES (With GPS for Discover Page)
  // ==========================================
  console.log('🏨 Creating Properties...');
  const p1 = await prisma.property.create({
    data: {
      propertyCode: 'honeymoon-city', propertyName: 'The Honeymoon City', businessName: 'Honeymoon Hospitality Ltd',
      subscriptionPlan: 'Premium', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'bookings@honeymooncity.com', primaryPhone: '0302778899', propertyType: 'Hotel',
      city: 'Accra', country: 'Ghana', latitude: 5.6037, longitude: -0.1870, totalRooms: 10, taxPercentage: 15.00,
      isOnlineBookingEnabled: true, publicDescription: 'A luxurious escape in the heart of Accra.',
      coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    },
  });

  const p2 = await prisma.property.create({
    data: {
      propertyCode: 'ashaiman-comfort', propertyName: 'Ashaiman Comfort Inn', businessName: 'Comfort Stays Ghana',
      subscriptionPlan: 'Starter', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'info@ashaimancomfort.com', primaryPhone: '0541234567', propertyType: 'Guesthouse',
      city: 'Ashaiman', country: 'Ghana', latitude: 5.7167, longitude: -0.0333, totalRooms: 5, taxPercentage: 5.00,
      isOnlineBookingEnabled: true, publicDescription: 'No-frills comfort and honest pricing.',
      coverImage: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
    },
  });

  const p3 = await prisma.property.create({
    data: {
      propertyCode: 'kumasi-city', propertyName: 'Kumasi City Hotel', businessName: 'Kumasi Hospitality',
      subscriptionPlan: 'Pro', subscriptionStatus: 'Expired', currency: 'GHS',
      primaryEmail: 'res@kumasicity.com', primaryPhone: '0322088999', propertyType: 'Hotel',
      city: 'Kumasi', country: 'Ghana', latitude: 6.6885, longitude: -1.6244, totalRooms: 20, taxPercentage: 10.00,
      isOnlineBookingEnabled: false, publicDescription: 'The premier business hotel in the Garden City.',
      coverImage: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
    },
  });

  // ==========================================
  // 4. USERS (Password: manager123)
  // ==========================================
  console.log('👨‍💼 Creating Users...');
  const hashedPassword = await bcrypt.hash('manager123', 10);

  await prisma.user.createMany({
    data: [
      { propertyId: p1.propertyId, fullName: 'Kwame Mensah', username: 'kwame_admin', email: 'kwame@honeymooncity.com', passwordHash: hashedPassword, roleId: adminRole.roleId },
      { propertyId: p2.propertyId, fullName: 'Ama Serwaa', username: 'ama_manager', email: 'ama@ashaimancomfort.com', passwordHash: hashedPassword, roleId: managerRole.roleId },
      { propertyId: p1.propertyId, fullName: 'Kofi Frontdesk', username: 'kofi_reception', email: 'kofi@honeymooncity.com', passwordHash: hashedPassword, roleId: receptionistRole.roleId },
    ],
  });

  // ==========================================
  // 5. ROOMS & AMENITIES
  // ==========================================
  console.log('🛏️ Creating Rooms & Amenities...');
  const wifi = await prisma.amenity.create({ data: { propertyId: p1.propertyId, name: 'Free WiFi', icon: 'wifi' } });
  const ac = await prisma.amenity.create({ data: { propertyId: p1.propertyId, name: 'Air Conditioning', icon: 'ac' } });

  const rt1 = await prisma.roomType.create({ data: { propertyId: p1.propertyId, typeName: 'Deluxe King', basePrice: 850.00, maxOccupancy: 2 } });
  const rt2 = await prisma.roomType.create({ data: { propertyId: p1.propertyId, typeName: 'Standard Twin', basePrice: 600.00, maxOccupancy: 2 } });
  
  await prisma.roomTypeAmenity.createMany({ data: [
    { roomTypeId: rt1.roomTypeId, amenityId: wifi.amenityId },
    { roomTypeId: rt1.roomTypeId, amenityId: ac.amenityId },
  ]});

  // Create Rooms with varied statuses for Dashboard testing
  await prisma.room.createMany({
    data: [
      { propertyId: p1.propertyId, roomTypeId: rt1.roomTypeId, roomNumber: '101', operationalStatus: 'Available', housekeepingStatus: 'Clean' },
      { propertyId: p1.propertyId, roomTypeId: rt1.roomTypeId, roomNumber: '102', operationalStatus: 'Occupied', housekeepingStatus: 'Dirty' }, // Needs cleaning
      { propertyId: p1.propertyId, roomTypeId: rt2.roomTypeId, roomNumber: '103', operationalStatus: 'Available', housekeepingStatus: 'Inspected' },
      { propertyId: p1.propertyId, roomTypeId: rt2.roomTypeId, roomNumber: '104', operationalStatus: 'Maintenance', housekeepingStatus: 'Inspected' }, // Out of order
      { propertyId: p2.propertyId, roomTypeId: rt2.roomTypeId, roomNumber: 'A1', operationalStatus: 'Available', housekeepingStatus: 'Clean' },
    ],
  });

  // ==========================================
  // 6. GUESTS
  // ==========================================
  console.log('🧳 Creating Guests...');
  const platGuest = await prisma.platformGuest.create({
    data: { fullName: 'Yaa Boateng', phone: '0551239876', email: 'yaa@gmail.com', passwordHash: hashedPassword, isPhoneVerified: true, isEmailVerified: true },
  });
  const propGuest = await prisma.propertyGuest.create({
    data: { propertyId: p1.propertyId, fullName: 'Walk-in Guest', phone: '0244000000' },
  });

  // ==========================================
  // 7. RESERVATIONS & PAYMENTS (Rich Data for Reports)
  // ==========================================
  console.log('📅 Creating Reservations & Payments...');
  const room101 = await prisma.room.findFirst({ where: { roomNumber: '101', propertyId: p1.propertyId } });
  const room102 = await prisma.room.findFirst({ where: { roomNumber: '102', propertyId: p1.propertyId } });

  // 1. PAST RESERVATION (Checked Out) - Good for Reports
  const pastRes = await prisma.reservation.create({
    data: {
      propertyId: p1.propertyId, propertyGuestId: propGuest.guestId, source: 'Walk-in',
      checkInDate: new Date(Date.now() - 5 * 86400000), checkOutDate: new Date(Date.now() - 2 * 86400000),
      status: 'CheckedOut', totalAmount: 2550.00, amountPaid: 2550.00, balanceDue: 0.00,
    },
  });
  if (room101) await prisma.reservationRoom.create({ data: { reservationId: pastRes.reservationId, roomId: room101.roomId, roomTypeId: rt1.roomTypeId, checkInDate: pastRes.checkInDate, checkOutDate: pastRes.checkOutDate, agreedPricePerNight: 850.00 } });
  await prisma.payment.create({ data: { reservationId: pastRes.reservationId, amount: 2550.00, paymentMethod: 'Mobile Money', status: 'Completed', gatewayReference: 'MOMO-PAST-001' } });

  // 2. CURRENT RESERVATION (Checked In) - Good for Dashboard "In-House"
  const currentRes = await prisma.reservation.create({
    data: {
      propertyId: p1.propertyId, platformGuestId: platGuest.guestId, source: 'Website',
      checkInDate: new Date(Date.now() - 1 * 86400000), checkOutDate: new Date(Date.now() + 2 * 86400000),
      status: 'CheckedIn', totalAmount: 2550.00, amountPaid: 1000.00, balanceDue: 1550.00,
    },
  });
  if (room102) await prisma.reservationRoom.create({ data: { reservationId: currentRes.reservationId, roomId: room102.roomId, roomTypeId: rt1.roomTypeId, checkInDate: currentRes.checkInDate, checkOutDate: currentRes.checkOutDate, agreedPricePerNight: 850.00 } });
  await prisma.payment.create({ data: { reservationId: currentRes.reservationId, amount: 1000.00, paymentMethod: 'Card', status: 'Completed', gatewayReference: 'CARD-CURRENT-002' } });

  // 3. FUTURE RESERVATION (Confirmed) - Good for Dashboard "Arrivals"
  const futureRes = await prisma.reservation.create({
    data: {
      propertyId: p1.propertyId, platformGuestId: platGuest.guestId, source: 'Website',
      checkInDate: new Date(Date.now() + 3 * 86400000), checkOutDate: new Date(Date.now() + 5 * 86400000),
      status: 'Confirmed', totalAmount: 1700.00, amountPaid: 1700.00, balanceDue: 0.00,
    },
  });
  if (room101) await prisma.reservationRoom.create({ data: { reservationId: futureRes.reservationId, roomId: room101.roomId, roomTypeId: rt1.roomTypeId, checkInDate: futureRes.checkInDate, checkOutDate: futureRes.checkOutDate, agreedPricePerNight: 850.00 } });
  await prisma.payment.create({ data: { reservationId: futureRes.reservationId, amount: 1700.00, paymentMethod: 'Bank Transfer', status: 'Completed', gatewayReference: 'BANK-FUTURE-003' } });

  // 4. CANCELLED RESERVATION
  const cancelRes = await prisma.reservation.create({
    data: {
      propertyId: p1.propertyId, propertyGuestId: propGuest.guestId, source: 'Walk-in',
      checkInDate: new Date(Date.now() + 10 * 86400000), checkOutDate: new Date(Date.now() + 12 * 86400000),
      status: 'Cancelled', totalAmount: 1200.00, amountPaid: 0.00, balanceDue: 0.00,
    },
  });

  console.log('\n✅ DATABASE SEEDED SUCCESSFULLY!');
  console.log('---------------------------------------------------');
  console.log('🔑 LOGIN CREDENTIALS (Password for ALL users):');
  console.log('   👤 Admin:        kwame_admin');
  console.log('   👤 Manager:      ama_manager');
  console.log('   👤 Receptionist: kofi_reception');
  console.log('   🔒 Password:     manager123');
  console.log('---------------------------------------------------');
  console.log('📊 DATA SUMMARY:');
  console.log('   - 3 Properties (Accra, Ashaiman, Kumasi)');
  console.log('   - 5 Rooms (Mixed statuses: Available, Occupied, Dirty, Maintenance)');
  console.log('   - 4 Reservations (CheckedOut, CheckedIn, Confirmed, Cancelled)');
  console.log('   - 3 Payments (For testing Reports & Payments pages)');
  console.log('---------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);

  })
  .finally(async () => {
    await prisma.$disconnect();
  });