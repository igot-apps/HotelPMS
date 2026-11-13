import { Router } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/utils/prisma';
import { checkMoolreSmsStatus, isMoolreSmsConfigured, MoolreSmsError } from './moolre-sms.service';

const router = Router();
router.use(authenticate, requirePermission('CanViewRooms'));

router.get('/', async (req: AuthRequest, res) => {
  try {
    const propertyId = req.user!.propertyId;
    const [property, messages] = await Promise.all([
      prisma.property.findUnique({ where: { propertyId }, select: { smsSimulationEnabled: true } }),
      prisma.simulatedSms.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    return res.json({ success: true, data: {
      enabled: property?.smsSimulationEnabled || false,
      mode: isMoolreSmsConfigured() ? 'live' : 'simulation',
      messages,
    } });
  } catch { return res.status(500).json({ success: false, message: 'Could not load messages.' }); }
});

router.post('/:messageId/status', async (req: AuthRequest, res) => {
  const messageId = Number(req.params.messageId);
  if (!Number.isInteger(messageId) || messageId <= 0) return res.status(400).json({ success: false, message: 'Choose a valid message.' });
  try {
    const message = await prisma.simulatedSms.findFirst({ where: { messageId, propertyId: req.user!.propertyId } });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found.' });
    if (message.provider !== 'moolre' || !message.providerReference) {
      return res.status(400).json({ success: false, message: 'Delivery status is available only for messages sent through Moolre.' });
    }
    const status = await checkMoolreSmsStatus(message.providerReference);
    const updated = await prisma.simulatedSms.update({ where: { messageId }, data: {
      providerDeliveryStatus: status.deliveryStatus,
      providerCode: status.providerCode || message.providerCode,
      statusCheckedAt: new Date(),
    } });
    return res.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof MoolreSmsError && error.ambiguous
      ? 'Delivery status is temporarily uncertain. Try again before resending.'
      : 'Could not check delivery status.';
    return res.status(502).json({ success: false, message });
  }
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
