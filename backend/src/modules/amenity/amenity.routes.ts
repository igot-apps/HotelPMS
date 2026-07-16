import { Router, Response } from 'express'; // 🌟 Removed unused 'Request'
import { PrismaClient } from '../../generated/prisma';
import { authenticate, AuthRequest } from '../../shared/middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// 1. Get all amenities for the logged-in hotel
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(400).json({ success: false, message: 'No property found' });

    const amenities = await prisma.amenity.findMany({
      where: { propertyId },
      orderBy: { name: 'asc' }
    });

    return res.json({ success: true, data: amenities }); // 🌟 Added 'return'
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message }); // 🌟 Added 'return'
  }
});

// 2. 🌟 INLINE CREATE: Create a new amenity on the fly
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId;
    const { name, icon } = req.body;

    if (!propertyId || !name) {
      return res.status(400).json({ success: false, message: 'Property ID and Name are required' });
    }

    // Upsert ensures we don't crash if it somehow already exists, but creates it if it doesn't
    const newAmenity = await prisma.amenity.upsert({
      where: {
        propertyId_name: { propertyId, name: name.trim() }
      },
      update: {}, // Do nothing if it exists
      create: {
        name: name.trim(),
        icon: icon || null,
        propertyId
      }
    });

    return res.json({ success: true, data: newAmenity }); // 🌟 Added 'return'
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message }); // 🌟 Added 'return'
  }
});

export default router;