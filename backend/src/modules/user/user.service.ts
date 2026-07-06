// backend/src/modules/user/user.service.ts
import * as userRepository from './user.repository';
import { hashPassword } from '../../shared/utils/password';

export const getUsers = async (tenantId: number, propertyId?: number) => {
  return userRepository.findUsers(tenantId, propertyId);
};

export const getUserById = async (userId: number, tenantId: number) => {
  const user = await userRepository.findUserById(userId, tenantId);
  if (!user) throw new Error('User not found');
  return user;
};

export const getRoles = async () => {
  return userRepository.findAllRoles();
};

export const createUser = async (data: any, tenantId: number) => {
  // Check for duplicate username/email within the tenant
  const existing = await userRepository.findUserByUsernameOrEmail(data.username, data.email, tenantId);
  if (existing) throw new Error('Username or email already exists in this property.');

  // Hash the password
  const passwordHash = await hashPassword(data.password);

  return userRepository.createUser({
    tenantId,
    propertyId: data.propertyId ? parseInt(data.propertyId) : null,
    fullName: data.fullName,
    username: data.username,
    email: data.email || null,
    passwordHash,
    roleId: parseInt(data.roleId),
    isActive: data.isActive !== undefined ? data.isActive : true,
  });
};

export const updateUser = async (userId: number, data: any, tenantId: number) => {
  const user = await userRepository.findUserById(userId, tenantId);
  if (!user) throw new Error('User not found');

  // Check for duplicates if username/email is changing
  if (data.username || data.email) {
    const existing = await userRepository.findUserByUsernameOrEmail(
      data.username || user.username,
      data.email || user.email,
      tenantId
    );
    if (existing && existing.userId !== userId) {
      throw new Error('Username or email already exists.');
    }
  }

  const updateData: any = {
    fullName: data.fullName,
    username: data.username,
    email: data.email || null,
    roleId: data.roleId ? parseInt(data.roleId) : undefined,
    propertyId: data.propertyId ? parseInt(data.propertyId) : null,
    isActive: data.isActive,
  };

  // ONLY update password if a new one is provided
  if (data.password && data.password.trim() !== '') {
    updateData.passwordHash = await hashPassword(data.password);
  }

  return userRepository.updateUser(userId, updateData);
};

export const deactivateUser = async (userId: number, tenantId: number) => {
  const user = await userRepository.findUserById(userId, tenantId);
  if (!user) throw new Error('User not found');
  return userRepository.deactivateUser(userId);
};