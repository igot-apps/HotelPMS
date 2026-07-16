import api from '../lib/axios';

// Fetch all amenities for the logged-in hotel
export const getAmenities = () => api.get('/amenities');

// Create a new amenity on the fly
export const createAmenity = (data) => api.post('/amenities', data);