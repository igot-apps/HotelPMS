import { Router, Response } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { authenticate, AuthRequest } from '../../shared/middleware/auth.middleware';

const router = Router();
const prisma = new PrismaClient();

// 1. Get all amenities
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId ? Number(req.user.propertyId) : undefined;
    if (!propertyId) return res.status(400).json({ success: false, message: 'No property found' });

    const amenities = await prisma.amenity.findMany({
      where: { propertyId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { roomTypes: true } } }
    });

    return res.json({ success: true, data: amenities });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Create a new amenity
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId ? Number(req.user.propertyId) : undefined;
    const { name, icon } = req.body;

    if (!propertyId || !name) {
      return res.status(400).json({ success: false, message: 'Property ID and Name are required' });
    }

    const newAmenity = await prisma.amenity.upsert({
      where: { propertyId_name: { propertyId, name: name.trim() } },
      update: {},
      create: { name: name.trim(), icon: icon || null, propertyId }
    });

    return res.json({ success: true, data: newAmenity });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 3. UPDATE an existing amenity
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId ? Number(req.user.propertyId) : undefined;
    const amenityId = Number(req.params.id);
    const { name, icon } = req.body;

    if (!propertyId || isNaN(amenityId)) return res.status(400).json({ success: false, message: 'Invalid ID' });

    const existing = await prisma.amenity.findFirst({ where: { amenityId, propertyId } });
    if (!existing) return res.status(404).json({ success: false, message: 'Amenity not found' });

    const updated = await prisma.amenity.update({
      where: { amenityId },
      data: { name: name.trim(), icon: icon || null },
    });

    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

// 🌟 4. DELETE an amenity (WITH BULLETPROOF DEBUG LOGS)
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId ? Number(req.user.propertyId) : undefined;
    const amenityId = Number(req.params.id);

    // 🚨 THIS LOG WILL TELL US EXACTLY WHAT IS WRONG (Removed 'type' to fix TS error)
    console.log('🔍 DELETE DEBUG:', { 
      rawParam: req.params.id, 
      parsedAmenityId: amenityId, 
      propertyIdFromToken: propertyId
    });

    if (!propertyId || isNaN(amenityId)) {
      return res.status(400).json({ success: false, message: 'Invalid property or amenity ID' });
    }

    // Security check
    const existing = await prisma.amenity.findFirst({ 
      where: { amenityId, propertyId } 
    });

    if (!existing) {
      // Fetch all amenities for this property to see what's actually in the DB
      const allAmenities = await prisma.amenity.findMany({ 
        where: { propertyId },
        select: { amenityId: true, name: true }
      });
      
      console.log('❌ NOT FOUND. Available amenities for this property:', allAmenities);
      return res.status(404).json({ success: false, message: `Amenity not found. Looking for ID: ${amenityId}` });
    }

    await prisma.amenity.delete({ where: { amenityId } });

    return res.json({ success: true, message: 'Amenity deleted successfully' });
  } catch (error: any) {
    console.error('❌ DELETE ERROR:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

export default router;