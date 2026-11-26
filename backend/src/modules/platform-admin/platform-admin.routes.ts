import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest, requirePlatformAdmin } from '../../shared/middleware/auth.middleware';
import * as service from './platform-admin.service';
import { PlatformAdminError } from './platform-admin.service';

// ---------------------------------------------------------------- rate limits (in memory, per instance)
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
/** Returns false once `limit` hits within `windowMs` for this key. */
export function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  buckets.set(key, bucket);
  return bucket.count <= limit;
}
export const resetRateLimits = () => buckets.clear();

const ip = (req: Request) => req.ip || 'unknown';
const tooMany = (res: Response) => res.status(429).json({ success: false, message: 'Too many attempts. Please wait a few minutes and try again.' });

function fail(res: Response, error: unknown, fallback: string) {
  if (error instanceof PlatformAdminError) return res.status(error.status).json({ success: false, message: error.message });
  console.error(fallback, error instanceof Error ? error.message : error);
  return res.status(500).json({ success: false, message: fallback });
}

// ---------------------------------------------------------------- public: /api/auth/platform
export const platformAuthRoutes = Router();

platformAuthRoutes.post('/login', async (req, res) => {
  const identifier = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!hit(`login-ip:${ip(req)}`, 20, 15 * 60_000) || (identifier && !hit(`login-id:${identifier}`, 5, 15 * 60_000))) return tooMany(res);
  try {
    const session = await service.platformLogin(req.body?.email, req.body?.password);
    return res.json({ success: true, data: { accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user } });
  } catch (error) { return fail(res, error, 'Could not sign in.'); }
});

platformAuthRoutes.post('/forgot-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!hit(`forgot-ip:${ip(req)}`, 5, 15 * 60_000) || (email && !hit(`forgot-id:${email}`, 3, 60 * 60_000))) return tooMany(res);
  try {
    await service.requestPasswordReset(req.body?.email);
    return res.json({ success: true, message: 'If an active administrator account uses this email, a reset link will be sent.' });
  } catch (error) {
    if (error instanceof PlatformAdminError && error.status === 400) return res.status(400).json({ success: false, message: error.message });
    console.error('Platform password reset request failed', error instanceof Error ? error.message : error);
    return res.json({ success: true, message: 'If an active administrator account uses this email, a reset link will be sent.' });
  }
});

platformAuthRoutes.post('/reset-password', async (req, res) => {
  if (!hit(`reset-ip:${ip(req)}`, 10, 15 * 60_000)) return tooMany(res);
  try { await service.resetPassword(req.body?.token, req.body?.password); return res.json({ success: true, message: 'Password updated. Sign in with your new password.' }); }
  catch (error) { return fail(res, error, 'Could not reset password.'); }
});

platformAuthRoutes.post('/accept-invite', async (req, res) => {
  if (!hit(`invite-ip:${ip(req)}`, 10, 15 * 60_000)) return tooMany(res);
  try { await service.acceptInvitation(req.body?.token, req.body?.password); return res.json({ success: true, message: 'Your administrator account is ready. Sign in with your email and new password.' }); }
  catch (error) { return fail(res, error, 'Could not accept the invitation.'); }
});

platformAuthRoutes.post('/verify-email', async (req, res) => {
  if (!hit(`verify-ip:${ip(req)}`, 10, 15 * 60_000)) return tooMany(res);
  try { await service.confirmEmailChange(req.body?.token); return res.json({ success: true, message: 'Email confirmed. Sign in again with your new email.' }); }
  catch (error) { return fail(res, error, 'Could not confirm the email.'); }
});

// ---------------------------------------------------------------- signed in: /api/platform/admins
export const platformAdminRoutes = Router();
platformAdminRoutes.use(authenticate, requirePlatformAdmin);
const me = (req: AuthRequest) => req.user!.userId;
const targetId = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new PlatformAdminError('Invalid administrator.');
  return id;
};

platformAdminRoutes.get('/', async (_req, res) => {
  try { return res.json({ success: true, data: await service.listAdmins() }); } catch (error) { return fail(res, error, 'Could not load administrators.'); }
});
platformAdminRoutes.get('/payment-status', async (_req, res) => {
  try { return res.json({ success: true, data: await service.getPlatformPaymentStatus() }); } catch (error) { return fail(res, error, 'Could not load payment status.'); }
});
platformAdminRoutes.get('/activity', async (_req, res) => {
  try { return res.json({ success: true, data: await service.listActivity() }); } catch (error) { return fail(res, error, 'Could not load activity.'); }
});
platformAdminRoutes.get('/me', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await service.getMe(me(req)) }); } catch (error) { return fail(res, error, 'Could not load your account.'); }
});
platformAdminRoutes.post('/', async (req: AuthRequest, res) => {
  try { return res.status(201).json({ success: true, data: await service.inviteAdmin(me(req), req.body?.fullName, req.body?.email) }); }
  catch (error) { return fail(res, error, 'Could not invite the administrator.'); }
});
platformAdminRoutes.post('/:id/resend-invite', async (req: AuthRequest, res) => {
  try { return res.json({ success: true, data: await service.resendInvite(me(req), targetId(req)) }); } catch (error) { return fail(res, error, 'Could not resend the invitation.'); }
});
platformAdminRoutes.post('/:id/deactivate', async (req: AuthRequest, res) => {
  try { await service.deactivateAdmin(me(req), targetId(req)); return res.json({ success: true }); } catch (error) { return fail(res, error, 'Could not deactivate the administrator.'); }
});
platformAdminRoutes.post('/:id/reactivate', async (req: AuthRequest, res) => {
  try { await service.reactivateAdmin(me(req), targetId(req)); return res.json({ success: true }); } catch (error) { return fail(res, error, 'Could not reactivate the administrator.'); }
});
platformAdminRoutes.delete('/:id', async (req: AuthRequest, res) => {
  try { await service.removeUnusedAdmin(me(req), targetId(req)); return res.json({ success: true }); } catch (error) { return fail(res, error, 'Could not remove the administrator.'); }
});
platformAdminRoutes.put('/me/name', async (req: AuthRequest, res) => {
  try { await service.updateName(me(req), req.body?.fullName); return res.json({ success: true }); } catch (error) { return fail(res, error, 'Could not update your name.'); }
});
platformAdminRoutes.put('/me/password', async (req: AuthRequest, res) => {
  if (!hit(`pw-change:${me(req)}`, 5, 15 * 60_000)) return tooMany(res);
  try {
    const session = await service.changePassword(me(req), req.body?.currentPassword, req.body?.newPassword);
    return res.json({ success: true, data: { accessToken: session.accessToken, refreshToken: session.refreshToken, user: session.user } });
  } catch (error) { return fail(res, error, 'Could not change your password.'); }
});
platformAdminRoutes.post('/me/email', async (req: AuthRequest, res) => {
  if (!hit(`email-change:${me(req)}`, 5, 15 * 60_000)) return tooMany(res);
  try { await service.requestEmailChange(me(req), req.body?.currentPassword, req.body?.newEmail); return res.json({ success: true, message: 'Check the new inbox for a confirmation link. Your email changes once you confirm it.' }); }
  catch (error) {
    if (error instanceof PlatformAdminError) return fail(res, error, '');
    console.error('Platform email change failed', error instanceof Error ? error.message : error);
    return res.status(503).json({ success: false, message: 'The confirmation email could not be sent. Try again later.' });
  }
});
