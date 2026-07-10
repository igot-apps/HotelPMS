import { Response } from 'express';
import * as reportService from './report.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

// 🚨 UPDATED HELPER: Enforces property scoping based on the logged-in user
const extractReportParams = (req: AuthRequest) => {
  const userPropertyId = (req.user as any)?.propertyId;
  
  // If user is tied to a specific property, force it. Otherwise, use the query param.
  const propertyId = userPropertyId 
    ? userPropertyId 
    : (req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined);
    
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  
  return { propertyId, startDate, endDate };
};

// ==========================================
// 🌟 1. THE "ONE-CALL" DASHBOARD CONTROLLER
// ==========================================
export const getFullDashboardReport = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ REMOVED tenantId
    const { propertyId, startDate, endDate } = extractReportParams(req);
    
    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const reportData = await reportService.getFullDashboardReport(propertyId, startDate, endDate);
    return res.status(200).json({ success: true, data: reportData });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to generate full dashboard report' });
  }
};

// ==========================================
// 2. INDIVIDUAL REPORT CONTROLLERS
// ==========================================
export const getFinancialSummary = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, startDate, endDate } = extractReportParams(req);
    if (!propertyId) return res.status(400).json({ success: false, message: 'Property ID is required' });
    
    const reportData = await reportService.getFinancialSummary(propertyId, startDate, endDate);
    return res.status(200).json({ success: true, data: reportData });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to generate financial summary' });
  }
};

export const getRevenueTimeSeries = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, startDate, endDate } = extractReportParams(req);
    if (!propertyId) return res.status(400).json({ success: false, message: 'Property ID is required' });
    
    const reportData = await reportService.getRevenueTimeSeries(propertyId, startDate, endDate);
    return res.status(200).json({ success: true, data: reportData });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to generate revenue time series' });
  }
};

export const getCategoryBreakdowns = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, startDate, endDate } = extractReportParams(req);
    if (!propertyId) return res.status(400).json({ success: false, message: 'Property ID is required' });
    
    const reportData = await reportService.getCategoryBreakdowns(propertyId, startDate, endDate);
    return res.status(200).json({ success: true, data: reportData });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message || 'Failed to generate category breakdowns' });
  }
};