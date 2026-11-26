import axios from 'axios';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Moolre mobile money (Ghana, GHS). Collections use the username + public key only.
export type MoolreConfig = { user: string; pubkey: string; account: string; webhookSecret?: string | null };
export type MoolreChannel = 'MTN' | 'TELECEL' | 'AT';

export const MOOLRE_CHANNELS: MoolreChannel[] = ['MTN', 'TELECEL', 'AT'];
export const moolreMode = () => (process.env.MOOLRE_ENV === 'live' ? 'live' : 'sandbox');
export const moolreBaseUrl = () => (moolreMode() === 'live' ? 'https://api.moolre.com' : 'https://sandbox.moolre.com');

export function platformMoolreConfig(): MoolreConfig | null {
  const user = process.env.MOOLRE_USER?.trim();
  const pubkey = process.env.MOOLRE_PUBKEY?.trim();
  const account = process.env.MOOLRE_ACCOUNT?.trim();
  if (!user || !pubkey || !account) return null;
  return { user, pubkey, account, webhookSecret: process.env.MOOLRE_WEBHOOK_SECRET?.trim() || null };
}

// Codes where the outcome is unknown: keep the same reference pending, never treat as failed.
const UNKNOWN_CODES = new Set(['TP11', 'TP18', 'PY01', 'PY02', 'TR01', 'TR02', 'APY10', 'APY16', 'ASL06', 'SYS500', 'TP13', 'IDEM01', 'IDEM02']);
// Codes where Moolre refused the request before any prompt reached the phone, so nothing can be charged.
const REJECTED_CODES = new Set(['TP00', 'TP01', 'TP02', 'TP03', 'TP04', 'TP05', 'TP06', 'TP07', 'TP08', 'TP10', 'TP16', 'OTP429', 'IDEM03', 'AIN01', 'AIN02', 'AIN04', 'AIN05', 'AIN06']);

/** Accepts 0241234567, 233241234567 or +233 24 123 4567; returns the local 10-digit form. */
export function normalizePayer(phone: unknown): string | null {
  const digits = String(phone ?? '').replace(/[\s()-]/g, '').replace(/^\+/, '');
  const local = digits.startsWith('233') && digits.length === 12 ? `0${digits.slice(3)}` : digits;
  return /^0\d{9}$/.test(local) ? local : null;
}
export function normalizeChannel(channel: unknown): MoolreChannel | null {
  const value = String(channel ?? '').trim().toUpperCase();
  if (value === 'VODAFONE') return 'TELECEL';
  if (value === 'AIRTELTIGO') return 'AT';
  return (MOOLRE_CHANNELS as string[]).includes(value) ? value as MoolreChannel : null;
}

type MoolreReply = { status: number; code: string; message: string; data?: any };

async function call(config: MoolreConfig, path: string, body: object, extraHeaders: Record<string, string> = {}): Promise<MoolreReply> {
  const response = await axios.post(moolreBaseUrl() + path, body, {
    headers: { 'Content-Type': 'application/json', 'X-API-USER': config.user, 'X-API-PUBKEY': config.pubkey, ...extraHeaders },
    timeout: 20000,
    validateStatus: () => true,
  });
  const json = response.data && typeof response.data === 'object' ? response.data : { status: 0, code: `HTTP${response.status}`, message: 'Non-JSON response' };
  return { ...json, status: Number(json.status), code: String(json.code || '') };
}

export type InitiateOutcome = 'otp_required' | 'otp_verified' | 'otp_invalid' | 'prompt_sent' | 'rejected' | 'unknown';
export type InitiateResult = { outcome: InitiateOutcome; code: string; message: string };

export function interpretInitiate(reply: MoolreReply): InitiateResult {
  const { code } = reply;
  const message = String(reply.message || '');
  if (code === 'TR099') return { outcome: 'prompt_sent', code, message };
  if (code === 'TP14' || code === 'TP19') return { outcome: 'otp_required', code, message };
  if (code === 'TP17') return { outcome: 'otp_verified', code, message };
  if (code === 'TP15') return { outcome: 'otp_invalid', code, message };
  if (REJECTED_CODES.has(code)) return { outcome: 'rejected', code, message };
  return { outcome: 'unknown', code, message }; // includes UNKNOWN_CODES and anything unexpected
}

/**
 * Starts (or continues) a collection. Network errors are reported as 'unknown', never as failure:
 * the same externalref must be checked again, not replaced.
 */
export async function initiatePayment(config: MoolreConfig, p: { channel: string; payer: string; amount: number | string; externalref: string; otpcode?: string; idempotencyKey?: string }): Promise<InitiateResult> {
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0.01) return { outcome: 'rejected', code: 'LOCAL', message: 'Amount must be more than GHS 0.01.' };
  const body: Record<string, unknown> = {
    type: 1, channel: p.channel, currency: 'GHS', payer: p.payer,
    amount: amount.toFixed(2), externalref: p.externalref, accountnumber: String(config.account),
  };
  if (p.otpcode) body.otpcode = p.otpcode;
  if (moolreMode() !== 'live' && process.env.MOOLRE_SKIP_OTP === 'true') body.skipotp = true;
  try {
    const reply = await call(config, '/open/transact/payment', body, p.idempotencyKey ? { 'Idempotency-Key': p.idempotencyKey } : {});
    if (UNKNOWN_CODES.has(reply.code)) return { outcome: 'unknown', code: reply.code, message: String(reply.message || '') };
    return interpretInitiate(reply);
  } catch (error: any) {
    return { outcome: 'unknown', code: 'NETWORK', message: error?.message || 'No response from Moolre.' };
  }
}

export type StatusResult = { status: 'success' | 'failed' | 'pending' | 'not_found'; code: string; amount: number | null; externalref: string | null; data: any };

/** Checks a collection by externalref. Throws on auth/config errors so callers treat the result as uncertain. */
export async function checkPaymentStatus(config: MoolreConfig, externalref: string): Promise<StatusResult> {
  const reply = await call(config, '/open/transact/status', { type: 1, idtype: '1', id: externalref, accountnumber: String(config.account) });
  const data = reply.data && typeof reply.data === 'object' ? reply.data : null;
  const tx = data ? Number(data.txstatus) : NaN;
  const amount = data && data.amount !== undefined && data.amount !== null ? Number(data.amount) : null;
  const ref = data?.externalref ? String(data.externalref) : null;
  if (reply.status === 1 && tx === 1) return { status: 'success', code: reply.code, amount, externalref: ref, data };
  if (tx === 2 || reply.code === 'SS02') return { status: 'failed', code: reply.code, amount, externalref: ref, data };
  if (reply.code === 'SS07') return { status: 'not_found', code: reply.code, amount, externalref: ref, data };
  if (reply.code === 'SS08' || tx === 0 || UNKNOWN_CODES.has(reply.code)) return { status: 'pending', code: reply.code, amount, externalref: ref, data };
  throw Object.assign(new Error(`Moolre status check failed (${reply.code || 'no code'}).`), { statusCode: 502 });
}

/** X-Moolre-Signature: "t=<unix>,v1=<hex>"; HMAC-SHA256(secret, `${t}.${rawBody}`). */
export function verifyMoolreSignature(rawBody: Buffer, header: string | undefined, secret: string | null | undefined, toleranceSec = 300): boolean {
  if (!header || !secret || !Buffer.isBuffer(rawBody)) return false;
  const parts: Record<string, string> = {};
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index > 0) parts[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !t || !/^[a-fA-F0-9]{64}$/.test(parts.v1 || '')) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  const provided = Buffer.from(parts.v1, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** Shown to the payer; never includes provider codes or keys. */
export function payerMessage(result: InitiateResult): string {
  if (result.code === 'OTP429') return 'Too many SMS codes were requested for this number. Wait a few minutes and try again.';
  if (result.code === 'TP06') return 'Moolre did not accept this mobile money number. Check the number and network.';
  if (result.code === 'TP16') return 'The phone number could not be verified. Start the payment again.';
  if (result.code.startsWith('AIN') || result.code === 'TP00' || ['TP02', 'TP03', 'TP04'].includes(result.code)) return 'Mobile money payments are not available right now. Please contact the hotel.';
  return 'Mobile money payment could not be started. Check the number and network, then try again.';
}
