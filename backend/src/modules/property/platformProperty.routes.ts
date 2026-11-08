import { Router, Response } from 'express';
import * as propertyService from './property.service';
import { authenticate, AuthRequest, requirePlatformAdmin } from '../../shared/middleware/auth.middleware';
import { prisma } from '../../shared/utils/prisma';
import { defaultHotelHostname, normalizeWebsiteHostname } from './website-domain.service';
import { addRenderDomain, DomainSetupError, frontendHost, listRenderDomains, removeRenderDomain, verifyDomainReadiness } from './render-domain.service';

const router = Router();
router.use(authenticate, requirePlatformAdmin);

router.get('/:id/website-domains', async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = parsePropertyId(req.params.id);
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { propertyCode: true } });
    if (!property) return res.status(404).json({ success: false, message: 'Hotel not found.' });
    const domains = await prisma.propertyWebsiteDomain.findMany({ where: { propertyId }, orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: { subdomain: defaultHotelHostname(property.propertyCode), frontendHost: frontendHost(), domains } });
  } catch (error: any) { return res.status(400).json({ success: false, message: error.message }); }
});

router.post('/:id/website-domains', async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = parsePropertyId(req.params.id);
    const hostname = normalizeWebsiteHostname(req.body?.hostname);
    if (!hostname) return res.status(400).json({ success: false, message: 'Enter a valid domain name without https:// or a path.' });
    if (hostname.endsWith('.hideout24.com')) return res.status(400).json({ success: false, message: 'HideOut24 subdomains are assigned automatically. Enter a hotel-owned domain.' });
    const property = await prisma.property.findUnique({ where: { propertyId }, select: { propertyCode: true } });
    if (!property) return res.status(404).json({ success: false, message: 'Hotel not found.' });
    if (hostname.endsWith('.hideout24.com')) {
      const slug = hostname.slice(0, -'.hideout24.com'.length);
      const other = await prisma.property.findFirst({ where: { propertyId: { not: propertyId }, propertyCode: { equals: slug, mode: 'insensitive' } }, select: { propertyId: true } });
      if (other) return res.status(409).json({ success: false, message: 'This subdomain belongs to another hotel.' });
    }
    if (await prisma.propertyWebsiteDomain.count({ where: { propertyId } }) >= 1) return res.status(409).json({ success: false, message: 'This hotel already has a custom domain. Remove it before adding another.' });
    const existing = await prisma.propertyWebsiteDomain.findUnique({ where: { hostname } });
    if (existing) return res.status(409).json({ success: false, message: 'This domain is already assigned to a hotel.' });
    const renderDomains = await listRenderDomains();
    const limit = Number(process.env.RENDER_CUSTOM_DOMAIN_LIMIT || 2);
    // Render can add an apex/www companion automatically; reserve both slots.
    const slotsNeeded = 2;
    if (!Number.isSafeInteger(limit) || limit < 1 || renderDomains.length + slotsNeeded > limit) return res.status(409).json({ success: false, message: 'The Render domain allowance is full. Increase the configured limit only after reviewing the added cost.' });
    if (renderDomains.some(item => item.name === hostname)) return res.status(409).json({ success: false, message: 'This domain is already connected in Render.' });
    await addRenderDomain(hostname);
    let domain;
    try { domain = await prisma.propertyWebsiteDomain.create({ data: { propertyId, hostname } }); }
    catch (error) { await removeRenderDomain(hostname).catch(() => undefined); throw error; }
    return res.status(201).json({ success: true, data: domain });
  } catch (error: any) {
    return res.status(error instanceof DomainSetupError ? error.status : error.code === 'P2002' ? 409 : 400).json({ success: false, message: error.code === 'P2002' ? 'This domain is already connected to a hotel.' : error.message });
  }
});

router.post('/:id/website-domains/:domainId/check', async (req: AuthRequest, res: Response) => {
  try {
    const domain = await prisma.propertyWebsiteDomain.findFirst({ where: { propertyId: parsePropertyId(req.params.id), domainId: Number(req.params.domainId) } });
    if (!domain) return res.status(404).json({ success: false, message: 'Domain not found for this hotel.' });
    const check = await verifyDomainReadiness(domain.hostname, true);
    return res.json({ success: true, data: { ...check, isActive: domain.isActive } });
  } catch (error: any) { return res.status(error instanceof DomainSetupError ? error.status : 503).json({ success: false, message: error.message || 'Could not check domain status.' }); }
});

router.patch('/:id/website-domains/:domainId', async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = parsePropertyId(req.params.id);
    const domainId = Number(req.params.domainId);
    if (!Number.isSafeInteger(domainId) || typeof req.body?.isActive !== 'boolean') return res.status(400).json({ success: false, message: 'Choose a valid domain status.' });
    const domain = await prisma.propertyWebsiteDomain.findFirst({ where: { propertyId, domainId } });
    if (!domain) return res.status(404).json({ success: false, message: 'Domain not found.' });
    if (req.body.isActive) {
      const check = await verifyDomainReadiness(domain.hostname);
      if (!check.ready) return res.status(409).json({ success: false, message: check.message, status: check.status });
    }
    const result = await prisma.propertyWebsiteDomain.updateMany({ where: { propertyId, domainId }, data: { isActive: req.body.isActive } });
    if (!result.count) return res.status(404).json({ success: false, message: 'Domain not found.' });
    return res.json({ success: true });
  } catch (error: any) { return res.status(error instanceof DomainSetupError ? error.status : 500).json({ success: false, message: error.message || 'Could not update domain.' }); }
});

router.delete('/:id/website-domains/:domainId', async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = parsePropertyId(req.params.id);
    const domainId = Number(req.params.domainId);
    if (!Number.isSafeInteger(domainId)) return res.status(400).json({ success: false, message: 'Invalid domain.' });
    const domain = await prisma.propertyWebsiteDomain.findFirst({ where: { propertyId, domainId } });
    if (!domain) return res.status(404).json({ success: false, message: 'Domain not found.' });
    await removeRenderDomain(domain.hostname);
    const result = await prisma.propertyWebsiteDomain.deleteMany({ where: { propertyId, domainId } });
    if (!result.count) return res.status(404).json({ success: false, message: 'Domain not found.' });
    return res.json({ success: true });
  } catch (error: any) { return res.status(error instanceof DomainSetupError ? error.status : 500).json({ success: false, message: error.message || 'Could not remove domain.' }); }
});

const parsePropertyId = (value: string | string[]) => {
  const propertyId = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isSafeInteger(propertyId) || propertyId < 1) throw new Error('Invalid property ID.');
  return propertyId;
};

const toClientProperty = (property: any) => {
  if (!property) return property;
  const { paystackSecretKey, ...safeProperty } = property;
  return {
    ...safeProperty,
    hasPaystackSecretKey: Boolean(paystackSecretKey),
    usesPlatformPaystackKey: !paystackSecretKey && Boolean(process.env.PAYSTACK_SECRET_KEY),
    paystackMode: (paystackSecretKey || process.env.PAYSTACK_SECRET_KEY)?.startsWith('sk_test_') ? 'test' : (paystackSecretKey || process.env.PAYSTACK_SECRET_KEY) ? 'live' : null,
  };
};

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const search = String(req.query.search || '').slice(0, 120);
    const result = await propertyService.getPlatformProperties(page, limit, search);
    return res.json({
      success: true,
      data: result.properties.map(toClientProperty),
      pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: Math.ceil(result.total / result.limit) },
      stats: { total: result.total, active: result.active, trials: result.trials },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Could not load properties.' });
  }
});

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const property = await propertyService.createProperty(req.body);
    return res.status(201).json({ success: true, data: toClientProperty(property) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const property = await propertyService.updateProperty(parsePropertyId(req.params.id), req.body);
    return res.json({ success: true, data: toClientProperty(property) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/:id/permanent', async (req: AuthRequest, res: Response) => {
  try {
    await propertyService.permanentlyDeleteProperty(
      parsePropertyId(req.params.id),
      typeof req.body?.confirmationCode === 'string' ? req.body.confirmationCode : '',
    );
    return res.json({ success: true, message: 'Property permanently deleted.' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message || 'Could not delete property.' });
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    await propertyService.deleteProperty(parsePropertyId(req.params.id));
    return res.json({ success: true, message: 'Property deactivated successfully.' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
