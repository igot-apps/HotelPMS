import { Response } from 'express';
import * as dashboardService from './dashboard.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

export const getOperationalOverview = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ REMOVED tenantId extraction

    // 🚨 1. CHECK USER'S PROPERTY ASSIGNMENT
    // If the user is assigned to a specific property (e.g., a Receptionist), force that ID.
    const userPropertyId = (req.user as any)?.propertyId; 
    
    // 🚨 2. DETERMINE EFFECTIVE PROPERTY ID
    // If user has a propertyId, use it. Otherwise, fallback to the query param (for Managers).
    const effectivePropertyId = userPropertyId 
      ? userPropertyId 
      : (req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined);

    // 🚨 3. ENFORCE PROPERTY SCOPING
    // A dashboard MUST be scoped to a property.
    if (!effectivePropertyId) {
      return res.status(400).json({
        success: false,
        message: 'Property ID is required to fetch dashboard data',
      });
    }

    const data = await dashboardService.getOperationalOverview(effectivePropertyId);

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