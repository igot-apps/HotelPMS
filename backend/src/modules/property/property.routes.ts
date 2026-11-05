import { Router } from 'express';
import {
  createProperty,
  getProperties,
  getPropertyById,
  getAllActiveProperties, // ✅ CHANGED: Replaced getPropertiesByTenant
  getPropertyStats,
  updateProperty,
  deleteProperty,
} from './property.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { requirePermission } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/utils/prisma';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Property routes
router.post('/', createProperty);
router.get('/', getProperties);

// ✅ CHANGED: Replaced /tenant/:id with /active
router.get('/active', getAllActiveProperties); 

router.patch('/housekeeping', requirePermission('CanManageStaffAndRoles'), async (req: import('../../shared/middleware/auth.middleware').AuthRequest, res) => {
  if (typeof req.body?.enabled !== 'boolean' || !req.user?.propertyId) return res.status(400).json({ success: false, message: 'Choose whether Housekeeping is on or off.' });
  try {
    const manager = await prisma.user.findUnique({ where: { userId: req.user.userId }, select: { role: { select: { roleName: true } } } });
    if (manager?.role.roleName !== 'Manager') return res.status(403).json({ success: false, message: 'Only a manager can change this setting.' });
    const property = await prisma.$transaction(async tx => {
      const old = await tx.property.findUnique({ where: { propertyId: req.user!.propertyId }, select: { housekeepingEnabled: true } });
      const updated = await tx.property.update({ where: { propertyId: req.user!.propertyId }, data: { housekeepingEnabled: req.body.enabled }, select: { housekeepingEnabled: true } });
      if (old?.housekeepingEnabled !== req.body.enabled) await tx.auditLog.create({ data: { userId: req.user!.userId, entityType: 'Property', action: 'HousekeepingSettingChanged', oldData: { propertyId: req.user!.propertyId, enabled: old?.housekeepingEnabled }, newData: { propertyId: req.user!.propertyId, enabled: req.body.enabled } } });
      return updated;
    });
    return res.json({ success: true, data: property });
  } catch { return res.status(500).json({ success: false, message: 'Could not update Housekeeping. Please try again.' }); }
});

router.get('/:id', getPropertyById);
router.get('/:id/stats', getPropertyStats);
router.put('/:id', updateProperty);
router.delete('/:id', deleteProperty);

export default router;
