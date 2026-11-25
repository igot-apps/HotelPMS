import { Router, Response } from 'express';
import { authenticate, AuthRequest, requirePlatformAdmin } from '../../shared/middleware/auth.middleware';
import { getSubscriptionConfig, saveSubscriptionConfig } from './subscription-access';

// Platform-wide package, pricing, duration, discount and trial settings.
const router = Router();
router.use(authenticate, requirePlatformAdmin);

router.get('/', async (_req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await getSubscriptionConfig() }); }
  catch { return res.status(500).json({ success: false, message: 'Could not load subscription settings.' }); }
});

router.put('/', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await saveSubscriptionConfig(req.body, req.user!.userId) }); }
  catch (error: any) { return res.status(error.statusCode || 400).json({ success: false, message: error.message }); }
});

export default router;
