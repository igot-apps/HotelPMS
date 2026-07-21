import { PrismaClient, Permission, Prisma } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed...\n');

  // ==========================================
  // 1. CLEAR EXISTING DATA (Strict Order)
  // ==========================================
  console.log('🧹 Clearing existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.roomTypeAmenity.deleteMany();
  await prisma.reservationRoom.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.room.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.roomType.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.propertyGuest.deleteMany();
  await prisma.platformGuest.deleteMany();
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
  const housekeepingRole = await prisma.role.upsert({ where: { roleName: 'Housekeeping' }, update: {}, create: { roleName: 'Housekeeping', description: 'Room status & cleaning', isSystem: true } });
  const accountantRole = await prisma.role.upsert({ where: { roleName: 'Accountant' }, update: {}, create: { roleName: 'Accountant', description: 'Financial oversight', isSystem: true } });

  const permissionCodes = [
    'CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest',
    'CanViewRooms', 'CanCreateRoom', 'CanUpdateRoom', 'CanDeleteRoom',
    'CanCreateRoomType', 'CanUpdateRoomType', 'CanDeleteRoomType', 'CanUpdateRoomStatus', 'CanManageRates',
    'CanProcessPayments', 'CanIssueRefunds', 'CanViewFinancialReports',
    'CanManageBilling', 'CanManageHousekeeping', 'CanManageMaintenance', 'CanManageStaffAndRoles'
  ];

  const createdPermissions: Permission[] = [];
  for (const code of permissionCodes) {
    const perm = await prisma.permission.upsert({
      where: { code }, update: {},
      create: { code, name: code.replace(/([A-Z])/g, ' $1').trim(), category: 'General' },
    });
    createdPermissions.push(perm);
  }

  const mapPerms = async (roleId: number, codes: string[]) => {
    const perms = createdPermissions.filter(p => codes.includes(p.code));
    for (const perm of perms) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: perm.permissionId } },
        update: {}, create: { roleId, permissionId: perm.permissionId },
      });
    }
  };

  await mapPerms(adminRole.roleId, permissionCodes);
  await mapPerms(managerRole.roleId, permissionCodes.filter(c => c !== 'CanManageStaffAndRoles'));
  await mapPerms(receptionistRole.roleId, ['CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest', 'CanCheckOutGuest', 'CanViewRooms', 'CanProcessPayments']);
  await mapPerms(housekeepingRole.roleId, ['CanViewRooms', 'CanUpdateRoomStatus', 'CanManageHousekeeping', 'CanManageMaintenance']);
  await mapPerms(accountantRole.roleId, ['CanViewFinancialReports', 'CanManageBilling', 'CanProcessPayments', 'CanIssueRefunds']);
  console.log('✅ Roles and Permissions mapped.\n');

  // ==========================================
  // 3. PROPERTIES
  // Note: subscriptionStatus only accepts Trial | Active | Expired | Cancelled
  // ==========================================
  console.log('🏨 Creating Properties...');

  const propertyDefs: Prisma.PropertyCreateInput[] = [
    {
      propertyCode: 'honeymoon-city', propertyName: 'The Honeymoon City', businessName: 'Honeymoon Hospitality Ltd',
      subscriptionPlan: 'Premium', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'bookings@honeymooncity.com', primaryPhone: '0302778899', propertyType: 'Hotel',
      city: 'Accra', country: 'Ghana', latitude: 5.6037, longitude: -0.1870, totalRooms: 10, taxPercentage: 15.00,
      isOnlineBookingEnabled: true, publicDescription: 'A luxurious escape in the heart of Accra.',
      coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
    },
    {
      propertyCode: 'ashaiman-comfort', propertyName: 'Ashaiman Comfort Inn', businessName: 'Comfort Stays Ghana',
      subscriptionPlan: 'Starter', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'info@ashaimancomfort.com', primaryPhone: '0541234567', propertyType: 'Guesthouse',
      city: 'Ashaiman', country: 'Ghana', latitude: 5.7167, longitude: -0.0333, totalRooms: 5, taxPercentage: 5.00,
      isOnlineBookingEnabled: true, publicDescription: 'No-frills comfort and honest pricing.',
      coverImage: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80',
    },
    {
      propertyCode: 'kumasi-city', propertyName: 'Kumasi City Hotel', businessName: 'Kumasi Hospitality',
      subscriptionPlan: 'Pro', subscriptionStatus: 'Expired', currency: 'GHS',
      primaryEmail: 'res@kumasicity.com', primaryPhone: '0322088999', propertyType: 'Hotel',
      city: 'Kumasi', country: 'Ghana', latitude: 6.6885, longitude: -1.6244, totalRooms: 20, taxPercentage: 10.00,
      isOnlineBookingEnabled: false, publicDescription: 'The premier business hotel in the Garden City.',
      coverImage: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=800&q=80',
    },
    {
      propertyCode: 'takoradi-beach', propertyName: 'Takoradi Beach Lodge', businessName: 'Western Coast Hospitality',
      subscriptionPlan: 'Pro', subscriptionStatus: 'Active', currency: 'GHS',
      primaryEmail: 'stay@takoradibeach.com', primaryPhone: '0312045678', propertyType: 'Resort',
      city: 'Takoradi', country: 'Ghana', latitude: 4.8845, longitude: -1.7554, totalRooms: 15, taxPercentage: 12.50,
      isOnlineBookingEnabled: true, publicDescription: 'Oceanfront relaxation on the western coast.',
      coverImage: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=800&q=80',
    },
    {
      propertyCode: 'tamale-inn', propertyName: 'Tamale Northern Inn', businessName: 'Savannah Stays Ltd',
      subscriptionPlan: 'Starter', subscriptionStatus: 'Trial', currency: 'GHS',
      primaryEmail: 'hello@tamalenortherninn.com', primaryPhone: '0372022334', propertyType: 'Guesthouse',
      city: 'Tamale', country: 'Ghana', latitude: 9.4034, longitude: -0.8424, totalRooms: 8, taxPercentage: 5.00,
      isOnlineBookingEnabled: true, publicDescription: 'A quiet, affordable base in the north.',
      coverImage: 'https://images.unsplash.com/photo-1521401830884-6c03c1c87ebb?auto=format&fit=crop&w=800&q=80',
    },
    {
      propertyCode: 'tema-portside', propertyName: 'Tema Portside Suites', businessName: 'Portside Hospitality Group',
      subscriptionPlan: 'Premium', subscriptionStatus: 'Cancelled', currency: 'GHS',
      primaryEmail: 'reservations@temaportside.com', primaryPhone: '0303202020', propertyType: 'Apartment Hotel',
      city: 'Tema', country: 'Ghana', latitude: 5.6698, longitude: -0.0166, totalRooms: 12, taxPercentage: 15.00,
      isOnlineBookingEnabled: false, publicDescription: 'Business suites near the harbour.',
      coverImage: 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=80',
    },
  ];

  const properties = [];
  for (const def of propertyDefs) {
    const prop = await prisma.property.create({ data: def });
    properties.push(prop);
  }
  const [p1, p2, p3, p4, p5, p6] = properties;
  console.log(`✅ ${properties.length} Properties created.\n`);

  // ==========================================
  // 4. USERS (Password: manager123)
  // ==========================================
  console.log('👨‍💼 Creating Users...');
  const hashedPassword = await bcrypt.hash('manager123', 10);

  await prisma.user.createMany({
    data: [
      { propertyId: p1.propertyId, fullName: 'Kwame Mensah', username: 'kwame_admin', email: 'kwame@honeymooncity.com', passwordHash: hashedPassword, roleId: adminRole.roleId },
      { propertyId: p1.propertyId, fullName: 'Kofi Frontdesk', username: 'kofi_reception', email: 'kofi@honeymooncity.com', passwordHash: hashedPassword, roleId: receptionistRole.roleId },
      { propertyId: p1.propertyId, fullName: 'Efua Owusu', username: 'efua_housekeeping', email: 'efua@honeymooncity.com', passwordHash: hashedPassword, roleId: housekeepingRole.roleId },
      { propertyId: p2.propertyId, fullName: 'Ama Serwaa', username: 'ama_manager', email: 'ama@ashaimancomfort.com', passwordHash: hashedPassword, roleId: managerRole.roleId },
      { propertyId: p3.propertyId, fullName: 'Yaw Boadi', username: 'yaw_admin', email: 'yaw@kumasicity.com', passwordHash: hashedPassword, roleId: adminRole.roleId },
      { propertyId: p3.propertyId, fullName: 'Akosua Darko', username: 'akosua_accountant', email: 'akosua@kumasicity.com', passwordHash: hashedPassword, roleId: accountantRole.roleId },
      { propertyId: p4.propertyId, fullName: 'Nana Yeboah', username: 'nana_manager', email: 'nana@takoradibeach.com', passwordHash: hashedPassword, roleId: managerRole.roleId },
      { propertyId: p4.propertyId, fullName: 'Esi Ankomah', username: 'esi_reception', email: 'esi@takoradibeach.com', passwordHash: hashedPassword, roleId: receptionistRole.roleId },
      { propertyId: p5.propertyId, fullName: 'Iddrisu Mahama', username: 'iddrisu_admin', email: 'iddrisu@tamalenortherninn.com', passwordHash: hashedPassword, roleId: adminRole.roleId },
      { propertyId: p6.propertyId, fullName: 'Rita Ofori', username: 'rita_manager', email: 'rita@temaportside.com', passwordHash: hashedPassword, roleId: managerRole.roleId },
    ],
  });
  console.log('✅ Users created.\n');

  // ==========================================
  // 5. ROOM TYPES, AMENITIES & ROOMS
  // Note: operationalStatus only accepts Available | Occupied | Maintenance
  //       housekeepingStatus only accepts Clean | Dirty | Inspected
  // ==========================================
  console.log('🛏️ Creating Room Types, Amenities & Rooms...');

  const amenityDefs = ['Free WiFi', 'Air Conditioning', 'Flat-screen TV', 'Hot Water', 'Mini Fridge', 'Balcony', 'Room Service', 'Safe Box'];
  const amenityIcons: Record<string, string> = {
    'Free WiFi': 'wifi', 'Air Conditioning': 'ac', 'Flat-screen TV': 'tv', 'Hot Water': 'shower',
    'Mini Fridge': 'fridge', 'Balcony': 'balcony', 'Room Service': 'bell', 'Safe Box': 'lock',
  };

  const roomsByProperty: Record<number, any[]> = {};
  const roomTypesByProperty: Record<number, any[]> = {};

  const roomTypeTemplates = [
    { typeName: 'Standard Single', basePrice: 350.00, maxOccupancy: 1 },
    { typeName: 'Standard Twin', basePrice: 600.00, maxOccupancy: 2 },
    { typeName: 'Deluxe King', basePrice: 850.00, maxOccupancy: 2 },
    { typeName: 'Executive Suite', basePrice: 1400.00, maxOccupancy: 3 },
    { typeName: 'Family Room', basePrice: 1100.00, maxOccupancy: 4 },
  ];

  const roomStatusCycle: Array<[Prisma.RoomCreateInput['operationalStatus'], Prisma.RoomCreateInput['housekeepingStatus']]> = [
    ['Available', 'Clean'], ['Occupied', 'Dirty'], ['Available', 'Inspected'],
    ['Maintenance', 'Inspected'], ['Occupied', 'Clean'], ['Available', 'Dirty'],
    ['Maintenance', 'Dirty'], ['Available', 'Inspected'],
  ];

  for (const prop of properties) {
    // amenities for this property
    const propAmenities = [];
    for (const name of amenityDefs.slice(0, 4)) {
      const amenity = await prisma.amenity.create({ data: { propertyId: prop.propertyId, name, icon: amenityIcons[name] } });
      propAmenities.push(amenity);
    }

    // room types scaled to property size
    const typeCount = prop.totalRooms >= 15 ? 4 : prop.totalRooms >= 8 ? 3 : 2;
    const types = [];
    for (const template of roomTypeTemplates.slice(0, typeCount)) {
      const rt = await prisma.roomType.create({ data: { propertyId: prop.propertyId, ...template } });
      types.push(rt);
      await prisma.roomTypeAmenity.createMany({
        data: propAmenities.slice(0, 2).map(a => ({ roomTypeId: rt.roomTypeId, amenityId: a.amenityId })),
      });
    }
    roomTypesByProperty[prop.propertyId] = types;

    // rooms, cycling status combos and room types
    const rooms = [];
    for (let i = 0; i < prop.totalRooms; i++) {
      const rt = types[i % types.length];
      const [operationalStatus, housekeepingStatus] = roomStatusCycle[i % roomStatusCycle.length];
      const floor = Math.floor(i / 4) + 1;
      const roomNumber = `${floor}${String((i % 4) + 1).padStart(2, '0')}`;
      const room = await prisma.room.create({
        data: {
          propertyId: prop.propertyId, roomTypeId: rt.roomTypeId, roomNumber, floor,
          operationalStatus, housekeepingStatus,
        },
      });
      rooms.push(room);
    }
    roomsByProperty[prop.propertyId] = rooms;
  }
  console.log('✅ Room Types, Amenities & Rooms created.\n');

  // ==========================================
  // 6. GUESTS
  // ==========================================
  console.log('🧳 Creating Guests...');

  const platformGuestDefs = [
    { fullName: 'Yaa Boateng', phone: '0551239876', email: 'yaa@gmail.com', isPhoneVerified: true, isEmailVerified: true },
    { fullName: 'Kwesi Appiah', phone: '0244567890', email: 'kwesi.appiah@gmail.com', isPhoneVerified: true, isEmailVerified: false },
    { fullName: 'Abena Owusu', phone: '0209988776', email: 'abena.owusu@yahoo.com', isPhoneVerified: true, isEmailVerified: true },
    { fullName: 'David Osei', phone: '0271122334', email: 'david.osei@outlook.com', isPhoneVerified: false, isEmailVerified: false },
    { fullName: 'Linda Asante', phone: '0501234567', email: 'linda.asante@gmail.com', isPhoneVerified: true, isEmailVerified: true },
  ];

  const platformGuests = [];
  for (const def of platformGuestDefs) {
    const g = await prisma.platformGuest.create({ data: { ...def, passwordHash: hashedPassword } });
    platformGuests.push(g);
  }

  const propertyGuestDefs = [
    { propertyId: p1.propertyId, fullName: 'Walk-in Guest', phone: '0244000000' },
    { propertyId: p1.propertyId, fullName: 'Michael Tetteh', phone: '0208887766' },
    { propertyId: p2.propertyId, fullName: 'Grace Nkrumah', phone: '0246665544' },
    { propertyId: p3.propertyId, fullName: 'Samuel Agyeman', phone: '0277334455' },
    { propertyId: p4.propertyId, fullName: 'Comfort Danso', phone: '0559991122' },
    { propertyId: p5.propertyId, fullName: 'Alhassan Fuseini', phone: '0244778899' },
    { propertyId: p6.propertyId, fullName: 'Patricia Amoah', phone: '0501112233' },
  ];

  const propertyGuests = [];
  for (const def of propertyGuestDefs) {
    const g = await prisma.propertyGuest.create({ data: def });
    propertyGuests.push(g);
  }
  console.log(`✅ ${platformGuests.length} Platform Guests, ${propertyGuests.length} Property Guests created.\n`);

  // ==========================================
  // 7. RESERVATIONS & PAYMENTS
  // Note: reservation.status only accepts Pending | Confirmed | CheckedIn | CheckedOut | Cancelled | NoShow
  //       payment.status only accepts Pending | Completed | Failed | Refunded
  // ==========================================
  console.log('📅 Creating Reservations & Payments...');

  const paymentMethods = ['Mobile Money', 'Card', 'Cash', 'Bank Transfer'];
  const sources = ['Walk-in', 'Website', 'Phone', 'Booking.com', 'Expedia'];
  let momoCounter = 1, cardCounter = 1, bankCounter = 1, cashCounter = 1;

  const nextRef = (method: string) => {
    switch (method) {
      case 'Mobile Money': return `MOMO-${String(momoCounter++).padStart(4, '0')}`;
      case 'Card': return `CARD-${String(cardCounter++).padStart(4, '0')}`;
      case 'Bank Transfer': return `BANK-${String(bankCounter++).padStart(4, '0')}`;
      default: return `CASH-${String(cashCounter++).padStart(4, '0')}`;
    }
  };

  let reservationCount = 0;
  let paymentCount = 0;
  const sampleReservationsForAudit: { reservationId: number; propertyId: number }[] = [];

  const scenarioTemplates: Array<{
    start: number; end: number; status: Prisma.ReservationCreateInput['status']; paidRatio: number;
  }> = [
    { start: -6, end: -3, status: 'CheckedOut', paidRatio: 1.0 },
    { start: -3, end: -1, status: 'CheckedOut', paidRatio: 1.0 },
    { start: -1, end: 2, status: 'CheckedIn', paidRatio: 0.4 },
    { start: -2, end: 1, status: 'CheckedIn', paidRatio: 1.0 },
    { start: 1, end: 3, status: 'Confirmed', paidRatio: 1.0 },
    { start: 2, end: 5, status: 'Confirmed', paidRatio: 0.5 },
    { start: 5, end: 7, status: 'Pending', paidRatio: 0.0 },
    { start: 8, end: 10, status: 'Cancelled', paidRatio: 0.0 },
    { start: 10, end: 12, status: 'NoShow', paidRatio: 0.3 },
  ];

  for (const prop of properties) {
    const rooms = roomsByProperty[prop.propertyId];
    const types = roomTypesByProperty[prop.propertyId];
    if (!rooms.length || !types.length) continue;

    const propGuestPool = propertyGuests.filter(g => g.propertyId === prop.propertyId);

    for (let i = 0; i < scenarioTemplates.length; i++) {
      const scenario = scenarioTemplates[i];
      const room = rooms[i % rooms.length];
      const rt = types.find(t => t.roomTypeId === room.roomTypeId) ?? types[0];
      const nights = scenario.end - scenario.start;
      const totalAmount = Number(rt.basePrice) * nights;

      // alternate between platform guest and property guest
      const usePlatformGuest = i % 2 === 0;
      const guestField = usePlatformGuest
        ? { platformGuestId: platformGuests[i % platformGuests.length].guestId }
        : { propertyGuestId: (propGuestPool[i % propGuestPool.length] ?? propertyGuests[i % propertyGuests.length]).guestId };

      const checkInDate = new Date(Date.now() + scenario.start * 86400000);
      const checkOutDate = new Date(Date.now() + scenario.end * 86400000);
      const amountPaid = Number((totalAmount * scenario.paidRatio).toFixed(2));
      const balanceDue = Number((totalAmount - amountPaid).toFixed(2));

      const reservation = await prisma.reservation.create({
        data: {
          propertyId: prop.propertyId,
          ...guestField,
          source: sources[i % sources.length],
          checkInDate, checkOutDate,
          status: scenario.status,
          totalAmount, amountPaid, balanceDue,
        },
      });
      reservationCount++;
      if (i === 0 || i === 2) {
        sampleReservationsForAudit.push({ reservationId: reservation.reservationId, propertyId: prop.propertyId });
      }

      if (scenario.status !== 'Cancelled') {
        await prisma.reservationRoom.create({
          data: {
            reservationId: reservation.reservationId, roomId: room.roomId, roomTypeId: rt.roomTypeId,
            checkInDate, checkOutDate, agreedPricePerNight: rt.basePrice,
          },
        });
      }

      if (amountPaid > 0) {
        const method = paymentMethods[i % paymentMethods.length];
        await prisma.payment.create({
          data: {
            reservationId: reservation.reservationId, amount: amountPaid, paymentMethod: method,
            status: 'Completed', gatewayReference: nextRef(method),
          },
        });
        paymentCount++;

        // occasionally add a second partial payment to show multi-payment reservations
        if (scenario.paidRatio < 1.0 && scenario.paidRatio > 0 && i % 3 === 0) {
          const secondAmount = Number((balanceDue * 0.5).toFixed(2));
          if (secondAmount > 0) {
            const method2 = paymentMethods[(i + 1) % paymentMethods.length];
            await prisma.payment.create({
              data: {
                reservationId: reservation.reservationId, amount: secondAmount, paymentMethod: method2,
                status: 'Completed', gatewayReference: nextRef(method2),
              },
            });
            paymentCount++;
          }
        }
      }
    }
  }
  console.log(`✅ ${reservationCount} Reservations, ${paymentCount} Payments created.\n`);

  // ==========================================
  // 8. AUDIT LOGS
  // Schema fields: userId, action, entityType, entityId, oldData, newData, ipAddress, userAgent
  // ==========================================
  console.log('📝 Creating Audit Logs...');
  const adminUser = await prisma.user.findUnique({ where: { username: 'kwame_admin' } });
  const receptionUser = await prisma.user.findUnique({ where: { username: 'kofi_reception' } });
  const room102 = roomsByProperty[p1.propertyId]?.[1];

  if (adminUser && receptionUser) {
    const auditEntries: Prisma.AuditLogCreateManyInput[] = [];

    if (sampleReservationsForAudit.length > 0) {
      auditEntries.push({
        userId: receptionUser.userId,
        action: 'CHECK_IN',
        entityType: 'Reservation',
        entityId: sampleReservationsForAudit[0].reservationId,
        oldData: { status: 'Confirmed' },
        newData: { status: 'CheckedIn' },
        ipAddress: '41.203.72.10',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
      auditEntries.push({
        userId: receptionUser.userId,
        action: 'PAYMENT_RECEIVED',
        entityType: 'Payment',
        entityId: sampleReservationsForAudit[0].reservationId,
        oldData: Prisma.JsonNull,
        newData: { paymentMethod: 'Mobile Money', status: 'Completed' },
        ipAddress: '41.203.72.10',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
    }

    if (room102) {
      auditEntries.push({
        userId: adminUser.userId,
        action: 'ROOM_STATUS_CHANGED',
        entityType: 'Room',
        entityId: room102.roomId,
        oldData: { operationalStatus: 'Available' },
        newData: { operationalStatus: room102.operationalStatus },
        ipAddress: '154.160.22.5',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      });
    }

    auditEntries.push({
      userId: adminUser.userId,
      action: 'RATE_UPDATED',
      entityType: 'RoomType',
      entityId: roomTypesByProperty[p1.propertyId]?.[0]?.roomTypeId ?? null,
      oldData: { basePrice: '800.00' },
      newData: { basePrice: '850.00' },
      ipAddress: '154.160.22.5',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    });

    if (sampleReservationsForAudit.length > 1) {
      auditEntries.push({
        userId: receptionUser.userId,
        action: 'RESERVATION_CANCELLED',
        entityType: 'Reservation',
        entityId: sampleReservationsForAudit[1].reservationId,
        oldData: { status: 'Pending' },
        newData: { status: 'Cancelled' },
        ipAddress: '41.203.72.10',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      });
    }

    await prisma.auditLog.createMany({ data: auditEntries });
  }
  console.log('✅ Audit Logs created.\n');

  console.log('\n✅ DATABASE SEEDED SUCCESSFULLY!');
  console.log('---------------------------------------------------');
  console.log('🔑 LOGIN CREDENTIALS (Password for ALL users): manager123');
  console.log('   Admins:        kwame_admin, yaw_admin, iddrisu_admin');
  console.log('   Managers:      ama_manager, nana_manager, rita_manager');
  console.log('   Receptionists: kofi_reception, esi_reception');
  console.log('   Housekeeping:  efua_housekeeping');
  console.log('   Accountant:    akosua_accountant');
  console.log('---------------------------------------------------');
  console.log('📊 DATA SUMMARY:');
  console.log(`   - ${properties.length} Properties (Accra, Ashaiman, Kumasi, Takoradi, Tamale, Tema)`);
  console.log('   - Rooms scaled per property with mixed operational/housekeeping statuses');
  console.log('   - 5 Platform Guests, 7 Property Guests');
  console.log(`   - ${reservationCount} Reservations across Pending / Confirmed / CheckedIn / CheckedOut / Cancelled / NoShow`);
  console.log(`   - ${paymentCount} Payments, including multi-payment partial settlements`);
  console.log('   - Sample Audit Log entries');
  console.log('---------------------------------------------------\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
  
  })
  .finally(async () => {
    await prisma.$disconnect();
  });