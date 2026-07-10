import { Request, Response } from 'express';
import * as roomTypeService from './room-type.service';
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

export const createRoomType = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ Inject propertyId from token if not provided
    if (req.user && !req.body.propertyId) {
      req.body.propertyId = req.user.propertyId;
    }

    const roomType = await roomTypeService.createRoomType(req.body);
    return res.status(201).json({
      success: true,
      data: roomType,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

export const getRoomTypes = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    
    // ✅ Use propertyId from user token
    const propertyId = req.query.propertyId 
      ? parseInt(req.query.propertyId as string) 
      : req.user?.propertyId;

    const result = await roomTypeService.getRoomTypes(propertyId, page, limit);
    
    return res.status(200).json({
      success: true,
      data: result.roomTypes,
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

export const getRoomTypeById = async (req: AuthRequest, res: Response) => {
  try {
    const roomTypeId = getParamId(req);
    const roomType = await roomTypeService.getRoomTypeById(roomTypeId);

    // ✅ Security check updated to use propertyId
    if (req.user && roomType.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this room type',
      });
    }

    return res.status(200).json({
      success: true,
      data: roomType,
    });
  } catch (error: any) {
    return res.status(404).json({
      success: false,
      message: error.message,
    });
  }
};

export const getRoomTypeStats = async (req: AuthRequest, res: Response) => {
  try {
    const roomTypeId = getParamId(req);
    const stats = await roomTypeService.getRoomTypeStats(roomTypeId);
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

export const updateRoomType = async (req: AuthRequest, res: Response) => {
  try {
    const roomTypeId = getParamId(req);
    const roomType = await roomTypeService.getRoomTypeById(roomTypeId);

    // ✅ Security check updated to use propertyId
    if (req.user && roomType.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this room type',
      });
    }

    const updated = await roomTypeService.updateRoomType(roomTypeId, req.body);
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

export const deleteRoomType = async (req: AuthRequest, res: Response) => {
  try {
    const roomTypeId = getParamId(req);
    const roomType = await roomTypeService.getRoomTypeById(roomTypeId);

    // ✅ Security check updated to use propertyId
    if (req.user && roomType.propertyId !== req.user.propertyId) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this room type',
      });
    }

    await roomTypeService.deleteRoomType(roomTypeId);
    return res.status(200).json({
      success: true,
      message: 'Room type deactivated successfully',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};