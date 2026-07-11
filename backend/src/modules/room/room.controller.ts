import { Request, Response } from 'express';
import * as roomService from './room.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const getParamId = (req: Request): number => {
  const id = req.params.id;
  if (typeof id !== 'string') throw new Error('Invalid ID parameter');
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) throw new Error('Invalid ID format');
  return parsedId;
};

export const createRoom = async (req: AuthRequest, res: Response) => {
  try {
    // 🚨 CRITICAL: Force the propertyId to the logged-in user's propertyId
    if (req.user?.propertyId) {
      req.body.propertyId = req.user.propertyId;
    }
    
    if (!req.body.propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const room = await roomService.createRoom(req.body);
    return res.status(201).json({ success: true, data: room });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const getRooms = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // 🚨 CRITICAL FIX: Force the propertyId from the logged-in user's token!
    // This ensures a manager ONLY sees their own hotel's rooms.
    const propertyId = req.user?.propertyId 
      ? req.user.propertyId 
      : (req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined);

    const roomTypeId = req.query.roomTypeId ? parseInt(req.query.roomTypeId as string) : undefined;
    const operationalStatus = req.query.status as string | undefined;

    const result = await roomService.getRooms(
      propertyId,
      roomTypeId,
      operationalStatus,
      page,
      limit
    );

    return res.status(200).json({
      success: true,
      data: result.rooms,
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

export const getRoomById = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = getParamId(req);
    const room = await roomService.getRoomById(roomId);

    // ✅ Security check updated to use propertyId
    if (req.user?.propertyId && room.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this room' });
    }

    return res.status(200).json({ success: true, data: room });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

export const getAvailableRooms = async (req: AuthRequest, res: Response) => {
  try {
    const { checkInDate, checkOutDate, roomTypeId } = req.query;
    
    if (!checkInDate || !checkOutDate) {
      return res.status(400).json({ success: false, message: 'Check-in and check-out dates are required' });
    }

    // 🚨 CRITICAL FIX: Force the propertyId from the logged-in user's token!
    const propertyId = req.user?.propertyId 
      ? req.user.propertyId 
      : (req.query.propertyId ? parseInt(req.query.propertyId as string) : undefined);

    if (!propertyId) {
      return res.status(400).json({ success: false, message: 'Property ID is required' });
    }

    const availableRooms = await roomService.getAvailableRooms(
      propertyId,
      checkInDate as string,
      checkOutDate as string,
      roomTypeId ? parseInt(roomTypeId as string) : undefined
    );

    return res.status(200).json({ success: true, data: availableRooms, count: availableRooms.length });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const updateRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = getParamId(req);
    const room = await roomService.getRoomById(roomId);

    // ✅ Security check updated to use propertyId
    if (req.user?.propertyId && room.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this room' });
    }

    const updated = await roomService.updateRoom(roomId, req.body);
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const updateRoomStatus = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = getParamId(req);
    const { operationalStatus, housekeepingStatus } = req.body;

    if (!operationalStatus) {
      return res.status(400).json({ success: false, message: 'Operational status is required' });
    }

    const room = await roomService.getRoomById(roomId);

    // ✅ Security check updated to use propertyId
    if (req.user?.propertyId && room.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this room' });
    }

    const updated = await roomService.updateRoomStatus(roomId, operationalStatus, housekeepingStatus);
    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const roomId = getParamId(req);
    const room = await roomService.getRoomById(roomId);

    // ✅ Security check updated to use propertyId
    if (req.user?.propertyId && room.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this room' });
    }

    await roomService.deleteRoom(roomId);
    return res.status(200).json({ success: true, message: 'Room deactivated successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};