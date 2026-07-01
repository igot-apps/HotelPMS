import { Request, Response } from 'express';
import * as tenantService from './tenant.service';

// ✅ Helper to safely get ID from params
const getParamId = (req: Request): number => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    throw new Error('Invalid ID parameter');
  }
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) {
    throw new Error('Invalid ID format');
  }
  return parsedId;
};

export const createTenant = async (req: Request, res: Response) => {
  try {
    const tenant = await tenantService.createTenant(req.body);
    res.status(201).json({
      success: true,
      data: tenant,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getTenants = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await tenantService.getTenants(page, limit);
    res.status(200).json({
      success: true,
      data: result.tenants,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getTenantById = async (req: Request, res: Response) => {
  try {
    const tenantId = getParamId(req);
    const tenant = await tenantService.getTenantById(tenantId);
    res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error: any) {
    res.status(error.message === 'Invalid ID format' ? 400 : 404).json({
      success: false,
      message: error.message,
    });
  }
};

export const getTenantStats = async (req: Request, res: Response) => {
  try {
    const tenantId = getParamId(req);
    const stats = await tenantService.getTenantStats(tenantId);
    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    res.status(error.message === 'Invalid ID format' ? 400 : 404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateTenant = async (req: Request, res: Response) => {
  try {
    const tenantId = getParamId(req);
    const tenant = await tenantService.updateTenant(tenantId, req.body);
    res.status(200).json({
      success: true,
      data: tenant,
    });
  } catch (error: any) {
    res.status(error.message === 'Invalid ID format' ? 400 : 404).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteTenant = async (req: Request, res: Response) => {
  try {
    const tenantId = getParamId(req);
    await tenantService.deleteTenant(tenantId);
    res.status(200).json({
      success: true,
      message: 'Tenant deactivated successfully',
    });
  } catch (error: any) {
    res.status(error.message === 'Invalid ID format' ? 400 : 404).json({
      success: false,
      message: error.message,
    });
  }
};