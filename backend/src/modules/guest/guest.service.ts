import * as guestRepository from './guest.repository';
import { hashPassword } from '../../shared/utils/password';

export const createGuest = async (data: any) => {
  // ✅ Replaced tenantId check with propertyId
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.fullName) throw new Error('Full name is required');

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

  return guestRepository.createGuest(data);
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

  // Hash password if provided
  if (data.password) {
    data.passwordHash = await hashPassword(data.password);
    delete data.password;
  }

  return guestRepository.updateGuest(guestId, data);
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