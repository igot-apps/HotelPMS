import api from '../lib/axios';

// Fetch guests with pagination and search
export const getGuests = (params = {}) => {
  return api.get('/guests', { params });
};

// Create a new guest
export const createGuest = (guestData) => {
  return api.post('/guests', guestData);
};

// Update an existing guest
export const updateGuest = (id, guestData) => {
  return api.put(`/guests/${id}`, guestData);
};

// Delete (soft delete) a guest
export const deleteGuest = (id) => {
  return api.delete(`/guests/${id}`);
};