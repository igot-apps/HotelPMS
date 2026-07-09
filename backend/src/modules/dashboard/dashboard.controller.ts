import { Response } from 'express';
import * as dashboardService from './dashboard.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

export const getOperationalOverview = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId!;
    const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;

    const data = await dashboardService.getOperationalOverview(tenantId, propertyId);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to fetch dashboard overview',
    });
  }
};