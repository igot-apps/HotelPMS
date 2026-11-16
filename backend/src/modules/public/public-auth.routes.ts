import { Router, Request } from 'express';
import { createHash, randomInt, randomUUID } from 'crypto';
import { prisma } from '../../shared/utils/prisma';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { normalizeGhanaPhoneNumber } from '../../shared/utils/ghanaPhone';
import { centralGuestSessionVersion, guestJwtSecret, guestWebsiteScope } from './guest-website-scope';

const router = Router();

function phoneVariants(phone: string): string[] {
  const national = '0' + phone.slice(4);
  return [phone, national, phone.slice(1)];
}

function hashCode(id: string, code: string): string {
  return createHash('sha256').update(id + ':' + code + ':' + guestJwtSecret()).digest('hex');
}

function guestResponse(guest: { guestId: number; fullName: string; phone: string; email: string | null; centralPasswordHash: string | null },
  account?: { propertyId: number; email: string; sessionVersion: number }) {
  const claims = account
    ? { type: 'hotel_guest', platformGuestId: guest.guestId, propertyId: account.propertyId, email: account.email, sessionVersion: account.sessionVersion }
    : { type: 'central_guest', platformGuestId: guest.guestId, sessionVersion: centralGuestSessionVersion(guest.centralPasswordHash!) };
  const token = jwt.sign(claims, guestJwtSecret(), { expiresIn: '7d' });
  return { guest: { guestId: guest.guestId, fullName: guest.fullName, phone: guest.phone, email: guest.email }, token };
}

const codeLifetimeMs = 5 * 60_000;

function simulatedEmail(req: Request): boolean {
  return process.env.NODE_ENV === 'development'
    && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');
}

function emailCodeHash(req: Request, id: string, code: string, propertyId: number | null): string {
  return hashCode(`${simulatedEmail(req) ? 'local' : 'live'}:email:${propertyId ? `${propertyId}:` : ''}${id}`, code);
}

router.use(async (req, res, next) => {
  if (!simulatedEmail(req) && !process.env.JWT_SECRET?.trim()) {
    res.status(503).json({ success: false, message: 'Email sign-in is temporarily unavailable.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    res.locals.propertyId = (await guestWebsiteScope(req)).propertyId;
    next();
  } catch {
    res.status(404).json({ success: false, message: 'Hotel website unavailable.' });
  }
});

function normalizedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

const passwordAttempts = new Map<string, { count: number; expires: number }>();
const dummyHash = bcrypt.hashSync(randomUUID(), 12);

async function guestPasswordAccount(propertyId: number | null, email: string) {
  const account = propertyId ? await prisma.hotelGuestAccount.findUnique({
    where: { propertyId_email: { propertyId, email } },
    include: { platformGuest: true },
  }) : null;
  const centralMatches = propertyId ? [] : await prisma.platformGuest.findMany({
    where: { email: { equals: email, mode: 'insensitive' } }, take: 2,
  });
  const guest = account?.platformGuest ?? (centralMatches.length === 1 ? centralMatches[0] : undefined);
  const hash = propertyId ? account?.passwordHash : guest?.centralPasswordHash;
  const passwordHash = guest?.isActive && guest.isEmailVerified && guest.email?.trim().toLowerCase() === email ? hash : null;
  return { account, guest, passwordHash };
}

router.post(['/hotel/login', '/email/login'], async (req, res) => {
  const propertyId: number | null = res.locals.propertyId;
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  if (req.path.startsWith('/hotel/') !== Boolean(propertyId) || !email || typeof password !== 'string' || !password || Buffer.byteLength(password) > 72) {
    return res.status(400).json({ success: false, message: 'Enter a valid email and password.' });
  }
  const now = Date.now();
  for (const [key, entry] of passwordAttempts) {
    if (entry.expires <= now) passwordAttempts.delete(key);
  }
  const attemptKey = `${propertyId}:${email}`;
  const attempt = passwordAttempts.get(attemptKey) ?? { count: 0, expires: now + 15 * 60_000 };
  if (attempt.count >= 8 || (!passwordAttempts.has(attemptKey) && passwordAttempts.size >= 10_000)) {
    return res.status(429).json({ success: false, message: 'Too many sign-in attempts. Wait a few minutes or reset your password.' });
  }
  attempt.count++;
  passwordAttempts.set(attemptKey, attempt);
  try {
    const { account, guest, passwordHash } = await guestPasswordAccount(propertyId, email);
    const matches = await bcrypt.compare(password, passwordHash ?? dummyHash);
    if (!matches || !passwordHash || !guest) {
      return res.status(401).json({ success: false, message: 'Email or password is incorrect.' });
    }
    passwordAttempts.delete(attemptKey);
    return res.json({ success: true, data: guestResponse(guest, account ?? undefined) });
  } catch {
    return res.status(500).json({ success: false, message: 'Could not sign in. Please try again.' });
  }
});

router.post('/email/request', async (req, res) => {
  const propertyId: number | null = res.locals.propertyId;
  const email = normalizedEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ success: false, message: 'Enter a valid email address.' });
  }
  if (req.body?.intent === 'continue') {
    try {
      const { passwordHash } = await guestPasswordAccount(propertyId, email);
      if (passwordHash) return res.json({ success: true, data: { needsPassword: true, email } });
    } catch {
      return res.status(503).json({ success: false, message: 'Could not continue. Please try again shortly.' });
    }
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
        data: { id, email, propertyId, codeHash: emailCodeHash(req, id, code, propertyId), expiresAt: new Date(now + codeLifetimeMs) },
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
  const propertyId: number | null = res.locals.propertyId;
  const id = String(req.body?.challengeId || '');
  const code = String(req.body?.code || '');
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ success: false, message: 'Enter the six-digit code.' });
  }
  try {
    const challenge = await prisma.guestEmailChallenge.findUnique({ where: { id } });
    const correct = challenge?.codeHash === emailCodeHash(req, id, code, propertyId);
    const result = await prisma.guestEmailChallenge.updateMany({
      where: { id, propertyId, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
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
    const needsName = !existing?.fullName.trim() || existing.fullName.trim().toLowerCase() === 'guest';
    const setupToken = jwt.sign({
      type: 'guest_password_setup', propertyId, email: challenge.email, challengeId: id, simulated: simulatedEmail(req),
    }, guestJwtSecret(), { expiresIn: '10m' });
    return res.json({ success: true, data: { needsPassword: true, needsName, setupToken } });
  } catch {
    return res.status(500).json({ success: false, message: 'Could not finish sign-in. Please try again.' });
  }
});

router.post(['/hotel/complete', '/email/complete'], async (req, res) => {
  const propertyId: number | null = res.locals.propertyId;
  let setup: jwt.JwtPayload;
  try {
    setup = jwt.verify(String(req.body?.setupToken || ''), guestJwtSecret()) as jwt.JwtPayload;
    if (req.path.startsWith('/hotel/') !== Boolean(propertyId) || setup.type !== 'guest_password_setup' || setup.propertyId !== propertyId
      || typeof setup.email !== 'string' || typeof setup.challengeId !== 'string'
      || setup.simulated !== simulatedEmail(req)) throw new Error();
  } catch {
    return res.status(401).json({ success: false, message: 'Verification expired. Request a new code on this website.' });
  }
  const email: string = setup.email;
  const password = req.body?.password;
  if (typeof password !== 'string' || password.length < 6 || password.length > 15) {
    return res.status(400).json({ success: false, message: 'Use a password between 6 and 15 characters.' });
  }
  const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
  const phone = normalizeGhanaPhoneNumber(req.body?.phone);
  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${'guest-email:' + email}, 0))`;
      const matches = await tx.platformGuest.findMany({ where: { email: { equals: email, mode: 'insensitive' } }, take: 2 });
      if (matches.length > 1) throw Object.assign(new Error('Contact support to resolve duplicate accounts for this email.'), { status: 409 });
      let guest = matches[0];
      if (guest && !guest.isActive) throw Object.assign(new Error('Account is deactivated.'), { status: 403 });
      if (!guest?.fullName.trim() || guest.fullName.trim().toLowerCase() === 'guest') {
        if (!phone || fullName.length < 2 || fullName.length > 200 || fullName.toLowerCase() === 'guest') {
          throw Object.assign(new Error('Enter your full name and a valid Ghana mobile number.'), { status: 400 });
        }
        const existingPhone = await tx.platformGuest.findFirst({ where: { phone: { in: phoneVariants(phone) } } });
        if (existingPhone && existingPhone.guestId !== guest?.guestId) {
          throw Object.assign(new Error('This number is already linked to a guest account. Contact support to recover access.'), { status: 409 });
        }
        guest = guest
          ? await tx.platformGuest.update({ where: { guestId: guest.guestId }, data: {
            fullName, phone, isEmailVerified: true, isPhoneVerified: guest.phone === phone && guest.isPhoneVerified,
          } })
          : await tx.platformGuest.create({ data: { email, fullName, phone, isEmailVerified: true } });
      } else if (!guest.isEmailVerified) {
        guest = await tx.platformGuest.update({ where: { guestId: guest.guestId }, data: { isEmailVerified: true } });
      }
      const claimed = await tx.guestEmailChallenge.updateMany({
        where: { id: setup.challengeId, email, propertyId, consumedAt: { not: null }, setupUsedAt: null },
        data: { setupUsedAt: new Date() },
      });
      if (!claimed.count) throw Object.assign(new Error('Request a new verification code.'), { status: 409 });
      if (!propertyId) {
        const platformGuest = await tx.platformGuest.update({
          where: { guestId: guest.guestId }, data: { centralPasswordHash: passwordHash },
        });
        return guestResponse(platformGuest);
      }
      const account = await tx.hotelGuestAccount.upsert({
        where: { propertyId_email: { propertyId, email } },
        create: { propertyId, email, platformGuestId: guest.guestId, passwordHash },
        update: { platformGuestId: guest.guestId, passwordHash, sessionVersion: { increment: 1 } },
        include: { platformGuest: true },
      });
      return guestResponse(account.platformGuest, account);
    });
    passwordAttempts.delete(`${propertyId}:${email}`);
    return res.json({ success: true, data: result });
  } catch (error) {
    const failure = error as { status?: number; message?: string; code?: string };
    if (failure.status) return res.status(failure.status).json({ success: false, message: failure.message });
    if (failure.code === 'P2002') return res.status(409).json({ success: false, message: 'This profile conflicts with an existing account. Try again or contact support.' });
    return res.status(500).json({ success: false, message: 'Could not save your account. Please try again.' });
  }
});

router.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Use your email address to sign in as a guest.' });
});

export default router;
