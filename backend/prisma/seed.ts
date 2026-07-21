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
  // 2. ROLES & PERMISSIONS
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
  // 3. PROPERTIES (With GPS & Paystack Keys)
  // ==========================================
  console.log('🏨 Creating Properties...');
  const p1 = await prisma.property.create({
    data: {
      propertyCode: 'honeymoon-city', propertyName: 'The Honeymoon City', businessName: 'Honeymoon Hospitality Ltd',
      subscriptionPlan: 'Premium', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'bookings@honeymooncity.com', primaryPhone: '0302778899', propertyType: 'Hotel',
      city: 'Accra', country: 'Ghana', latitude: 5.6037, longitude: -0.1870, totalRooms: 10, taxPercentage: 15.00,
      isOnlineBookingEnabled: true, publicDescription: 'A luxurious escape in the heart of Accra.',
      paystackSecretKey: 'sk_test_replace_with_your_real_paystack_test_key', // 🌟 UPDATE IN PRISMA STUDIO
      coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    },
  });

  const p2 = await prisma.property.create({
    data: {
      propertyCode: 'tema-portside', propertyName: 'Tema Portside Hotel', businessName: 'Portside Stays Ghana',
      subscriptionPlan: 'Pro', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'info@temaportside.com', primaryPhone: '0541234567', propertyType: 'Hotel',
      city: 'Tema', country: 'Ghana', latitude: 5.6698, longitude: -0.0166, totalRooms: 8, taxPercentage: 10.00,
      isOnlineBookingEnabled: true, publicDescription: 'Modern comfort with a beautiful view of the port.',
      paystackSecretKey: 'sk_test_replace_with_your_real_paystack_test_key', // 🌟 UPDATE IN PRISMA STUDIO
      coverImage: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
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
      { propertyId: p2.propertyId, fullName: 'Ama Serwaa', username: 'ama_manager', email: 'ama@temaportside.com', passwordHash: hashedPassword, roleId: managerRole.roleId },
      { propertyId: p1.propertyId, fullName: 'Kofi Frontdesk', username: 'kofi_reception', email: 'kofi@honeymooncity.com', passwordHash: hashedPassword, roleId: receptionistRole.roleId },
    ],
  });

  // ==========================================
  // 5. ROOMS & AMENITIES
  // ==========================================
  console.log('🛏️ Creating Rooms & Amenities...');
  const wifi = await prisma.amenity.create({ data: { propertyId: p1.propertyId, name: 'Free WiFi', icon: 'wifi' } });
  const ac = await prisma.amenity.create({ data: { propertyId: p1.propertyId, name: 'Air Conditioning', icon: 'ac' } });
  const pool = await prisma.amenity.create({ data: { propertyId: p2.propertyId, name: 'Swimming Pool', icon: 'pool' } });

  const rt1 = await prisma.roomType.create({ data: { propertyId: p1.propertyId, typeName: 'Deluxe King', basePrice: 850.00, maxOccupancy: 2 } });
  const rt2 = await prisma.roomType.create({ data: { propertyId: p2.propertyId, typeName: 'Portside Suite', basePrice: 1200.00, maxOccupancy: 2 } });
  
  await prisma.roomTypeAmenity.createMany({ data: [
    { roomTypeId: rt1.roomTypeId, amenityId: wifi.amenityId },
    { roomTypeId: rt1.roomTypeId, amenityId: ac.amenityId },
    { roomTypeId: rt2.roomTypeId, amenityId: pool.amenityId },
    { roomTypeId: rt2.roomTypeId, amenityId: wifi.amenityId },
  ]});

  // Create Rooms with varied statuses (Ensure at least one is 'Available' per property)
  await prisma.room.createMany({
    data: [
      { propertyId: p1.propertyId, roomTypeId: rt1.roomTypeId, roomNumber: '101', operationalStatus: 'Available', housekeepingStatus: 'Clean' },
      { propertyId: p1.propertyId, roomTypeId: rt1.roomTypeId, roomNumber: '102', operationalStatus: 'Occupied', housekeepingStatus: 'Dirty' },
      { propertyId: p2.propertyId, roomTypeId: rt2.roomTypeId, roomNumber: 'A1', operationalStatus: 'Available', housekeepingStatus: 'Clean' },
      { propertyId: p2.propertyId, roomTypeId: rt2.roomTypeId, roomNumber: 'A2', operationalStatus: 'Available', housekeepingStatus: 'Inspected' },
    ],
  });

  // ==========================================
  // 6. GUESTS, RESERVATIONS & PAYMENTS
  // ==========================================
  console.log('📅 Creating Guests, Reservations & Payments...');
  const platGuest = await prisma.platformGuest.create({
    data: { fullName: 'Yaa Boateng', phone: '0551239876', email: 'yaa@gmail.com', passwordHash: hashedPassword, isPhoneVerified: true, isEmailVerified: true },
  });

  const roomA1 = await prisma.room.findFirst({ where: { roomNumber: 'A1', propertyId: p2.propertyId } });
  
  // Create a future confirmed reservation for testing checkout
  const futureRes = await prisma.reservation.create({
    data: {
      propertyId: p2.propertyId, platformGuestId: platGuest.guestId, source: 'Website',
      checkInDate: new Date(Date.now() + 3 * 86400000), checkOutDate: new Date(Date.now() + 5 * 86400000),
      status: 'Confirmed', totalAmount: 2400.00, amountPaid: 0.00, balanceDue: 2400.00,
    },
  });

  if (roomA1) {
    await prisma.reservationRoom.create({ 
      data: { 
        reservationId: futureRes.reservationId, 
        roomId: roomA1.roomId, 
        roomTypeId: rt2.roomTypeId, 
        checkInDate: futureRes.checkInDate, 
        checkOutDate: futureRes.checkOutDate, 
        agreedPricePerNight: 1200.00 
      } 
    });
  }

  console.log('\n✅ DATABASE SEEDED SUCCESSFULLY!');
  console.log('---------------------------------------------------');
  console.log('🔑 LOGIN CREDENTIALS (Password for ALL users): manager123');
  console.log('   👤 Admin:        kwame_admin');
  console.log('   👤 Manager:      ama_manager');
  console.log('   👤 Receptionist: kofi_reception');
  console.log('---------------------------------------------------');
  console.log('⚠️  IMPORTANT: Open `npx prisma studio` and update the');
  console.log('   `paystackSecretKey` for "tema-portside" and "honeymoon-city"');
  console.log('   with your actual Paystack Test Secret Key, or payments will fail!');
  console.log('---------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    
  })
  .finally(async () => {
    await prisma.$disconnect();
  });