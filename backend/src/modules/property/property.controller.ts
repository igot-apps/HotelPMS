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

export const createProperty = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ Removed tenantId injection. Property is the root entity.
    const property = await propertyService.createProperty(req.body);
    return res.status(201).json({ success: true, data: property });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getProperties = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // ✅ Removed tenantId extraction
    const result = await propertyService.getProperties(page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.properties,
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

    return res.status(200).json({ success: true, data: property });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

// ✅ Renamed from getPropertiesByTenant
export const getAllActiveProperties = async (_req: Request, res: Response) => {
  try {
    const properties = await propertyService.getAllActiveProperties();
    return res.status(200).json({ success: true, data: properties });
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
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteProperty = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = getParamId(req);
    const property = await propertyService.getPropertyById(propertyId);

    // ✅ Security check updated to use propertyId
    if (req.user && property.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this property' });
    }

    await propertyService.deleteProperty(propertyId);
    return res.status(200).json({ success: true, message: 'Property deactivated successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};