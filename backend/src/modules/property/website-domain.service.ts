import { prisma } from '../../shared/utils/prisma';

const centralHosts = new Set(['hideout24.com', 'www.hideout24.com', 'app.hideout24.com', 'localhost', '127.0.0.1', 'hotelpms-frontend.onrender.com']);
const reservedSubdomains = new Set(['www', 'app', 'api', 'mail', 'send', 'rsend', 'resend', 'admin']);
const hostnamePattern = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeWebsiteHostname(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const hostname = input.trim().toLowerCase().replace(/\.$/, '');
  if (!hostnamePattern.test(hostname) || centralHosts.has(hostname)) return null;
  if (hostname.endsWith('.hideout24.com') && reservedSubdomains.has(hostname.slice(0, -'.hideout24.com'.length))) return null;
  return hostname;
}

export function defaultHotelHostname(propertyCode: string): string | null {
  const slug = propertyCode.toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !reservedSubdomains.has(slug)
    ? `${slug}.hideout24.com` : null;
}

export async function resolveWebsiteHostname(hostname: string) {
  const normalized = normalizeWebsiteHostname(hostname);
  if (!normalized) return null;
  const mapped = await prisma.propertyWebsiteDomain.findUnique({
    where: { hostname: normalized }, include: { property: { select: { propertyId: true, propertyCode: true, propertyName: true, isActive: true, status: true, isOnlineBookingEnabled: true } } },
  });
  if (mapped) return mapped.isActive && mapped.property.isActive && mapped.property.status === 'Active' && mapped.property.isOnlineBookingEnabled
    ? { ...mapped.property, hostname: normalized, kind: 'custom' as const } : null;

  const suffix = '.hideout24.com';
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (slug.includes('.') || reservedSubdomains.has(slug)) return null;
  const matches = await prisma.property.findMany({
    where: { propertyCode: { equals: slug, mode: 'insensitive' } },
    select: { propertyId: true, propertyCode: true, propertyName: true, isActive: true, status: true, isOnlineBookingEnabled: true }, take: 2,
  });
  if (matches.length !== 1 || defaultHotelHostname(matches[0].propertyCode) !== normalized) return null;
  const property = matches[0];
  return property.isActive && property.status === 'Active' && property.isOnlineBookingEnabled
    ? { ...property, hostname: normalized, kind: 'subdomain' as const } : null;
}

export async function paymentReturnBaseUrl(hostname: unknown, propertyId: number, fallback: string): Promise<string> {
  if (hostname === undefined || hostname === null || hostname === '') return fallback;
  if (typeof hostname !== 'string') throw new Error('Invalid hotel website.');
  const site = await resolveWebsiteHostname(hostname);
  if (site?.propertyId !== propertyId) throw new Error('This website is not connected to the selected hotel.');
  return `https://${site.hostname}`;
}
