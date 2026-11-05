import { Router } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/utils/prisma';

const router = Router();
router.use(authenticate, requirePermission('CanViewRooms'));

router.get('/', async (req: AuthRequest, res) => {
  try {
    const propertyId = req.user!.propertyId;
    const [property, messages] = await Promise.all([
      prisma.property.findUnique({ where: { propertyId }, select: { smsSimulationEnabled: true } }),
      prisma.simulatedSms.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return res.json({ success: true, data: { enabled: property?.smsSimulationEnabled || false, messages } });
  } catch { return res.status(500).json({ success: false, message: 'Could not load messages.' }); }
});

router.patch('/settings', requirePermission('CanManageStaffAndRoles'), async (req: AuthRequest, res) => {
  if (typeof req.body?.enabled !== 'boolean') return res.status(400).json({ success: false, message: 'Choose on or off.' });
  try {
    const manager = await prisma.user.findUnique({ where: { userId: req.user!.userId }, select: { role: { select: { roleName: true } } } });
    if (manager?.role.roleName !== 'Manager') return res.status(403).json({ success: false, message: 'Only a manager can change this setting.' });
    const propertyId = req.user!.propertyId;
    const property = await prisma.$transaction(async tx => {
      const before = await tx.property.findUniqueOrThrow({ where: { propertyId }, select: { smsSimulationEnabled: true } });
      const updated = await tx.property.update({ where: { propertyId }, data: { smsSimulationEnabled: req.body.enabled }, select: { smsSimulationEnabled: true } });
      if (before.smsSimulationEnabled !== req.body.enabled) await tx.auditLog.create({ data: { userId: req.user!.userId, entityType: 'Property', action: 'SmsSimulationSettingChanged', oldData: { propertyId, enabled: before.smsSimulationEnabled }, newData: { propertyId, enabled: req.body.enabled } } });
      return updated;
    });
    return res.json({ success: true, data: { enabled: property.smsSimulationEnabled } });
  } catch { return res.status(500).json({ success: false, message: 'Could not update the setting.' }); }
});

export default router;
