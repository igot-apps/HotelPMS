import { Router } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/utils/prisma';

const router = Router();
router.use(authenticate, requirePermission('CanManageHousekeeping'));

router.get('/rooms', async (req: AuthRequest, res) => {
  try {
    const propertyId = req.user!.propertyId;
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { housekeepingEnabled: true } });
    if (!property?.housekeepingEnabled) return res.status(403).json({ success: false, message: 'Housekeeping is off for this property.' });
    const rooms = await prisma.room.findMany({ where: { propertyId }, orderBy: { roomNumber: 'asc' }, select: {
      roomId: true, roomNumber: true, floor: true, operationalStatus: true, housekeepingStatus: true,
      roomType: { select: { typeName: true } },
    } });
    return res.json({ success: true, data: rooms });
  } catch { return res.status(500).json({ success: false, message: 'Could not load rooms. Please try again.' }); }
});

router.patch('/rooms/:id', async (req: AuthRequest, res) => {
  const propertyId = req.user!.propertyId;
  const roomId = Number(req.params.id);
  const status = req.body?.status;
  if (!Number.isSafeInteger(roomId) || roomId < 1 || !['Clean', 'Dirty'].includes(status)) return res.status(400).json({ success: false, message: 'Choose a valid room and status.' });
  try {
    const updated = await prisma.$transaction(async tx => {
      const property = await tx.property.findUnique({ where: { propertyId }, select: { housekeepingEnabled: true } });
      if (!property?.housekeepingEnabled) throw new Error('Housekeeping is off for this property.');
      const room = await tx.room.findFirst({ where: { roomId, propertyId }, select: { roomId: true, roomNumber: true, operationalStatus: true, housekeepingStatus: true } });
      if (!room) throw new Error('Room not found.');
      if (room.operationalStatus === 'Maintenance') throw new Error('Return this room from maintenance before changing its cleaning status.');
      if (room.operationalStatus === 'Occupied') throw new Error('This room is occupied. Ask the front desk to check the guest out first.');
      if (room.housekeepingStatus === status) return room;
      const changed = await tx.room.updateMany({ where: { roomId, propertyId, operationalStatus: 'Available', housekeepingStatus: room.housekeepingStatus }, data: { housekeepingStatus: status } });
      if (!changed.count) throw new Error('Room status changed. Refresh the list and try again.');
      await tx.auditLog.create({ data: { userId: req.user!.userId, entityType: 'Room', action: 'HousekeepingStatusChanged', oldData: { roomId, status: room.housekeepingStatus }, newData: { roomId, propertyId, status } } });
      return tx.room.findUnique({ where: { roomId } });
    });
    return res.json({ success: true, data: updated });
  } catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

export default router;
