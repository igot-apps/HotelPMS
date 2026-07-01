import { Request, Response } from 'express';
import * as ratePlanService from './rate-plan.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

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

export const createRatePlan = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user && !req.body.tenantId) {
      req.body.tenantId = req.user.tenantId;
    }

    const ratePlan = await ratePlanService.createRatePlan(req.body);
    return res.status(201).json({
      success: true,
      data: ratePlan,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getRatePlans = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : undefined;
    const roomTypeId = req.query.roomTypeId 
      ? parseInt(req.query.roomTypeId as string) 
      : undefined;
    const tenantId = req.user?.tenantId;

    const result = await ratePlanService.getRatePlans(
      tenantId,
      propertyId,
      roomTypeId,
      page,
      limit
    );

    return res.status(200).json({
      success: true,
      data: result.ratePlans,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getRatePlanById = async (req: AuthRequest, res: Response) => {
  try {
    const ratePlanId = getParamId(req);
    const ratePlan = await ratePlanService.getRatePlanById(ratePlanId);
    
    if (req.user && ratePlan.property.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this rate plan',
      });
    }

    return res.status(200).json({
      success: true,
      data: ratePlan,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateRatePlan = async (req: AuthRequest, res: Response) => {
  try {
    const ratePlanId = getParamId(req);
    
    const ratePlan = await ratePlanService.getRatePlanById(ratePlanId);
    if (req.user && ratePlan.property.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this rate plan',
      });
    }

    const updated = await ratePlanService.updateRatePlan(ratePlanId, req.body);
    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteRatePlan = async (req: AuthRequest, res: Response) => {
  try {
    const ratePlanId = getParamId(req);
    
    const ratePlan = await ratePlanService.getRatePlanById(ratePlanId);
    if (req.user && ratePlan.property.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this rate plan',
      });
    }

    await ratePlanService.deleteRatePlan(ratePlanId);
    return res.status(200).json({
      success: true,
      message: 'Rate plan deactivated successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};