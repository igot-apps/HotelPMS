import { Request, Response } from 'express';
import { loginSchema, refreshTokenSchema } from '../../shared/utils/validation';
import * as authService from './auth.service';
import { AuthRequest } from '../../shared/middleware/auth.middleware';

export const login = async (req: Request, res: Response) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        // ✅ FIX: Zod v4 uses .issues instead of .errors
        errors: result.error.issues,
      });
    }

    const { username, password } = result.data;
    const loginResult = await authService.loginUser(username, password);

    if (!loginResult.success) {
      return res.status(401).json({
        success: false,
        message: loginResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: loginResult.accessToken,
        refreshToken: loginResult.refreshToken,
        user: loginResult.user,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const result = refreshTokenSchema.safeParse(req.body);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        // ✅ FIX: Zod v4 uses .issues instead of .errors
        errors: result.error.issues,
      });
    }

    const refreshResult = await authService.refreshAccessToken(
      result.data.refreshToken
    );

    if (!refreshResult.success) {
      return res.status(401).json({
        success: false,
        message: refreshResult.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        accessToken: refreshResult.accessToken,
      },
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const user = await authService.getUserById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get me error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const logout = async (_req: AuthRequest, res: Response) => {
  return res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
};