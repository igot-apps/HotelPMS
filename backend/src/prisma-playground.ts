import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function checkGpsFields() {
  try {
    // Fetch just one property to inspect its structure
    const property = await prisma.property.findFirst();
    
    if (property) {
      console.log('\n--- PROPERTY GPS CHECK ---');
      console.log('Has latitude field:', 'latitude' in property);
      console.log('Has longitude field:', 'longitude' in property);
      console.log('Current Property Data:', property);
      console.log('--------------------------\n');
    } else {
      console.log('No properties found in the database.');
    }
  } catch (error) {
    console.error('Error checking fields:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkGpsFields();