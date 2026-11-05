import { Router } from 'express';
import {  refreshToken, login, getMe, logout, registerHotel } from './auth.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { requestStaffPasswordReset, resetStaffPassword } from './password-reset.service';

const router = Router();
const resetAttempts = new Map<string, { count: number; resetAt: number }>();
const limitReset = (ip: string, limit: number) => {
  const now = Date.now();
  for (const [key, value] of resetAttempts) if (value.resetAt <= now) resetAttempts.delete(key);
  const key = `${ip}:${limit}`;
  const current = resetAttempts.get(key) || { count: 0, resetAt: now + 60_000 };
  current.count += 1;
  resetAttempts.set(key, current);
  return current.count <= limit;
};

router.post('/forgot-password', async (req, res) => {
  if (!limitReset(req.ip || 'unknown', 5)) return res.status(429).json({ success: false, message: 'Too many requests. Try again in a minute.' });
  try {
    await requestStaffPasswordReset(req.body?.email);
    return res.json({ success: true, message: 'If an active hotel staff account uses this email, a reset link will be sent.' });
  } catch (error) {
    if (error instanceof Error && error.message === 'Enter a valid email address.') return res.status(400).json({ success: false, message: error.message });
    console.error('Staff password reset request failed', error);
    return res.status(503).json({ success: false, message: 'Could not process the request. Please try again later.' });
  }
});

router.post('/reset-password', async (req, res) => {
  if (!limitReset(req.ip || 'unknown', 20)) return res.status(429).json({ success: false, message: 'Too many attempts. Try again in a minute.' });
  try {
    await resetStaffPassword(req.body?.token, req.body?.password);
    return res.json({ success: true, message: 'Password updated. Sign in with your new password.' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'Could not reset password.' });
  }
});


 // 🌟 PUBLIC ROUTES (No authentication required)
router.post('/login', login);
router.post('/refresh-token', refreshToken);

// ✅ NEW: Public Hotel Registration (B2B SaaS Onboarding)
router.post('/register-hotel', registerHotel); 



 router.post('/login', login);
 router.post('/refresh-token', refreshToken);
 router.post('/logout', authenticate, logout);
 router.get('/me', authenticate, getMe);


export default router;
