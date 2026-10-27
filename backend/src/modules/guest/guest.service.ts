import * as guestRepository from './guest.repository';
import { hashPassword } from '../../shared/utils/password';

export const normalizePropertyGuestPhone = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const input = String(value).trim();
  if (!input) return null;

  const digits = input.replace(/\D/g, '');
  if (!digits) throw new Error('Phone number must contain at least one digit.');

  if (digits.length === 10 && digits.startsWith('0')) {
    return `+233${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith('233')) {
    return `+${digits}`;
  }
  throw new Error('Phone number must be 10 digits, for example 0244123456.');
};

const isUniquePhoneConflict = (error: any) =>
  error?.code === 'P2002' && String(error?.meta?.target || '').includes('phone');

export const createGuest = async (data: any) => {
  // ✅ Replaced tenantId check with propertyId
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.fullName) throw new Error('Full name is required');

  data.phone = normalizePropertyGuestPhone(data.phone);

  if (data.phone) {
    const existingGuest = await guestRepository.findGuestByPhone(data.propertyId, data.phone);
    if (existingGuest) {
      throw new Error(`This phone number already belongs to ${existingGuest.fullName}. Select that guest or correct their profile name.`);
    }
  }

  // Check if guest with same email exists for this property
  if (data.email) {
    const existing = await guestRepository.findGuestByEmail(
      data.propertyId, // ✅ Replaced tenantId
      data.email
    );
    if (existing) {
      throw new Error('Guest with this email already exists for this property');
    }
  }

  // Generate username if not provided
  if (!data.username && data.email) {
    data.username = data.email.split('@')[0];
  }

  // Hash password if provided
  if (data.password) {
    data.passwordHash = await hashPassword(data.password);
    delete data.password;
  }

  try {
    return await guestRepository.createGuest(data);
  } catch (error: any) {
    if (isUniquePhoneConflict(error)) {
      throw new Error('This phone number is already assigned to another guest in this property. Search for that guest instead.');
    }
    throw error;
  }
};

export const lookupGuestByPhone = async (propertyId: number, phone: unknown) => {
  const normalizedPhone = normalizePropertyGuestPhone(phone);
  if (!normalizedPhone) throw new Error('Phone number is required for lookup.');
  return guestRepository.findGuestByPhone(propertyId, normalizedPhone);
};

export const getGuests = async (
  propertyId: number, // ✅ Replaced tenantId
  searchTerm?: string,
  page: number = 1,
  limit: number = 10
) => {
  return guestRepository.findGuests(propertyId, searchTerm, page, limit);
};

export const getGuestById = async (guestId: number) => {
  const guest = await guestRepository.findGuestById(guestId);
  if (!guest) throw new Error('Guest not found');
  return guest;
};

export const getGuestStats = async (guestId: number) => {
  const stats = await guestRepository.getGuestStats(guestId);
  if (!stats) throw new Error('Guest not found');
  return stats;
};

export const getGuestReservations = async (guestId: number) => {
  const guest = await guestRepository.findGuestById(guestId);
  if (!guest) throw new Error('Guest not found');
  return guestRepository.getGuestReservations(guestId);
};

export const updateGuest = async (guestId: number, data: any) => {
  const guest = await guestRepository.findGuestById(guestId);
  if (!guest) throw new Error('Guest not found');

  if (Object.prototype.hasOwnProperty.call(data, 'phone')) {
    data.phone = normalizePropertyGuestPhone(data.phone);
  }

  if (data.phone) {
    const matchingGuest = await guestRepository.findGuestByPhone(guest.propertyId, data.phone);
    if (matchingGuest && matchingGuest.guestId !== guestId) {
      throw new Error(`This phone number already belongs to ${matchingGuest.fullName}. Select that guest instead.`);
    }
  }

  // Hash password if provided
  if (data.password) {
    data.passwordHash = await hashPassword(data.password);
    delete data.password;
  }

  try {
    return await guestRepository.updateGuest(guestId, data);
  } catch (error: any) {
    if (isUniquePhoneConflict(error)) {
      throw new Error('This phone number is already assigned to another guest in this property.');
    }
    throw error;
  }
};

export const deleteGuest = async (guestId: number) => {
  const guest = await guestRepository.findGuestById(guestId);
  if (!guest) throw new Error('Guest not found');
  return guestRepository.deleteGuest(guestId);
};

export const searchGuests = async (
  propertyId: number, // ✅ Replaced tenantId
  searchTerm: string,
  page: number = 1,
  limit: number = 10
) => {
  if (!searchTerm || searchTerm.length < 2) {
    throw new Error('Search term must be at least 2 characters');
  }
  return guestRepository.findGuests(propertyId, searchTerm, page, limit);
};
