// backend/src/modules/user/user.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../shared/middleware/auth.middleware';
import * as userService from './user.service';

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
   const propertyId = req.query.propertyId ? parseInt(String(req.query.propertyId)) : undefined;
    const users = await userService.getUsers(req.user!.tenantId, propertyId);
    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getUserById = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(String(req.params.id));
    const user = await userService.getUserById(userId, req.user!.tenantId);
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
};

// 🚨 NEW: Get all roles for the frontend dropdown
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
    const newUser = await userService.createUser(req.body, req.user!.tenantId);
    res.status(201).json({ success: true, data: newUser });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(String(req.params.id));
    const updatedUser = await userService.updateUser(userId, req.body, req.user!.tenantId);
    res.json({ success: true, data: updatedUser });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};

export const deactivateUser = async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(String(req.params.id));
    await userService.deactivateUser(userId, req.user!.tenantId);
    res.json({ success: true, message: 'User deactivated successfully' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
};