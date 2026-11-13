import { Router, Response } from 'express';
import { createHash, createPublicKey, randomInt, randomUUID, verify as verifySignature } from 'crypto';
import { prisma } from '../../shared/utils/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { normalizeGhanaPhoneNumber } from '../../shared/utils/ghanaPhone';
import { createMoolreReference, isMoolreSmsConfigured, MoolreSmsError, sendMoolreSms } from '../notifications/moolre-sms.service';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const GOOGLE_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
function phoneAuthMode(): 'off' | 'simulation' | 'moolre' {
  const configured = process.env.GUEST_PHONE_AUTH_MODE?.trim().toLowerCase();
  if (configured === 'off') return 'off';
  if (configured === 'simulation') return 'simulation';
  return isMoolreSmsConfigured() ? 'moolre' : 'simulation';
}

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

type GoogleIdentity = { sub: string; email: string; name: string };
type GoogleClaims = { iss?: string; aud?: string; exp?: number; sub?: string; email?: string; email_verified?: boolean | string; name?: string };
let googleKeys: { keys: Array<{ kid?: string; kty: string; [key: string]: unknown }>; until: number } | null = null;

async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured');
  const parts = credential.split('.');
  if (parts.length !== 3 || credential.length > 10000) throw new Error('Invalid Google credential');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg?: string; kid?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid Google credential');
  if (!googleKeys || googleKeys.until < Date.now()) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
    if (!response.ok) throw new Error('Could not verify Google sign-in');
    const body = await response.json() as { keys: Array<{ kid?: string; kty: string; [key: string]: unknown }> };
    googleKeys = { keys: body.keys, until: Date.now() + 30 * 60 * 1000 };
  }
  const jwk = googleKeys.keys.find(key => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('Unknown Google signing key; please retry');
  const publicKey = createPublicKey({ key: jwk as any, format: 'jwk' });
  const valid = verifySignature('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), publicKey, Buffer.from(parts[2], 'base64url'));
  if (!valid) throw new Error('Invalid Google credential');
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as GoogleClaims;
  if (!GOOGLE_ISSUERS.has(claims.iss || '') || claims.aud !== clientId || !claims.exp || claims.exp <= Date.now() / 1000 || !claims.sub || !claims.email || ![true, 'true'].includes(claims.email_verified as any)) {
    throw new Error('Google account could not be verified');
  }
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: (claims.name || 'Guest').slice(0, 200) };
}

router.get('/methods', (_req, res) => {
  const mode = phoneAuthMode();
  res.json({ success: true, data: { googleEnabled: false, phoneEnabled: mode !== 'off', simulatedPhone: mode === 'simulation' } });
});

router.post('/google', async (req: any, res: Response) => {
  try {
    const identity = await verifyGoogleCredential(String(req.body?.credential || ''));
    let guest = await prisma.platformGuest.findUnique({ where: { googleSubject: identity.sub } });
    if (!guest) {
      const byEmail = await prisma.platformGuest.findUnique({ where: { email: identity.email } });
      if (byEmail?.isEmailVerified) {
        guest = await prisma.platformGuest.update({ where: { guestId: byEmail.guestId }, data: { googleSubject: identity.sub } });
      }
    }
    if (guest) {
      if (!guest.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
      return res.json({ success: true, data: guestResponse(guest) });
    }
    const setupToken = jwt.sign({ type: 'google_guest_setup', ...identity }, JWT_SECRET, { expiresIn: '10m' });
    return res.json({ success: true, data: { needsPhone: true, setupToken, name: identity.name, email: identity.email } });
  } catch (error: any) {
    return res.status(401).json({ success: false, message: error.message || 'Google sign-in failed' });
  }
});

router.post('/google/complete', async (req: any, res: Response) => {
  try {
    const setup = jwt.verify(String(req.body?.setupToken || ''), JWT_SECRET) as jwt.JwtPayload;
    if (setup.type !== 'google_guest_setup' || !setup.sub || !setup.email) throw new Error('Google sign-in expired. Please start again.');
    const phone = normalizeGhanaPhoneNumber(req.body?.phone);
    if (!phone) return res.status(400).json({ success: false, message: 'Enter a valid Ghana mobile number' });
    const existing = await findGuestByPhone(phone);
    if (existing) return res.status(409).json({ success: false, message: 'This phone number already has an account. Sign in with its existing password or phone code.' });
    const existingEmail = await prisma.platformGuest.findUnique({ where: { email: String(setup.email) } });
    if (existingEmail) return res.status(409).json({ success: false, message: 'This email already has an account. Sign in to that account first.' });
    const existingGoogle = await prisma.platformGuest.findUnique({ where: { googleSubject: String(setup.sub) } });
    if (existingGoogle) return res.status(409).json({ success: false, message: 'This Google account is already registered. Sign in again.' });
    const guest = await prisma.platformGuest.create({ data: {
      fullName: String(req.body?.fullName || setup.name || 'Guest').trim().slice(0, 200) || 'Guest',
      phone, email: String(setup.email), googleSubject: String(setup.sub), isEmailVerified: true,
      isPhoneVerified: false,
    } });
    return res.status(201).json({ success: true, data: guestResponse(guest) });
  } catch {
    return res.status(400).json({ success: false, message: 'Could not finish Google sign-in. Please start again.' });
  }
});

router.post('/phone/request', async (req: any, res: Response) => {
  try {
    const phone = normalizeGhanaPhoneNumber(req.body?.phone);
    if (!phone) return res.status(400).json({ success: false, message: 'Enter a valid Ghana mobile number' });
    const mode = phoneAuthMode();
    if (mode === 'off') return res.status(503).json({ success: false, message: 'Phone sign-in is temporarily unavailable.' });

    let google: GoogleIdentity | null = null;
    if (req.body?.setupToken) {
      const setup = jwt.verify(String(req.body.setupToken), JWT_SECRET) as jwt.JwtPayload;
      if (setup.type !== 'google_guest_setup' || !setup.sub || !setup.email) throw new Error('Google sign-in expired. Please start again.');
      google = { sub: String(setup.sub), email: String(setup.email), name: String(setup.name || 'Guest') };
    }
    const recent = await prisma.guestPhoneChallenge.findFirst({ where: { phone, createdAt: { gt: new Date(Date.now() - 60_000) } }, orderBy: { createdAt: 'desc' } });
    if (recent) return res.status(429).json({ success: false, message: 'Wait one minute before requesting another code' });
    const hourly = await prisma.guestPhoneChallenge.count({ where: { phone, createdAt: { gt: new Date(Date.now() - 60 * 60_000) } } });
    if (hourly >= 5) return res.status(429).json({ success: false, message: 'Too many codes requested. Try again in an hour.' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const id = randomUUID();
    const smsReference = createMoolreReference(`guest-auth-${id}`);
    await prisma.guestPhoneChallenge.create({ data: {
      id, phone, codeHash: hashCode(id, code), purpose: google ? 'google_link' : 'login',
      googleSub: google?.sub, googleEmail: google?.email, googleName: google?.name,
      expiresAt: new Date(Date.now() + 5 * 60_000),
      smsProvider: mode === 'moolre' ? 'moolre' : 'simulation', smsReference,
      smsState: mode === 'moolre' ? 'pending' : 'simulated',
    } });
    if (mode === 'moolre') {
      try {
        await sendMoolreSms({ recipient: phone, message: `Your HideOut24 sign-in code is ${code}. It expires in 5 minutes.`, reference: smsReference });
        await prisma.guestPhoneChallenge.update({ where: { id }, data: { smsState: 'accepted', smsAcceptedAt: new Date() } });
      } catch (error) {
        const smsError = error instanceof MoolreSmsError ? error : new MoolreSmsError('SMS could not be sent.', smsReference, true);
        await prisma.guestPhoneChallenge.update({ where: { id }, data: { smsState: smsError.ambiguous ? 'uncertain' : 'failed' } });
        return res.status(503).json({ success: false, message: smsError.ambiguous
          ? 'The code delivery status is uncertain. Please wait before requesting another code.'
          : 'Could not send the sign-in code. Please try again later.' });
      }
    }
    return res.json({ success: true, data: { challengeId: id, phone, expiresInSeconds: 300, ...(mode === 'simulation' ? { testCode: code } : {}) } });
  } catch (error) {
    if (error instanceof MoolreSmsError) return res.status(503).json({ success: false, message: 'Could not send the sign-in code. Please try again later.' });
    return res.status(400).json({ success: false, message: 'Could not start phone sign-in. Please try again.' });
  }
});

router.post('/phone/verify', async (req: any, res: Response) => {
  const id = String(req.body?.challengeId || '');
  const code = String(req.body?.code || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: 'Enter the six-digit code' });
  try {
    const challenge = await prisma.guestPhoneChallenge.findUnique({ where: { id } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) {
      return res.status(400).json({ success: false, message: 'Code expired. Request a new one.' });
    }
    await prisma.guestPhoneChallenge.update({ where: { id }, data: { attempts: { increment: 1 } } });
    if (challenge.codeHash !== hashCode(id, code)) return res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
    const claimed = await prisma.guestPhoneChallenge.updateMany({ where: { id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lte: 5 } }, data: { consumedAt: new Date() } });
    if (!claimed.count) return res.status(400).json({ success: false, message: 'Code already used. Request a new one.' });
    let guest = await findGuestByPhone(challenge.phone);
    if (challenge.googleSub && challenge.googleEmail) {
      const existingSubject = await prisma.platformGuest.findUnique({ where: { googleSubject: challenge.googleSub } });
      const existingEmail = await prisma.platformGuest.findUnique({ where: { email: challenge.googleEmail } });
      if ((existingSubject && guest && existingSubject.guestId !== guest.guestId) || (existingEmail && guest && existingEmail.guestId !== guest.guestId)) {
        return res.status(409).json({ success: false, message: 'This Google account belongs to another guest account.' });
      }
      if (!guest && (existingSubject || existingEmail)) return res.status(409).json({ success: false, message: 'This Google account already has a different phone number.' });
      if (guest?.googleSubject && guest.googleSubject !== challenge.googleSub) return res.status(409).json({ success: false, message: 'This phone is already linked to another Google account.' });
      if (guest?.email && guest.email.toLowerCase() !== challenge.googleEmail) return res.status(409).json({ success: false, message: 'This phone is already registered with a different email.' });
      guest = guest
        ? await prisma.platformGuest.update({ where: { guestId: guest.guestId }, data: { googleSubject: challenge.googleSub, email: challenge.googleEmail, isEmailVerified: true, isPhoneVerified: true } })
        : await prisma.platformGuest.create({ data: { fullName: challenge.googleName || 'Guest', phone: challenge.phone, email: challenge.googleEmail, googleSubject: challenge.googleSub, isEmailVerified: true, isPhoneVerified: true } });
    } else {
      if (guest && !guest.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
      if (!guest || guest.fullName.trim().toLowerCase() === 'guest') {
        const setupToken = jwt.sign({ type: 'phone_guest_setup', phone: challenge.phone, guestId: guest?.guestId }, JWT_SECRET, { expiresIn: '10m' });
        return res.json({ success: true, data: { needsName: true, setupToken, phone: challenge.phone } });
      }
      guest = await prisma.platformGuest.update({ where: { guestId: guest.guestId }, data: { isPhoneVerified: true } });
    }
    if (!guest.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
    return res.json({ success: true, data: guestResponse(guest) });
  } catch {
    return res.status(500).json({ success: false, message: 'Could not finish sign-in. Please try again.' });
  }
});

router.post('/phone/complete', async (req: any, res: Response) => {
  try {
    const setup = jwt.verify(String(req.body?.setupToken || ''), JWT_SECRET) as jwt.JwtPayload;
    if (setup.type !== 'phone_guest_setup' || !normalizeGhanaPhoneNumber(setup.phone)) throw new Error('Sign-in expired. Request a new code.');
    const fullName = String(req.body?.fullName || '').trim().replace(/\s+/g, ' ');
    if (fullName.length < 2 || fullName.length > 200 || fullName.toLowerCase() === 'guest') {
      return res.status(400).json({ success: false, message: 'Enter your full name to continue.' });
    }
    const existing = await findGuestByPhone(setup.phone);
    if (existing && (!setup.guestId || existing.guestId !== setup.guestId)) {
      return res.status(409).json({ success: false, message: 'This number already belongs to another account.' });
    }
    if (existing && !existing.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
    if (existing && existing.fullName.trim().toLowerCase() !== 'guest') {
      return res.status(409).json({ success: false, message: 'Name is already set. Request a new code to sign in.' });
    }
    const guest = existing
      ? await prisma.platformGuest.update({ where: { guestId: existing.guestId }, data: { fullName, isPhoneVerified: true } })
      : await prisma.platformGuest.create({ data: { fullName, phone: setup.phone, isPhoneVerified: true } });
    return res.json({ success: true, data: guestResponse(guest) });
  } catch {
    return res.status(400).json({ success: false, message: 'Sign-in expired. Request a new code.' });
  }
});

// Legacy password endpoints remain for existing clients while public UI moves to phone/Google.
router.post('/register', async (req: any, res: Response) => {
  try {
    const { fullName, phone, email, password } = req.body;
    const cleanPhone = phone?.trim();
    const cleanEmail = email?.trim() || null;
    if (!fullName || !cleanPhone || !password) return res.status(400).json({ success: false, message: 'Full name, phone, and password are required' });
    if (await prisma.platformGuest.findUnique({ where: { phone: cleanPhone } })) return res.status(400).json({ success: false, message: 'An account with this phone number already exists. Please login instead.' });
    const guest = await prisma.platformGuest.create({ data: { fullName: fullName.trim(), phone: cleanPhone, email: cleanEmail, passwordHash: await bcrypt.hash(password, 10) } });
    return res.status(201).json({ success: true, data: guestResponse(guest) });
  } catch {
    return res.status(500).json({ success: false, message: 'Could not create account' });
  }
});

router.post('/login', async (req: any, res: Response) => {
  try {
    const guest = await prisma.platformGuest.findUnique({ where: { phone: String(req.body?.phone || '').trim() } });
    if (!guest?.passwordHash || !await bcrypt.compare(String(req.body?.password || ''), guest.passwordHash)) return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    if (!guest.isActive) return res.status(403).json({ success: false, message: 'Account is deactivated' });
    return res.json({ success: true, data: guestResponse(guest) });
  } catch {
    return res.status(500).json({ success: false, message: 'Could not sign in' });
  }
});

export default router;
