import { Response } from 'express';
import * as reportService from './report.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

export const getOccupancyReport = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, fromDate, toDate } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!propertyId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, fromDate, and toDate are required',
      });
    }

    const report = await reportService.getOccupancyReport(
      tenantId,
      parseInt(propertyId as string),
      fromDate as string,
      toDate as string
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getRevenueReport = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, fromDate, toDate } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!propertyId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, fromDate, and toDate are required',
      });
    }

    const report = await reportService.getRevenueReport(
      tenantId,
      parseInt(propertyId as string),
      fromDate as string,
      toDate as string
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getReservationReport = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, fromDate, toDate } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!propertyId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, fromDate, and toDate are required',
      });
    }

    const report = await reportService.getReservationReport(
      tenantId,
      parseInt(propertyId as string),
      fromDate as string,
      toDate as string
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getGuestReport = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, fromDate, toDate } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!propertyId || !fromDate || !toDate) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, fromDate, and toDate are required',
      });
    }

    const report = await reportService.getGuestReport(
      tenantId,
      parseInt(propertyId as string),
      fromDate as string,
      toDate as string
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getDailySummary = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, date } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!propertyId || !date) {
      return res.status(400).json({
        success: false,
        message: 'propertyId and date are required',
      });
    }

    const report = await reportService.getDailySummary(
      tenantId,
      parseInt(propertyId as string),
      date as string
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getMonthlySummary = async (req: AuthRequest, res: Response) => {
  try {
    const { propertyId, month, year } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!propertyId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: 'propertyId, month, and year are required',
      });
    }

    const report = await reportService.getMonthlySummary(
      tenantId,
      parseInt(propertyId as string),
      parseInt(month as string),
      parseInt(year as string)
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};