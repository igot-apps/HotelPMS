require('dotenv').config({ quiet: true });
const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcryptjs');
const fs = require('node:fs/promises');
const path = require('node:path');

const locations = [
  ['Osu', 'Accra', 'Greater Accra'], ['Adum', 'Kumasi', 'Ashanti'],
  ['Cape Coast', 'Cape Coast', 'Central'], ['Koforidua', 'Koforidua', 'Eastern'],
  ['Takoradi', 'Takoradi', 'Western'], ['Tamale', 'Tamale', 'Northern'],
  ['Ho', 'Ho', 'Volta'], ['Bolgatanga', 'Bolgatanga', 'Upper East'],
  ['Wa', 'Wa', 'Upper West'], ['Sunyani', 'Sunyani', 'Bono'],
  ['Techiman', 'Techiman', 'Bono East'],
];

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const url = new URL(process.env.DATABASE_URL);
    console.log(`Target: ${url.hostname}${url.pathname} (${apply ? 'APPLY' : 'PREVIEW — no writes'})`);
    if (apply && process.env.DEMO_SEED_CONFIRM_HOST !== url.hostname) {
      throw new Error('Set DEMO_SEED_CONFIRM_HOST to the exact database hostname printed above.');
    }
    if (apply && (!process.env.DEMO_SEED_PASSWORD || process.env.DEMO_SEED_PASSWORD.length < 8)) {
      throw new Error('Set DEMO_SEED_PASSWORD (at least 8 characters).');
    }
    // Load every image before writing anything, so missing deployment assets fail early.
    const galleries = await Promise.all(locations.map(async (_, index) => Promise.all([1, 2, 3, 4].map(async slot => {
      const name = `hotel-${String(index + 1).padStart(2, '0')}-${slot}.jpg`;
      const bytes = await fs.readFile(path.join(__dirname, 'demo-assets', name));
      if (bytes.length > 350 * 1024) throw new Error(`${name} exceeds the image limit.`);
      return `data:image/jpeg;base64,${bytes.toString('base64')}`;
    }))));
    const passwordHash = apply ? await bcrypt.hash(process.env.DEMO_SEED_PASSWORD, 10) : null;
    let created = 0, skipped = 0;
    for (const [index, [area, city, region]] of locations.entries()) {
      const suffix = String(index + 1).padStart(2, '0');
      const propertyCode = `demo-hotel-${suffix}`;
      if (await prisma.property.findUnique({ where: { propertyCode }, select: { propertyId: true } })) {
        console.log(`SKIP ${propertyCode}: already exists; preserved unchanged.`); skipped++; continue;
      }
      if (!apply) { console.log(`WOULD ADD Demo Hotel ${suffix}: ${city}, 3 rooms, 4 photos, 2 staff.`); continue; }
      await prisma.$transaction(async tx => {
        const role = await tx.role.upsert({ where: { roleName: 'Manager' }, update: {}, create: { roleName: 'Manager', isSystem: true } });
        const reception = await tx.role.upsert({ where: { roleName: 'Receptionist' }, update: {}, create: { roleName: 'Receptionist', isSystem: true } });
        const propertyName = `Demo Hotel ${suffix}`;
        const hotel = await tx.property.create({ data: {
          propertyCode, propertyName, businessName: propertyName, propertyType: 'Hotel',
          area, city, region, country: 'Ghana', currency: 'GHS', timezone: 'Africa/Accra', totalRooms: 3,
          address: 'Demo property — not a real hotel.',
          publicDescription: 'Demo hotel for testing Stayfolio. Photos and prices are sample data. Do not make real payments.',
          coverImage: galleries[index][0], galleryImages: galleries[index],
          isOnlineBookingEnabled: true, subscriptionStatus: 'Trial',
          trialEndsAt: new Date(Date.now() + 30 * 86400000),
        } });
        for (const [prefix, roleId] of [['manager', role.roleId], ['receptionist', reception.roleId]]) {
          await tx.user.create({ data: {
            propertyId: hotel.propertyId, fullName: `${propertyName} ${prefix}`,
            username: `${prefix}_hotel${suffix}`, email: `${prefix}.hotel${suffix}@demo.stayfolio.test`,
            passwordHash, roleId,
          } });
        }
        const standard = await tx.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Standard', basePrice: 200, maxOccupancy: 2 } });
        const family = await tx.roomType.create({ data: { propertyId: hotel.propertyId, typeName: 'Family Room', basePrice: 400, maxOccupancy: 5 } });
        await tx.room.createMany({ data: [
          { propertyId: hotel.propertyId, roomNumber: '101', roomTypeId: standard.roomTypeId, floor: 1 },
          { propertyId: hotel.propertyId, roomNumber: '102', roomTypeId: standard.roomTypeId, floor: 1 },
          { propertyId: hotel.propertyId, roomNumber: '201', roomTypeId: family.roomTypeId, floor: 2 },
        ] });
      }, { timeout: 30000 });
      created++; console.log(`ADDED ${propertyCode}`);
    }
    console.log(`Complete. Added: ${created}. Existing preserved: ${skipped}.`);
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
