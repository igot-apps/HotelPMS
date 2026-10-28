import { Router, Response } from 'express';
import * as propertyService from './property.service';
import { authenticate, AuthRequest, requirePlatformAdmin } from '../../shared/middleware/auth.middleware';

const router = Router();
router.use(authenticate, requirePlatformAdmin);

const parsePropertyId = (value: string | string[]) => {
  const propertyId = Number.parseInt(Array.isArray(value) ? value[0] : value, 10);
  if (!Number.isInteger(propertyId) || propertyId < 1) throw new Error('Invalid property ID.');
  return propertyId;
};

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(String(req.query.limit || '50'), 10) || 50));
    const search = String(req.query.search || '').slice(0, 120);
    const result = await propertyService.getPlatformProperties(page, limit, search);
    return res.json({
      success: true,
      data: result.properties,
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
    return res.status(201).json({ success: true, data: property });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const property = await propertyService.updateProperty(parsePropertyId(req.params.id), req.body);
    return res.json({ success: true, data: property });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
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
