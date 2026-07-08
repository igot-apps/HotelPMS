import { Request, Response } from 'express';
import * as reportService from './report.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

// Helper to extract common query parameters
const extractReportParams = (req: Request) => {
  const propertyId = req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  return { propertyId, startDate, endDate };
};

// ==========================================
// 🌟 1. THE "ONE-CALL" DASHBOARD CONTROLLER
// ==========================================
// This is the master endpoint. The frontend will call this ONCE to get all dashboard data.
export const getFullDashboardReport = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId!;
    const { propertyId, startDate, endDate } = extractReportParams(req);

    const reportData = await reportService.getFullDashboardReport(
      tenantId, 
      propertyId, 
      startDate, 
      endDate
    );

    return res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to generate full dashboard report',
    });
  }
};

// ==========================================
// 2. INDIVIDUAL REPORT CONTROLLERS
// ==========================================
// These are useful if the frontend only needs to refresh a specific chart (e.g., just the Time Series)

export const getFinancialSummary = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId!;
    const { propertyId, startDate, endDate } = extractReportParams(req);

    const reportData = await reportService.getFinancialSummary(tenantId, propertyId, startDate, endDate);

    return res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to generate financial summary',
    });
  }
};

export const getRevenueTimeSeries = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId!;
    const { propertyId, startDate, endDate } = extractReportParams(req);

    const reportData = await reportService.getRevenueTimeSeries(tenantId, propertyId, startDate, endDate);

    return res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to generate revenue time series',
    });
  }
};

export const getCategoryBreakdowns = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId!;
    const { propertyId, startDate, endDate } = extractReportParams(req);

    const reportData = await reportService.getCategoryBreakdowns(tenantId, propertyId, startDate, endDate);

    return res.status(200).json({
      success: true,
      data: reportData,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to generate category breakdowns',
    });
  }
};