import { Request, Response } from 'express';
import * as paymentService from './payment.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const getParamId = (req: Request): number => {
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
    // ✅ No need to inject propertyId/tenantId into body, it's tied to the reservation

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
    
    // ✅ Use propertyId from user token
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : req.user?.propertyId;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const filters = {
      search: req.query.search as string | undefined, 
      reservationId: req.query.reservationId ? parseInt(req.query.reservationId as string) : undefined,
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
    const paymentId = getParamId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    // ✅ Security check updated to use propertyId via reservation relation
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
    const reservationId = getParamId(req);
    const payments = await paymentService.getPaymentsByReservation(reservationId);

    // ✅ Security check updated to use propertyId via reservation relation
    const payment = payments.length > 0 ? payments[0] : null;
    if (payment && req.user && payment.reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to these payments' });
    }

    return res.status(200).json({ success: true, data: payments, count: payments.length });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const updatePayment = async (req: AuthRequest, res: Response) => {
  try {
    const paymentId = getParamId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    // ✅ Security check updated to use propertyId via reservation relation
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
    const paymentId = getParamId(req);
    const payment = await paymentService.getPaymentById(paymentId);

    // ✅ Security check updated to use propertyId via reservation relation
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
    // ✅ Use propertyId from user token
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