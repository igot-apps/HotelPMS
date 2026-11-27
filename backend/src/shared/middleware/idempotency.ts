import { createHash } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../utils/prisma';

/**
 * Idempotency for money and booking changes.
 *
 * The app sends an `Idempotency-Key` header with each save. If the phone loses the reply (weak signal,
 * timeout) and the same save is sent again with the same key, the server answers with the result it
 * already produced instead of doing the work twice (no second payment, booking, refund or check-in).
 *
 * - No header: the request runs exactly as before (older app versions keep working).
 * - Same key, same request, finished: the stored reply is returned (header `Idempotent-Replayed: true`).
 * - Same key while the first one is still running: 409, nothing is done twice.
 * - Same key with a different request: 422, nothing is done.
 * - Server errors (5xx) are not stored, so a genuine retry can run again.
 *
 * Keys are scoped to the signed-in person (staff user or booking guest) and kept for 24 hours.
 */

const KEEP_MS = 24 * 60 * 60 * 1000;
const STALE_PROCESSING_MS = 10 * 60 * 1000; // a save that never finished (server restarted) can be retried
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,100}$/;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const db = () => prisma as any; // read at request time (keeps test mocks and lazy setup working)

function scopeOf(req: any): string | null {
  if (req.user?.userId) return `staff:${req.user.userId}:${req.user.propertyId ?? 0}`;
  if (req.bookingGuest?.guestId) return `guest:${req.bookingGuest.guestId}`;
  return null;
}

const requestHash = (req: Request) => createHash('sha256')
  .update(`${req.method}\n${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
  .digest('hex');

let calls = 0;
function sweepExpired() {
  if (++calls % 50 !== 0) return;
  db().idempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
}

export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const key = req.get('Idempotency-Key');
  if (!key || !MUTATING.has(req.method)) return next();
  if (!KEY_PATTERN.test(key)) return res.status(400).json({ success: false, message: 'Invalid Idempotency-Key header.' });
  const scope = scopeOf(req);
  if (!scope) return next(); // not signed in: the route's own checks answer

  const hash = requestHash(req);
  const now = new Date();
  let recordId: number;
  try {
    const created = await db().idempotencyRecord.create({
      data: { scope, key, method: req.method, path: req.originalUrl.slice(0, 300), requestHash: hash, state: 'processing', expiresAt: new Date(now.getTime() + KEEP_MS) },
      select: { recordId: true },
    });
    recordId = created.recordId;
  } catch (error: any) {
    if (error?.code !== 'P2002') {
      // Storage unavailable (e.g. table not migrated yet): run the request normally rather than block saves.
      console.error('[idempotency] not applied:', error?.code || error?.message);
      return next();
    }
    const existing = await db().idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } });
    if (!existing) return idempotency(req, res, next); // removed in between: try again once more
    const expired = existing.expiresAt < now;
    const abandoned = existing.state === 'processing' && now.getTime() - new Date(existing.createdAt).getTime() > STALE_PROCESSING_MS;
    if (expired || abandoned) {
      await db().idempotencyRecord.deleteMany({ where: { recordId: existing.recordId } });
      return idempotency(req, res, next);
    }
    if (existing.requestHash !== hash) {
      return res.status(422).json({ success: false, code: 'IDEMPOTENCY_KEY_REUSED', message: 'This request does not match the earlier one sent with the same key. Nothing was changed.' });
    }
    if (existing.state === 'processing') {
      return res.status(409).json({ success: false, code: 'REQUEST_IN_PROGRESS', message: 'This is already being saved. Please wait a moment, then refresh to see the result.' });
    }
    res.set('Idempotent-Replayed', 'true');
    return res.status(existing.responseStatus ?? 200).json(existing.responseBody ?? { success: (existing.responseStatus ?? 200) < 400 });
  }

  sweepExpired();
  // The result is stored as soon as the route produces it — even if the phone has already stopped
  // waiting — so a retry with the same key gets this result instead of doing the work again.
  let settled = false;
  const settle = (status: number, body: unknown) => {
    if (settled) return;
    settled = true;
    const work = status >= 500
      ? db().idempotencyRecord.deleteMany({ where: { recordId } })
      : db().idempotencyRecord.update({ where: { recordId }, data: { state: 'completed', responseStatus: status, responseBody: body == null ? null : JSON.parse(JSON.stringify(body)) } });
    work.catch((err: unknown) => console.error('[idempotency] could not store result:', err));
  };
  const originalJson = res.json.bind(res);
  res.json = ((payload: unknown) => { settle(res.statusCode, payload); return originalJson(payload); }) as Response['json'];
  res.on('finish', () => settle(res.statusCode, null)); // replies sent without res.json
  return next();
}
