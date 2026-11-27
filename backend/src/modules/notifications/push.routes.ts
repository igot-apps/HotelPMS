import { Router, Response } from 'express';
import { authenticate, AuthRequest } from '../../shared/middleware/auth.middleware';
import { notifyUser, pushPublicKey, removeSubscription, saveSubscription } from './push.service';
import { getAlertPreferences, setAlertPreference } from './housekeeping-alerts';

const router = Router();
router.use(authenticate);

const fail = (res: Response, error: any) => res.status(error?.statusCode || 500).json({ success: false, message: error?.statusCode ? error.message : 'Could not update notifications.' });

// Public VAPID key the browser needs to subscribe; null when push is not set up on the server.
router.get('/public-key', (_req, res) => res.json({ success: true, data: { publicKey: pushPublicKey() } }));

router.post('/subscribe', async (req: AuthRequest, res: Response) => {
  try {
    await saveSubscription(req.user!.userId, req.body?.subscription, req.get('user-agent'));
    return res.json({ success: true });
  } catch (error) { return fail(res, error); }
});

router.post('/unsubscribe', async (req: AuthRequest, res: Response) => {
  try {
    await removeSubscription(req.user!.userId, req.body?.endpoint);
    return res.json({ success: true });
  } catch (error) { return fail(res, error); }
});

router.post('/test', async (req: AuthRequest, res: Response) => {
  try {
    const sent = await notifyUser(req.user!.userId, { title: 'HideOut24', body: 'Notifications are working on this device.', url: '/profile', tag: 'test' });
    return res.json({ success: true, data: { sent } });
  } catch (error) { return fail(res, error); }
});

// Which notifications this person receives (only housekeepers have choices for now).
router.get('/preferences', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await getAlertPreferences(req.user!.userId) }); } catch (error) { return fail(res, error); }
});

router.patch('/preferences', async (req: AuthRequest, res: Response) => {
  try { return res.json({ success: true, data: await setAlertPreference(req.user!.userId, req.body?.key, req.body?.enabled) }); } catch (error) { return fail(res, error); }
});

export default router;
