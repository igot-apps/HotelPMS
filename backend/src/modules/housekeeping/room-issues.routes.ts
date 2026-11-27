import { Router } from 'express';
import { authenticate, requirePermission, AuthRequest } from '../../shared/middleware/auth.middleware';
import { listOpenIssues, resolveIssue } from './housekeeping-work.service';

// Reception and managers: issues reported in rooms (usually by housekeeping).
const router = Router();
router.use(authenticate, requirePermission('CanViewRooms'));

router.get('/', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await listOpenIssues(req.user!.propertyId) }); }
  catch { return res.status(500).json({ success: false, message: 'Could not load room issues.' }); }
});

router.post('/:id/resolve', requirePermission('CanUpdateRoomStatus'), async (req: AuthRequest, res) => {
  const issueId = Number(req.params.id);
  if (!Number.isSafeInteger(issueId) || issueId < 1) return res.status(400).json({ success: false, message: 'Choose a valid issue.' });
  try { return res.json({ success: true, data: await resolveIssue({ userId: req.user!.userId, propertyId: req.user!.propertyId }, issueId, req.body?.note) }); }
  catch (error: any) { return res.status(error?.statusCode || 500).json({ success: false, message: error?.statusCode ? error.message : 'Could not resolve the issue.' }); }
});

export default router;
