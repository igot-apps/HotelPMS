import { Request, Response } from 'express';
import * as paymentService from './payment.service';
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

export const recordPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user && !req.body.tenantId) {
      req.body.tenantId = req.user.tenantId;
    }
    if (req.user && !req.body.receivedBy) {
      req.body.receivedBy = req.user.userId;
    }

    const payment = await paymentService.recordPayment(req.body);
    return res.status(201).json({
      success: true,
      data: payment,
      message: 'Payment recorded successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPayments = async (req: AuthRequest, res: Response) => {
  console.log("🟢 from controller - getPayments");
  console.log("🟢 Query params received:", req.query); // 🚨 Log query instead of body for GET requests

  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const tenantId = req.user?.tenantId!;

    const filters = {
      // 🚨 THIS IS THE MISSING LINE THAT FIXES EVERYTHING:
      search: req.query.search as string | undefined, 
      
      reservationId: req.query.reservationId
        ? parseInt(req.query.reservationId as string)
        : undefined,
      paymentMethod: req.query.paymentMethod as string | undefined,
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const result = await paymentService.getPayments(tenantId, filters, page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.payments,
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

export const getPaymentById = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getParamId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    if (req.user && payment.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this payment',
      });
    }

    return res.status(200).json({
      success: true,
      data: payment,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPaymentsByReservation = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const payments = await paymentService.getPaymentsByReservation(reservationId);

    // Verify access to reservation
    const payment = payments.length > 0 ? payments[0] : null;
    if (payment && req.user && payment.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to these payments',
      });
    }

    return res.status(200).json({
      success: true,
      data: payments,
      count: payments.length,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const updatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getParamId(req);

    const payment = await paymentService.getPaymentById(paymentId);
    if (req.user && payment.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this payment',
      });
    }

    const updated = await paymentService.updatePayment(paymentId, req.body);
    return res.status(200).json({
      success: true,
      data: updated,
      message: 'Payment updated successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const deletePayment = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getParamId(req);

    const payment = await paymentService.getPaymentById(paymentId);
    if (req.user && payment.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this payment',
      });
    }

    await paymentService.deletePayment(paymentId);
    return res.status(200).json({
      success: true,
      message: 'Payment refunded successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getPaymentStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId!;
    const stats = await paymentService.getPaymentStatistics(tenantId);
    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};