import { Router } from 'express';
import { prisma } from '../../shared/utils/prisma';
import { authenticate, AuthRequest, requirePermission } from '../../shared/middleware/auth.middleware';
import { amenityDetails, removeAmenity, saveAmenity } from './amenity.service';

const router = Router();
router.use(authenticate);
router.use((req: AuthRequest, res, next) => {
  if (!req.user?.propertyId) return res.status(400).json({ success: false, message: 'No property found.' });
  return next();
});
const errorResponse = (res: any, error: any) => res.status(error.statusCode || (error.code === 'P2002' ? 409 : 500)).json({
  success: false, message: error.statusCode ? error.message : error.code === 'P2002' ? 'An amenity with this name already exists.' : 'Could not save amenity changes. Please try again.',
});
const id = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw Object.assign(new Error('Choose a valid amenity.'), { statusCode: 400 });
  return parsed;
};
router.get('/', async (req: AuthRequest, res) => {
  try {
    const amenities = await prisma.amenity.findMany({ where: { propertyId: req.user!.propertyId }, orderBy: { name: 'asc' }, include: amenityDetails });
    return res.json({ success: true, data: amenities });
  } catch { return res.status(500).json({ success: false, message: 'Could not load amenities. Please try again.' }); }
});
router.post('/', requirePermission('CanCreateRoomType'), async (req: AuthRequest, res) => {
  try {
    const result = await saveAmenity(req.user!.propertyId, req.body);
    return res.status(result.reused ? 200 : 201).json({ success: true, data: result.amenity, reused: result.reused });
  } catch (error) { return errorResponse(res, error); }
});
router.put('/:id', requirePermission('CanUpdateRoomType'), async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: (await saveAmenity(req.user!.propertyId, req.body, id(req.params.id))).amenity }); }
  catch (error) { return errorResponse(res, error); }
});
router.delete('/:id', requirePermission('CanDeleteRoomType'), (req, res, next) => {
  if (req.body?.confirmedRoomTypeIds !== undefined) return requirePermission('CanUpdateRoomType')(req, res, next);
  return next();
}, async (req: AuthRequest, res) => {
  try {
    await removeAmenity(req.user!.propertyId, id(req.params.id), req.body?.confirmedRoomTypeIds);
    return res.json({ success: true, message: 'Amenity deleted.' });
  } catch (error) { return errorResponse(res, error); }
});
export default router;
