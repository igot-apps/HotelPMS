import { Request, Response } from 'express';
import * as reservationService from './reservation.service';
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

export const createReservation = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user && !req.body.tenantId) {
      req.body.tenantId = req.user.tenantId;
    }
    if (req.user && !req.body.staffId) {
      req.body.staffId = req.user.userId;
    }

    const reservation = await reservationService.createReservation(req.body);
    return res.status(201).json({
      success: true,
      data: reservation,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getReservations = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const tenantId = req.user?.tenantId!;
    const userId = req.user?.userId!;
    

    // 🚨 ROLE-BASED SCOPING
    const userRoleId = (req.user as any)?.roleId;
    const isManager = userRoleId === 1; // Manager roleId is 1

    const effectiveStaffId = isManager 
      ? (req.query.staffId ? parseInt(req.query.staffId as string) : undefined)
      : userId; // Force Receptionists to only see their own

    const filters = {
      propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
      guestId: req.query.guestId ? parseInt(req.query.guestId as string) : undefined,
      staffId: effectiveStaffId, // 🚨 Pass the enforced staffId
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };

    const result = await reservationService.getReservations(tenantId, filters, page, limit);

    return res.status(200).json({
      success: true,
      data: result.reservations,
      pagination: {
        page: result.page, limit: result.limit, total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getReservationById = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const reservation = await reservationService.getReservationById(
      reservationId
    );

    if (req.user && reservation.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this reservation',
      });
    }

    return res.status(200).json({
      success: true,
      data: reservation,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateReservation = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);

    const reservation = await reservationService.getReservationById(
      reservationId
    );
    if (req.user && reservation.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this reservation',
      });
    }

    const updated = await reservationService.updateReservation(
      reservationId,
      req.body
    );
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

export const cancelReservation = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);

    const reservation = await reservationService.getReservationById(
      reservationId
    );
    if (req.user && reservation.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this reservation',
      });
    }

    const cancelled = await reservationService.cancelReservation(reservationId);
    return res.status(200).json({
      success: true,
      data: cancelled,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const checkInGuest = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);

    const reservation = await reservationService.getReservationById(
      reservationId
    );
    if (req.user && reservation.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this reservation',
      });
    }

    const checkedIn = await reservationService.checkInGuest(reservationId);
    return res.status(200).json({
      success: true,
      data: checkedIn,
      message: 'Guest checked in successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const checkOutGuest = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);

    const reservation = await reservationService.getReservationById(
      reservationId
    );
    if (req.user && reservation.tenantId !== req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this reservation',
      });
    }

    const checkedOut = await reservationService.checkOutGuest(reservationId);
    return res.status(200).json({
      success: true,
      data: checkedOut,
      message: 'Guest checked out successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getReservationsByDateRange = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { fromDate, toDate, propertyId } = req.query;
    const tenantId = req.user?.tenantId!;

    if (!fromDate || !toDate || !propertyId) {
      return res.status(400).json({
        success: false,
        message: 'fromDate, toDate, and propertyId are required',
      });
    }

    const reservations = await reservationService.getReservationsByDateRange(
      tenantId,
      parseInt(propertyId as string),
      fromDate as string,
      toDate as string
    );

    return res.status(200).json({
      success: true,
      data: reservations,
      count: reservations.length,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getReservationStats = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const stats = await reservationService.getReservationStats(reservationId);
    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};