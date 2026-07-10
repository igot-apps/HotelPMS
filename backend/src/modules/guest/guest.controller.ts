import { Request, Response } from 'express';
import * as guestService from './guest.service';
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

export const createGuest = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ Inject propertyId from token if not provided
    if (req.user && !req.body.propertyId) {
      req.body.propertyId = req.user.propertyId;
    }

    const guest = await guestService.createGuest(req.body);
    return res.status(201).json({
      success: true,
      data: guest,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getGuests = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const searchTerm = req.query.search as string | undefined;
    
    // ✅ Use propertyId from user token (or query if manager overriding)
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : req.user?.propertyId;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const result = await guestService.getGuests(propertyId, searchTerm, page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.guests,
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

export const getGuestById = async (req: AuthRequest, res: Response) => {
  try {
    const guestId = getParamId(req);
    const guest = await guestService.getGuestById(guestId);

    // ✅ Security check updated to use propertyId
    if (req.user && guest.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this guest',
      });
    }

    return res.status(200).json({
      success: true,
      data: guest,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const getGuestStats = async (req: AuthRequest, res: Response) => {
  try {
    const guestId = getParamId(req);
    const stats = await guestService.getGuestStats(guestId);
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

export const getGuestReservations = async (req: AuthRequest, res: Response) => {
  try {
    const guestId = getParamId(req);
    const reservations = await guestService.getGuestReservations(guestId);
    return res.status(200).json({
      success: true,
      data: reservations,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateGuest = async (req: AuthRequest, res: Response) => {
  try {
    const guestId = getParamId(req);
    const guest = await guestService.getGuestById(guestId);

    // ✅ Security check updated to use propertyId
    if (req.user && guest.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this guest',
      });
    }

    const updated = await guestService.updateGuest(guestId, req.body);
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

export const deleteGuest = async (req: AuthRequest, res: Response) => {
  try {
    const guestId = getParamId(req);
    const guest = await guestService.getGuestById(guestId);

    // ✅ Security check updated to use propertyId
    if (req.user && guest.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this guest',
      });
    }

    await guestService.deleteGuest(guestId);
    return res.status(200).json({
      success: true,
      message: 'Guest deactivated successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const searchGuests = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // ✅ Use propertyId from user token
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : req.user?.propertyId;

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    if (!q || typeof q !== 'string' || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters',
      });
    }

    const result = await guestService.searchGuests(propertyId, q, page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.guests,
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