import 'dotenv/config';
import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma';

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD;
const DEMO_GUEST_PHONE = '0000000000';
const DEMO_GUEST_EMAIL = 'guest@demo.stayfolio.test';
const DEMO_PAYSTACK_KEY = process.env.DEMO_PAYSTACK_TEST_KEY?.trim();
const ASSET_DIR = path.join(__dirname, 'demo-assets');

const demoHotels = [
  { region: 'Greater Accra', city: 'Accra', area: 'Osu' },
  { region: 'Ashanti', city: 'Kumasi', area: 'Adum' },
  { region: 'Central', city: 'Cape Coast', area: 'Cape Coast' },
  { region: 'Eastern', city: 'Koforidua', area: 'Koforidua' },
  { region: 'Western', city: 'Takoradi', area: 'Takoradi' },
  { region: 'Northern', city: 'Tamale', area: 'Tamale' },
  { region: 'Volta', city: 'Ho', area: 'Ho' },
  { region: 'Upper East', city: 'Bolgatanga', area: 'Bolgatanga' },
  { region: 'Upper West', city: 'Wa', area: 'Wa' },
  { region: 'Bono', city: 'Sunyani', area: 'Sunyani' },
  { region: 'Bono East', city: 'Techiman', area: 'Techiman' },
];

const permissions = [
  { code: 'CanCreateReservation', name: 'Create Reservation', category: 'Reservations' },
  { code: 'CanCancelReservation', name: 'Cancel Reservation', category: 'Reservations' },
  { code: 'CanCheckInGuest', name: 'Check In Guest', category: 'Reservations' },
  { code: 'CanCheckOutGuest', name: 'Check Out Guest', category: 'Reservations' },
  { code: 'CanViewRooms', name: 'View Rooms', category: 'Inventory' },
  { code: 'CanCreateRoom', name: 'Create Room', category: 'Inventory' },
  { code: 'CanUpdateRoom', name: 'Update Room', category: 'Inventory' },
  { code: 'CanDeleteRoom', name: 'Delete Room', category: 'Inventory' },
  { code: 'CanCreateRoomType', name: 'Create Room Type', category: 'Inventory' },
  { code: 'CanUpdateRoomType', name: 'Update Room Type', category: 'Inventory' },
  { code: 'CanDeleteRoomType', name: 'Delete Room Type', category: 'Inventory' },
  { code: 'CanUpdateRoomStatus', name: 'Update Room Status', category: 'Inventory' },
  { code: 'CanManageRates', name: 'Manage Rates', category: 'Inventory' },
  { code: 'CanProcessPayments', name: 'Process Payments', category: 'Billing' },
  { code: 'CanIssueRefunds', name: 'Issue Refunds', category: 'Billing' },
  { code: 'CanViewFinancialReports', name: 'View Financial Reports', category: 'Reports' },
  { code: 'CanManageBilling', name: 'Manage Billing', category: 'Billing' },
  { code: 'CanManageHousekeeping', name: 'Manage Housekeeping', category: 'Operations' },
  { code: 'CanManageMaintenance', name: 'Manage Maintenance', category: 'Operations' },
  { code: 'CanManageStaffAndRoles', name: 'Manage Staff & Roles', category: 'Admin' },
];

function assertLocalDemoConfiguration() {
  if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
    throw new Error('Set DEMO_SEED_PASSWORD to a password with at least 8 characters before running this local demo seed.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('This demo seed is disabled when NODE_ENV=production.');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is missing.');
  const hostname = new URL(databaseUrl).hostname.toLowerCase();
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);
  if (!localHosts.has(hostname)) {
    throw new Error(`Refusing to seed non-local database host "${hostname}". Use your local PostgreSQL database only.`);
  }
  if (DEMO_PAYSTACK_KEY && !DEMO_PAYSTACK_KEY.startsWith('sk_test_')) {
    throw new Error('DEMO_PAYSTACK_TEST_KEY must be a Paystack test secret key (sk_test_...).');
  }
}

async function imageDataUri(index: number, slot: number) {
  const filename = path.join(ASSET_DIR, `hotel-${String(index).padStart(2, '0')}-${slot}.jpg`);
  const image = await fs.readFile(filename);
  if (image.byteLength > 350 * 1024) {
    throw new Error(`${path.basename(filename)} is larger than the app's 350 KB image limit.`);
  }
  return `data:image/jpeg;base64,${image.toString('base64')}`;
}

async function upsertRole(roleName: string, description: string) {
  return prisma.role.upsert({
    where: { roleName },
    update: {},
    create: { roleName, description, isSystem: true },
  });
}

async function main() {
  assertLocalDemoConfiguration();

  const [managerRole, receptionistRole] = await Promise.all([
    upsertRole('Manager', 'Property management access'),
    upsertRole('Receptionist', 'Front desk operations'),
  ]);

  const permissionRows = await Promise.all(permissions.map((permission) =>
    prisma.permission.upsert({ where: { code: permission.code }, update: {}, create: permission }),
  ));
  const managerPermissionRows = permissionRows.filter(({ code }) => code !== 'CanManageStaffAndRoles');
  const receptionistCodes = new Set([
    'CanCreateReservation', 'CanCancelReservation', 'CanCheckInGuest',
    'CanCheckOutGuest', 'CanViewRooms', 'CanUpdateRoomStatus', 'CanProcessPayments',
  ]);
  const receptionistPermissionRows = permissionRows.filter(({ code }) => receptionistCodes.has(code));

  await prisma.rolePermission.createMany({
    data: managerPermissionRows.map(({ permissionId }) => ({ roleId: managerRole.roleId, permissionId })),
    skipDuplicates: true,
  });
  await prisma.rolePermission.createMany({
    data: receptionistPermissionRows.map(({ permissionId }) => ({ roleId: receptionistRole.roleId, permissionId })),
    skipDuplicates: true,
  });

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD!, 10);
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 14);

  for (let index = 1; index <= demoHotels.length; index += 1) {
    const location = demoHotels[index - 1];
    const suffix = String(index).padStart(2, '0');
    const propertyCode = `demo-hotel-${suffix}`;
    const propertyName = `Demo Hotel ${suffix}`;
    const managerEmail = `manager.hotel${suffix}@demo.stayfolio.test`;
    const receptionistEmail = `receptionist.hotel${suffix}@demo.stayfolio.test`;
    const galleryImages = await Promise.all([1, 2, 3].map((slot) => imageDataUri(index, slot)));
    // Intentionally invalid demo-only contact: shows the WhatsApp-only UI without
    // directing guests to a real person's phone number. Replace before launch.
    const demoWhatsAppPhone = `00000000${String(index).padStart(2, '0')}`;

    const property = await prisma.property.upsert({
      where: { propertyCode },
      update: {
        propertyName,
        businessName: propertyName,
        propertyType: 'Hotel',
        address: 'Demo listing — replace with the hotel’s real address before launch.',
        area: location.area,
        city: location.city,
        region: location.region,
        country: 'Ghana',
        totalRooms: 3,
        checkInTime: '14:00',
        checkOutTime: '11:00',
        subscriptionPlan: 'Starter',
        subscriptionStatus: 'Trial',
        trialEndsAt,
        isActive: true,
        coverImage: galleryImages[0],
        galleryImages,
        primaryPhone: demoWhatsAppPhone,
        primaryPhoneWhatsappOnly: true,
        publicDescription: 'A Stayfolio demo listing for local testing. The displayed WhatsApp contact is a placeholder. Update the property details and contact information before using with real guests.',
        // Preserve the manager's current public-booking choice on reruns. New
        // demo records start enabled below, but seeding must not re-publish a
        // property that a manager has intentionally disabled.
        ...(DEMO_PAYSTACK_KEY ? { paystackSecretKey: DEMO_PAYSTACK_KEY } : {}),
      },
      create: {
        propertyCode,
        propertyName,
        businessName: propertyName,
        propertyType: 'Hotel',
        address: 'Demo listing — replace with the hotel’s real address before launch.',
        area: location.area,
        city: location.city,
        region: location.region,
        country: 'Ghana',
        totalRooms: 3,
        checkInTime: '14:00',
        checkOutTime: '11:00',
        subscriptionPlan: 'Starter',
        subscriptionStatus: 'Trial',
        trialEndsAt,
        coverImage: galleryImages[0],
        galleryImages,
        primaryPhone: demoWhatsAppPhone,
        primaryPhoneWhatsappOnly: true,
        publicDescription: 'A Stayfolio demo listing for local testing. The displayed WhatsApp contact is a placeholder. Update the property details and contact information before using with real guests.',
        isOnlineBookingEnabled: true,
        ...(DEMO_PAYSTACK_KEY ? { paystackSecretKey: DEMO_PAYSTACK_KEY } : {}),
      },
    });

    await Promise.all([
      prisma.user.upsert({
        where: { email: managerEmail },
        update: { propertyId: property.propertyId, fullName: `${propertyName} Manager`, username: `manager_hotel${suffix}`, passwordHash, roleId: managerRole.roleId, isActive: true, isPlatformAdmin: false },
        create: { propertyId: property.propertyId, fullName: `${propertyName} Manager`, username: `manager_hotel${suffix}`, email: managerEmail, passwordHash, roleId: managerRole.roleId, isActive: true, isPlatformAdmin: false },
      }),
      prisma.user.upsert({
        where: { email: receptionistEmail },
        update: { propertyId: property.propertyId, fullName: `${propertyName} Receptionist`, username: `receptionist_hotel${suffix}`, passwordHash, roleId: receptionistRole.roleId, isActive: true, isPlatformAdmin: false },
        create: { propertyId: property.propertyId, fullName: `${propertyName} Receptionist`, username: `receptionist_hotel${suffix}`, email: receptionistEmail, passwordHash, roleId: receptionistRole.roleId, isActive: true, isPlatformAdmin: false },
      }),
    ]);

    const standardType = await prisma.roomType.upsert({
      where: { propertyId_typeName: { propertyId: property.propertyId, typeName: 'Standard' } },
      update: { basePrice: 200, maxOccupancy: 2, isActive: true },
      create: { propertyId: property.propertyId, typeName: 'Standard', description: 'Comfortable room for a relaxing stay.', basePrice: 200, maxOccupancy: 2 },
    });
    const familyType = await prisma.roomType.upsert({
      where: { propertyId_typeName: { propertyId: property.propertyId, typeName: 'Family Room' } },
      update: { basePrice: 400, maxOccupancy: 5, isActive: true },
      create: { propertyId: property.propertyId, typeName: 'Family Room', description: 'Spacious room for families and small groups.', basePrice: 400, maxOccupancy: 5 },
    });

    await Promise.all([
      prisma.room.upsert({ where: { propertyId_roomNumber: { propertyId: property.propertyId, roomNumber: '101' } }, update: { roomTypeId: standardType.roomTypeId, operationalStatus: 'Available', housekeepingStatus: 'Clean' }, create: { propertyId: property.propertyId, roomNumber: '101', floor: 1, roomTypeId: standardType.roomTypeId } }),
      prisma.room.upsert({ where: { propertyId_roomNumber: { propertyId: property.propertyId, roomNumber: '102' } }, update: { roomTypeId: standardType.roomTypeId, operationalStatus: 'Available', housekeepingStatus: 'Clean' }, create: { propertyId: property.propertyId, roomNumber: '102', floor: 1, roomTypeId: standardType.roomTypeId } }),
      prisma.room.upsert({ where: { propertyId_roomNumber: { propertyId: property.propertyId, roomNumber: '201' } }, update: { roomTypeId: familyType.roomTypeId, operationalStatus: 'Available', housekeepingStatus: 'Clean' }, create: { propertyId: property.propertyId, roomNumber: '201', floor: 2, roomTypeId: familyType.roomTypeId } }),
    ]);

    console.log(`Seeded ${propertyName} (${location.city}, ${location.region}) — manager.${suffix} / receptionist.${suffix}`);
  }

  await prisma.platformGuest.upsert({
    where: { phone: DEMO_GUEST_PHONE },
    update: { fullName: 'Stayfolio Demo Guest', email: DEMO_GUEST_EMAIL, passwordHash, isActive: true },
    create: { fullName: 'Stayfolio Demo Guest', phone: DEMO_GUEST_PHONE, email: DEMO_GUEST_EMAIL, passwordHash, isActive: true },
  });

  console.log('Local demo seed complete. Hotel staff sign in at /login. The shared online guest account signs in by phone.');
}

main()
  .catch((error) => {
    console.error('Demo hotel seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
