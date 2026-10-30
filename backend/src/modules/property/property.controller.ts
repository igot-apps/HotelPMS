import { Request, Response } from 'express';
import * as propertyService from './property.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const getParamId = (req: Request): number => {
  const id = req.params.id;
  if (typeof id !== 'string') throw new Error('Invalid ID parameter');
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) throw new Error('Invalid ID format');
  return parsedId;
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

export const createProperty = async (_req: AuthRequest, res: Response) => {
  return res.status(403).json({
    success: false,
    message: 'Only platform administrators can create properties. Use the platform administration page.',
  });
};

export const getProperties = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(403).json({ success: false, message: 'Your account is not assigned to a property.' });
    const result = await propertyService.getProperties(page, limit, propertyId);
    
    return res.status(200).json({
      success: true,
      data: result.properties.map(toClientProperty),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getPropertyById = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = getParamId(req);
    const property = await propertyService.getPropertyById(propertyId);

    // ✅ Security check updated to use propertyId
    if (req.user && property.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this property' });
    }

    return res.status(200).json({ success: true, data: toClientProperty(property) });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

// ✅ Renamed from getPropertiesByTenant
export const getAllActiveProperties = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(403).json({ success: false, message: 'Your account is not assigned to a property.' });
    const properties = await propertyService.getAllActiveProperties(propertyId);
    return res.status(200).json({ success: true, data: properties.map(toClientProperty) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getPropertyStats = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = getParamId(req);
    const property = await propertyService.getPropertyById(propertyId);

    // ✅ Security check updated to use propertyId
    if (req.user && property.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this property' });
    }

    const stats = await propertyService.getPropertyStats(propertyId);
    return res.status(200).json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

export const updateProperty = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = getParamId(req);
    const property = await propertyService.getPropertyById(propertyId);

    // ✅ Security check updated to use propertyId
    if (req.user && property.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this property' });
    }

    const updated = await propertyService.updateProperty(propertyId, req.body);
    return res.status(200).json({ success: true, data: toClientProperty(updated) });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteProperty = async (_req: AuthRequest, res: Response) => {
  return res.status(403).json({
    success: false,
    message: 'Only platform administrators can deactivate properties. Use the platform administration page.',
  });
};
