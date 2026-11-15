import type { Request } from 'express';
import { isCentralWebsiteHost, resolveWebsiteHostname } from '../property/website-domain.service';

export function guestJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'development') return 'your-super-secret-key';
  throw new Error('Guest authentication is not configured.');
}

export async function guestWebsiteScope(req: Request) {
  const origin = req.get('origin');
  const originUrl = origin ? new URL(origin) : null;
  if (originUrl && !['https:', 'http:'].includes(originUrl.protocol)) throw new Error('Invalid website origin.');
  const host = originUrl?.hostname;
  if (!host || isCentralWebsiteHost(host)) return { propertyId: null, origin: originUrl?.origin };
  const site = await resolveWebsiteHostname(host);
  if (!site) throw new Error('Hotel website unavailable.');
  return { propertyId: site.propertyId, origin: originUrl?.origin };
}
