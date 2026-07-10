import { Request, Response } from 'express';
import * as userService from './user.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const getParamId = (req: Request): number => {
  const id = req.params.id;
  if (typeof id !== 'string') throw new Error('Invalid ID parameter');
  const parsedId = parseInt(id);
  if (isNaN(parsedId)) throw new Error('Invalid ID format');
  return parsedId;
};

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // ✅ Use propertyId from user token (or query if overriding)
    const propertyId = req.query.propertyId
      ? parseInt(req.query.propertyId as string)
      : req.user?.propertyId;

    const result = await userService.getUsers(propertyId, page, limit);

    return res.status(200).json({
      success: true,
      data: result.users,
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

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getParamId(req);
    const user = await userService.getUserById(userId);

    // ✅ Security check updated to use propertyId
    if (req.user && user.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this user' });
    }

    return res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    return res.status(404).json({ success: false, message: error.message });
  }
};

export const getRoles = async (_req: AuthRequest, res: Response) => {
  try {
    const roles = await userService.getRoles();
    res.json({ success: true, data: roles });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ Inject propertyId from token if not provided
    if (req.user && !req.body.propertyId) {
      req.body.propertyId = req.user.propertyId;
    }

    const newUser = await userService.createUser(req.body);
    return res.status(201).json({ success: true, data: newUser });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getParamId(req);
    const user = await userService.getUserById(userId);

    // ✅ Security check updated to use propertyId
    if (req.user && user.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this user' });
    }

    const updatedUser = await userService.updateUser(userId, req.body);
    return res.status(200).json({ success: true, data: updatedUser });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const deactivateUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = getParamId(req);
    const user = await userService.getUserById(userId);

    // ✅ Security check updated to use propertyId
    if (req.user && user.propertyId !== req.user.propertyId) {
      return res.status(403).json({ success: false, message: 'You do not have access to this user' });
    }

    await userService.deactivateUser(userId);
    return res.status(200).json({ success: true, message: 'User deactivated successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};