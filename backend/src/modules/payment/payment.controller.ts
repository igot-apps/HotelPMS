import { Request, Response } from 'express';
import * as paymentService from './payment.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

// 🌟 Helper for Payment ID (which is still an Int)
const getPaymentId = (req: Request): number => {
  const id = req.params.id;
  if (typeof id !== 'string') throw new Error('Invalid ID parameter');
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) throw new Error('Invalid ID format');
  return parsedId;
};

export const recordPayment = async (req: AuthRequest, res: Response) => {
  try {
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
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getPayments = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : req.user?.propertyId;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const filters = {
      search: req.query.search as string | undefined, 
      // 🌟 FIX: reservationId is now a UUID string, so we don't use parseInt
      reservationId: req.query.reservationId ? (req.query.reservationId as string) : undefined,
      paymentMethod: req.query.paymentMethod as string | undefined,
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const result = await paymentService.getPayments(propertyId, filters, page, limit);

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
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getPaymentById = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getPaymentId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    if (req.user && payment.reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this payment' });
    }

    return res.status(200).json({ success: true, data: payment });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

export const getPaymentsByReservation = async (req: AuthRequest, res: Response) => {
  try {
    // 🌟 FIX: reservationId is now a UUID string, so we get it directly from params
    const reservationId = req.params.id as string;
    
    const payments = await paymentService.getPaymentsByReservation(reservationId);

    const payment = payments.length > 0 ? payments[0] : null;
    if (payment && req.user && payment.reservation?.propertyId !== req.user.propertyId) {    
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this payment',
      });
    }

    return res.status(200).json({ success: true, data: payments, count: payments.length });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const updatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getPaymentId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    if (req.user && payment.reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this payment' });
    }

    const updated = await paymentService.updatePayment(paymentId, req.body);
    return res.status(200).json({ success: true, data: updated, message: 'Payment updated successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const deletePayment = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getPaymentId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    if (req.user && payment.reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this payment' });
    }

    await paymentService.processRefund(paymentId);
    return res.status(200).json({ success: true, message: 'Payment refunded successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getPaymentStatistics = async (req: AuthRequest, res: Response) => {
  try {
    const propertyId = req.user?.propertyId;
    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const stats = await paymentService.getPaymentStatistics(propertyId);
    return res.status(200).json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};