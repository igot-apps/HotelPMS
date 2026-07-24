import { Request, Response } from 'express';
import * as reservationService from './reservation.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

// 🌟 FIX: Return string (UUID) instead of number
const getParamId = (req: Request): string => {
  const id = req.params.id;
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('Invalid ID parameter');
  }
  return id; // 🌟 Return as string (UUID), no parseInt!
};

export const createReservation = async (req: AuthRequest, res: Response) => {
  try {
    if (req.user && !req.body.propertyId) {
      req.body.propertyId = req.user.propertyId;
    }
    if (req.user && !req.body.staffId) {
      req.body.staffId = req.user.userId;
    }
    const reservation = await reservationService.createReservation(req.body);
    return res.status(201).json({ success: true, data: reservation });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getReservations = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const filters = {
      propertyId: req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined,
      guestId: req.query.guestId ? parseInt(req.query.guestId as string) : undefined,
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
    };
    const result = await reservationService.getReservations(filters, page, limit);
    return res.status(200).json({
      success: true,
      data: result.reservations,
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

export const getReservationById = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const reservation = await reservationService.getReservationById(reservationId);
    if (req.user && reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this reservation' });
    }
    return res.status(200).json({ success: true, data: reservation });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

export const updateReservation = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const reservation = await reservationService.getReservationById(reservationId);
    if (req.user && reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this reservation' });
    }
    const updated = await reservationService.updateReservation(reservationId, req.body);
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const cancelReservation = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const reservation = await reservationService.getReservationById(reservationId);
    if (req.user && reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this reservation' });
    }
    const cancelled = await reservationService.cancelReservation(reservationId);
    return res.status(200).json({ success: true, data: cancelled });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const checkInGuest = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const reservation = await reservationService.getReservationById(reservationId);
    if (req.user && reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this reservation' });
    }
    const checkedIn = await reservationService.checkInGuest(reservationId);
    return res.status(200).json({ success: true, data: checkedIn, message: 'Guest checked in successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const checkOutGuest = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const reservation = await reservationService.getReservationById(reservationId);
    if (req.user && reservation.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this reservation' });
    }
    const checkedOut = await reservationService.checkOutGuest(reservationId);
    return res.status(200).json({ success: true, data: checkedOut, message: 'Guest checked out successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getReservationsByDateRange = async (req: AuthRequest, res: Response) => {
  try {
    const { fromDate, toDate, propertyId } = req.query;
    if (!fromDate || !toDate || !propertyId) {
      return res.status(400).json({ success: false, message: 'fromDate, toDate, and propertyId are required' });
    }
    const reservations = await reservationService.getReservationsByDateRange(
      parseInt(propertyId as string),
      fromDate as string,
      toDate as string
    );
    return res.status(200).json({ success: true, data: reservations, count: reservations.length });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getReservationStats = async (req: AuthRequest, res: Response) => {
  try {
    const reservationId = getParamId(req);
    const stats = await reservationService.getReservationStats(reservationId);
    return res.status(200).json({ success: true, data: stats });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

export const updateReservationRoomStatus = async (req: AuthRequest, res: Response) => {
  try {
    const reservationRoomId = req.params.reservationRoomId as string;
    const status = req.body.status as string;
    const occupantName = req.body.occupantName as string | undefined;

    if (!['Reserved', 'CheckedIn', 'CheckedOut', 'Cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be Reserved, CheckedIn, CheckedOut, or Cancelled.' });
    }

    const parsedRoomId = parseInt(reservationRoomId);
    if (isNaN(parsedRoomId)) {
      return res.status(400).json({ success: false, message: 'Invalid reservation room ID' });
    }

    const updatedRoom = await reservationService.updateReservationRoomStatus(
      parsedRoomId,
      status,
      occupantName,
      req.user?.propertyId
    );

    return res.status(200).json({ success: true, data: updatedRoom, message: `Room status updated to ${status}` });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const extendReservationRoom = async (req: AuthRequest, res: Response) => {
  try {
    // 🌟 FIX: Explicitly cast the URL param to a string to satisfy TypeScript
    const reservationRoomIdStr = req.params.reservationRoomId as string;
    const reservationRoomId = parseInt(reservationRoomIdStr);
    
    const { newCheckOutDate } = req.body;

    if (isNaN(reservationRoomId)) {
      return res.status(400).json({ success: false, message: 'Invalid reservation room ID' });
    }

    if (!newCheckOutDate) {
      return res.status(400).json({ success: false, message: 'New check-out date is required' });
    }

    const updatedRoom = await reservationService.extendReservationRoom(
      reservationRoomId,
      newCheckOutDate,
      req.user?.propertyId // Pass propertyId for security check
    );

    return res.status(200).json({
      success: true,
      data: updatedRoom,
      message: 'Stay extended successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};