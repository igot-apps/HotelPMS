import api from '../lib/axios';

// Fetch all amenities for the logged-in hotel
export const getAmenities = () => api.get('/amenities');

// Create a new amenity on the fly
export const createAmenity = (data) => api.post('/amenities', data);

// 🌟 NEW: Update an existing amenity (e.g., fix a typo)
export const updateAmenity = (id, data) => api.put(`/amenities/${id}`, data);

// 🌟 NEW: Delete an amenity
export const deleteAmenity = (id) => api.delete(`/amenities/${id}`);