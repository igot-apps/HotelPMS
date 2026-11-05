import { Request, Response } from 'express';
import * as userService from './user.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

const safeUser = (user: any) => {
  const { passwordHash, invitationTokenHash, passwordResetTokenHash, passwordResetExpiresAt, sessionVersion, ...safe } = user;
  return safe;
};

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
    const propertyId = req.user?.propertyId;
    if (!propertyId) return res.status(403).json({ success: false, message: 'Hotel account required.' });

    const result = await userService.getUsers(propertyId, page, limit);

    return res.status(200).json({
      success: true,
      data: result.users.map(safeUser),
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

    return res.status(200).json({ success: true, data: safeUser(user) });
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

export const createUser = async (_req: AuthRequest, res: Response) => {
  try {
    return res.status(400).json({ success: false, message: 'Use staff invitations to add a receptionist.' });
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

    if (user.userId === req.user?.userId || !['Receptionist', 'Housekeeper'].includes(user.role.roleName)) {
      return res.status(403).json({ success: false, message: 'Only staff accounts can be managed here.' });
    }
    const updatedUser = await userService.updateUser(userId, {
      fullName: req.body.fullName, username: req.body.username, email: req.body.email,
      isActive: user.invitationPending ? false : req.body.isActive,
    });
    return res.status(200).json({ success: true, data: safeUser(updatedUser) });
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

    if (user.userId === req.user?.userId || !['Receptionist', 'Housekeeper'].includes(user.role.roleName)) {
      return res.status(403).json({ success: false, message: 'Only staff accounts can be managed here.' });
    }
    await userService.deactivateUser(userId);
    return res.status(200).json({ success: true, message: 'User deactivated successfully' });
  } catch (error: any) {
    return res.status(400).json({ success: false, message: error.message });
  }
};
