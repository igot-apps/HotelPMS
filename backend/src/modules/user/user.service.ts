import * as userRepository from './user.repository';
import { hashPassword } from '../../shared/utils/password';

export const getUsers = async (
  propertyId?: number, // ✅ Removed tenantId
  page: number = 1,
  limit: number = 10
) => {
  return userRepository.findUsers(propertyId, page, limit);
};

export const getUserById = async (userId: number) => {
  const user = await userRepository.findUserById(userId);
  if (!user) throw new Error('User not found');
  return user;
};

export const getRoles = async () => {
  return userRepository.findAllRoles();
};

export const createUser = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.fullName) throw new Error('Full name is required');
  if (!data.username) throw new Error('Username is required');
  if (!data.password) throw new Error('Password is required');
  if (!data.roleId) throw new Error('Role ID is required');

  // Check for duplicates scoped to property
  const existing = await userRepository.findUserByUsernameOrEmail(
    data.username,
    data.email || null,
    data.propertyId // ✅ Removed tenantId
  );
  if (existing) {
    throw new Error('Username or email already exists for this property.');
  }

  const passwordHash = await hashPassword(data.password);

  return userRepository.createUser({
    propertyId: data.propertyId, // ✅ Removed tenantId
    fullName: data.fullName,
    username: data.username,
    email: data.email || null,
    passwordHash,
    roleId: parseInt(data.roleId),
    isActive: data.isActive !== undefined ? data.isActive : true,
  });
};

export const updateUser = async (userId: number, data: any) => {
  const user = await userRepository.findUserById(userId);
  if (!user) throw new Error('User not found');

  // Check for duplicates if username/email is changing
  if (data.username || data.email) {
    const existing = await userRepository.findUserByUsernameOrEmail(
      data.username || user.username,
      data.email || user.email,
      user.propertyId // ✅ Use user's current propertyId for duplicate check
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
    propertyId: data.propertyId ? parseInt(data.propertyId) : undefined, // ✅ FIXED: Only passes a number or undefined (never null)
    isActive: data.isActive !== undefined ? data.isActive : undefined,
  };

  if (data.password) {
    updateData.passwordHash = await hashPassword(data.password);
  }

  return userRepository.updateUser(userId, updateData);
};

export const deactivateUser = async (userId: number) => {
  const user = await userRepository.findUserById(userId);
  if (!user) throw new Error('User not found');
  return userRepository.deactivateUser(userId);
};