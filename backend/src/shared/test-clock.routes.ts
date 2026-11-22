// TEST ONLY: read and move the server's test clock. See shared/utils/test-clock.ts.
import { Router, Request, Response } from 'express';
import { authenticate } from './middleware/auth.middleware';
import { getTestClockOffset, realNow, setTestClockOffset, testClockEnabled } from './utils/test-clock';
import { expireOnlineHolds } from '../modules/reservation/online-hold.service';
import { expireUnarrivedStays } from '../modules/reservation/recovery.service';

const router = Router();

const state = () => ({ enabled: testClockEnabled, offsetMs: getTestClockOffset(), now: new Date().toISOString() });

router.get('/', (_req: Request, res: Response) => { res.json(state()); });

router.post('/', authenticate, async (req: Request, res: Response) => {
  if (!testClockEnabled) return res.status(404).json({ success: false, message: 'Route not found' });
  const { to, addMs, reset } = req.body ?? {};
  let offset = getTestClockOffset();
  if (reset) offset = 0;
  else if (typeof to === 'string' && Number.isFinite(Date.parse(to))) offset = Date.parse(to) - realNow();
  else if (Number.isFinite(addMs)) offset += Number(addMs);
  else return res.status(400).json({ success: false, message: 'Send { to }, { addMs } or { reset: true }.' });
  setTestClockOffset(offset);
  // Run the time-based jobs straight away so the new date takes effect now.
  await expireOnlineHolds().catch(() => undefined);
  await expireUnarrivedStays().catch(error => console.error('Test clock: could not expire stays', error));
  return res.json(state());
});

export default router;
