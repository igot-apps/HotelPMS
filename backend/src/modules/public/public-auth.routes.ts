import { Router, Request } from 'express';
import { createHash, randomInt, randomUUID } from 'crypto';
import { prisma } from '../../shared/utils/prisma';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { normalizeGhanaPhoneNumber } from '../../shared/utils/ghanaPhone';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';

function phoneVariants(phone: string): string[] {
  const national = '0' + phone.slice(4);
  return [phone, national, phone.slice(1)];
}

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(id + ':' + code + ':' + JWT_SECRET).digest('hex');
}

function guestResponse(guest: { guestId: number; fullName: string; phone: string; email: string | null }) {
  const token = jwt.sign({ platformGuestId: guest.guestId, type: 'guest' }, JWT_SECRET, { expiresIn: '7d' });
  return { guest: { guestId: guest.guestId, fullName: guest.fullName, phone: guest.phone, email: guest.email }, token };
}

async function findGuestByPhone(phone: string) {
  return prisma.platformGuest.findFirst({ where: { phone: { in: phoneVariants(phone) } } });
}

const codeLifetimeMs = 5 * 60_000;

function simulatedEmail(req: Request): boolean {
  return process.env.NODE_ENV === 'development'
    && ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname)
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
}

function emailCodeHash(req: Request, id: string, code: string): string {
  return hashCode(`${simulatedEmail(req) ? 'local' : 'live'}:email:${id}`, code);
}

router.use('/email', (req, res, next) => {
  if (!simulatedEmail(req) && !process.env.JWT_SECRET?.trim()) {
    res.status(503).json({ success: false, message: 'Email sign-in is temporarily unavailable.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});

router.post('/email/request', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }
  const simulated = simulatedEmail(req);
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.GUEST_EMAIL_FROM?.trim();
  if (!simulated && (!key || !from)) {
    return res.status(503).json({ success: false, message: 'Email sign-in is temporarily unavailable.' });
  }
  const id = randomUUID();
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  try {
    const retryAfterSeconds = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'guest-email:' + email}, 0))`;
      const now = Date.now();
      const recent = await tx.guestEmailChallenge.findMany({
        where: { email, createdAt: { gt: new Date(now - 3_600_000) } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      const retryAt = recent.length === 5
        ? recent[4].createdAt.getTime() + 3_600_000
        : (recent[0]?.createdAt.getTime() ?? 0) + 60_000;
      const wait = Math.ceil((retryAt - now) / 1000);
      if (wait > 0) return wait;
      await tx.guestEmailChallenge.create({
        data: { id, email, codeHash: emailCodeHash(req, id, code), expiresAt: new Date(now + codeLifetimeMs) },
      });
      return 0;
    });
    if (retryAfterSeconds) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({ success: false, message: 'Please wait before requesting another code.', data: { retryAfterSeconds } });
    }
    if (!simulated) {
      const { data, error } = await new Resend(key!).emails.send({
        from: from!,
        to: [email],
        subject: 'Your HideOut24 sign-in code',
        text: `Your HideOut24 sign-in code is ${code}. It expires in 5 minutes. If you did not request it, you can ignore this email.`,
      });
      if (error || !data?.id) throw new Error('Email not accepted');
    }
    return res.json({ success: true, data: { challengeId: id, email, ...(simulated ? { testCode: code } : {}) } });
  } catch {
    return res.status(503).json({ success: false, message: 'Could not send a sign-in code. Please try again shortly.' });
  }
});

router.post('/email/verify', async (req, res) => {
  const id = String(req.body?.challengeId || '');
  const code = String(req.body?.code || '');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Enter the six-digit code.' });
  }
  try {
    const challenge = await prisma.guestEmailChallenge.findUnique({ where: { id } });
    const correct = challenge?.codeHash === emailCodeHash(req, id, code);
    const result = await prisma.guestEmailChallenge.updateMany({
      where: { id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      data: { attempts: { increment: 1 }, ...(correct ? { consumedAt: new Date() } : {}) },
    });
    if (!challenge || !result.count) {
      return res.status(400).json({ success: false, message: 'This code is no longer valid. Request a new one.' });
    }
    if (!correct) return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
    const matches = await prisma.platformGuest.findMany({
      where: { email: { equals: challenge.email, mode: 'insensitive' } }, take: 2,
    });
    if (matches.length > 1) return res.status(409).json({ success: false, message: 'Contact support to resolve duplicate accounts for this email.' });
    const existing = matches[0];
    if (existing && !existing.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated.' });
    if (existing && existing.fullName.trim() && existing.fullName.trim().toLowerCase() !== 'guest') {
      const guest = await prisma.platformGuest.update({
        where: { guestId: existing.guestId }, data: { isEmailVerified: true },
      });
      return res.json({ success: true, data: guestResponse(guest) });
    }
    const setupToken = jwt.sign({ type: 'email_guest_setup', email: challenge.email, guestId: existing?.guestId, simulated: simulatedEmail(req) }, JWT_SECRET, { expiresIn: '10m' });
    return res.json({ success: true, data: { needsName: true, setupToken } });
  } catch {
    return res.status(500).json({ success: false, message: 'Could not finish sign-in. Please try again.' });
  }
});

router.post('/email/complete', async (req, res) => {
  let setup: jwt.JwtPayload;
  try {
    setup = jwt.verify(String(req.body?.setupToken || ''), JWT_SECRET) as jwt.JwtPayload;
    if (setup.type !== 'email_guest_setup' || typeof setup.email !== 'string' || setup.simulated !== simulatedEmail(req)) throw new Error();
  } catch {
    return res.status(401).json({ success: false, message: 'Sign-in expired. Request a new code.' });
  }
  const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
  const phone = normalizeGhanaPhoneNumber(req.body?.phone);
  if (fullName.length < 2 || fullName.length > 200 || fullName.toLowerCase() === 'guest') {
    return res.status(400).json({ success: false, message: 'Enter your full name to continue.' });
  }
  if (!phone) return res.status(400).json({ success: false, message: 'Enter a valid Ghana mobile number.' });
  try {
    const existingPhone = await findGuestByPhone(phone);
    if (existingPhone && existingPhone.guestId !== setup.guestId) {
      return res.status(409).json({ success: false, message: 'This number is already linked to a guest account. Contact support to recover access.' });
    }
    if (setup.guestId) {
      const existing = await prisma.platformGuest.findUnique({ where: { guestId: setup.guestId } });
      if (!existing?.isActive || existing.email?.toLowerCase() !== setup.email
        || (existing.fullName.trim() && existing.fullName.trim().toLowerCase() !== 'guest')) {
        return res.status(409).json({ success: false, message: 'Request a new code to sign in.' });
      }
      const updated = await prisma.platformGuest.updateMany({
        where: { guestId: existing.guestId, fullName: existing.fullName, email: existing.email, isActive: true },
        data: { fullName, phone, isEmailVerified: true, isPhoneVerified: false },
      });
      if (!updated.count) return res.status(409).json({ success: false, message: 'Request a new code to sign in.' });
      return res.json({ success: true, data: guestResponse({ ...existing, fullName, phone }) });
    }
    const guest = await prisma.platformGuest.create({
      data: { email: setup.email, fullName, phone, isEmailVerified: true, isPhoneVerified: false },
    });
    return res.status(201).json({ success: true, data: guestResponse(guest) });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2002') {
      return res.status(409).json({ success: false, message: 'This email or phone is already linked to an account. Start again or contact support.' });
    }
    return res.status(500).json({ success: false, message: 'Could not save your profile. Please try again.' });
  }
});

router.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Use your email address to sign in as a guest.' });
});

export default router;
