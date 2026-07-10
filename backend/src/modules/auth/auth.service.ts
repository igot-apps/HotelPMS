import { comparePassword } from '../../shared/utils/password';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/jwt';
import * as authRepository from './auth.repository';

export interface LoginResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    userId: number;
    fullName: string;
    username: string;
    email: string | null;
    role: string;
    propertyId: number | null; // ✅ Allow null to satisfy TS
    propertyName: string | null; // ✅ Allow null to satisfy TS
    permissions: string[];
  };
  message?: string;
}

export const loginUser = async (
  username: string,
  password: string
): Promise<LoginResponse> => {
  const user = await authRepository.findUserByUsername(username);
  
  if (!user) {
    return { success: false, message: 'Invalid username or password' };
  }
  if (!user.isActive) {
    return { success: false, message: 'Account is deactivated' };
  }
  
  const isPasswordValid = await comparePassword(password, user.passwordHash);
  if (!isPasswordValid) {
    return { success: false, message: 'Invalid username or password' };
  }

  await authRepository.updateLastLogin(user.userId);

  // 🚨 JWT PAYLOAD: propertyId is now the root scope. Fallback to 0 if null.
  const payload = {
    userId: user.userId,
    propertyId: user.propertyId || 0, 
    roleId: user.roleId,
    username: user.username,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const permissions = user.role.rolePermissions.map(
    (rp) => rp.permission.code
  );

  return {
    success: true,
    accessToken,
    refreshToken,
    user: {
      userId: user.userId,
      fullName: user.fullName,
      username: user.username,
      email: user.email || null,
      role: user.role.roleName,
      propertyId: user.propertyId || null,
      propertyName: (user as any).property?.propertyName || null, // ✅ Safe navigation
      permissions,
    },
  };
};

export const refreshAccessToken = async (refreshToken: string) => {
  const { verifyRefreshToken } = require('../../shared/utils/jwt');
  const decoded = verifyRefreshToken(refreshToken);
  
  if (!decoded) {
    return { success: false, message: 'Invalid refresh token' };
  }
  
  const user = await authRepository.findUserById(decoded.userId);
  if (!user || !user.isActive) {
    return { success: false, message: 'User not found or inactive' };
  }

  // 🚨 JWT PAYLOAD: Fallback to 0 if null
  const payload = {
    userId: user.userId,
    propertyId: user.propertyId || 0,
    roleId: user.roleId,
    username: user.username,
  };

  const accessToken = generateAccessToken(payload);
  return { success: true, accessToken };
};

export const getUserById = async (userId: number) => {
  const user = await authRepository.findUserById(userId);
  if (!user) return null;
  
  return {
    userId: user.userId,
    fullName: user.fullName,
    username: user.username,
    email: user.email,
    role: user.role.roleName,
    propertyId: user.propertyId || null,
    propertyName: (user as any).property?.propertyName || null, // ✅ Safe navigation
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  };
};