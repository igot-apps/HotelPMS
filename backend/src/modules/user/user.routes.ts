// backend/src/modules/user/user.routes.ts
import { Router } from 'express';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { PERMISSIONS } from '../../shared/constants/permissions';
import * as userController from './user.controller';
import * as invitations from './invitation.service';
import { setCorrectionPermissions } from '../reservation/correction-approval.service';

const router = Router();
const setupAttempts = new Map<string, { count: number; resetAt: number }>();
const delegationAttempts = new Map<number, { count: number; resetAt: number }>();

router.post('/accept-invitation', async (req, res) => {
  const now = Date.now();
  for (const [key, value] of setupAttempts) if (value.resetAt <= now) setupAttempts.delete(key);
  const key = req.ip || 'unknown';
  const attempts = setupAttempts.get(key) || { count: 0, resetAt: now + 60_000 };
  attempts.count += 1;
  setupAttempts.set(key, attempts);
  if (attempts.count > 20) return res.status(429).json({ success: false, message: 'Too many attempts. Try again in a minute.' });
  try {
    await invitations.acceptInvitation(req.body?.token, req.body?.password);
    return res.json({ success: true, message: 'Password set. You can now sign in.' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// All routes require authentication and the Manage Staff permission
router.use(authenticate);
router.use(authorize(PERMISSIONS.CAN_MANAGE_STAFF_AND_ROLES));

router.post('/invitations', async (req: import('../../shared/middleware/auth.middleware').AuthRequest, res) => {
  try {
    return res.status(201).json({ success: true, data: await invitations.inviteStaff(req.user!.propertyId!, req.body) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.code === 'P2002' ? 'Username or email already exists.' : error.message });
  }
});
router.post('/:id/resend-invitation', async (req: import('../../shared/middleware/auth.middleware').AuthRequest, res) => {
  try {
    return res.json({ success: true, data: await invitations.resendInvitation(req.user!.propertyId!, Number(req.params.id)) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

// 🚨 GET ROLES MUST BE BEFORE /:id
router.get('/roles', userController.getRoles);
router.put('/:id/correction-permissions', async (req: import('../../shared/middleware/auth.middleware').AuthRequest, res) => {
  if (req.body.confirmDelegation === true || req.body.managerPassword) {
    const now = Date.now();
    for (const [key, value] of delegationAttempts) if (value.resetAt <= now) delegationAttempts.delete(key);
    const attempts = delegationAttempts.get(req.user!.userId) || { count: 0, resetAt: now + 300_000 };
    attempts.count++;
    delegationAttempts.set(req.user!.userId, attempts);
    if (attempts.count > 10) return res.status(429).json({ success: false, message: 'Too many financial delegation confirmations. Try again in five minutes.' });
  }
  try { return res.json({ success: true, data: await setCorrectionPermissions({ userId: req.user!.userId, propertyId: req.user!.propertyId }, Number(req.params.id), req.body.permissions, req.body.financialDelegation, req.body.managerPassword, req.body.confirmDelegation) }); }
  catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

router.get('/', userController.getUsers);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deactivateUser);

export default router;
