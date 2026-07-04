import api from '../lib/axios';

// ==========================================
// PHYSICAL ROOMS
// ==========================================

// Fetch all rooms (Backwards compatible: accepts either an object or propertyId)
export const getRooms = (paramsOrPropertyId, filters = {}) => {
  let params = {};
  if (typeof paramsOrPropertyId === 'object') {
    params = paramsOrPropertyId;
  } else {
    params = { propertyId: paramsOrPropertyId, ...filters };
  }
  return api.get('/rooms', { params });
};

// Fetch a single room by ID
export const getRoomById = (id) => {
  return api.get(`/rooms/${id}`);
};

// Create a new physical room (Manager only)
export const createRoom = (data) => {
  return api.post('/rooms', data);
};

// Update an existing physical room (Manager only)
export const updateRoom = (id, data) => {
  return api.put(`/rooms/${id}`, data);
};

// Delete (deactivate) a physical room (Manager only)
export const deleteRoom = (id) => {
  return api.delete(`/rooms/${id}`);
};

// Update room status (Housekeeping/Receptionist)
export const updateRoomStatus = (id, statusData) => {
  return api.patch(`/rooms/${id}/status`, statusData);
};

// Fetch rooms available for specific dates
export const getAvailableRooms = (checkInDate, checkOutDate, propertyId) => {
  return api.get(`/rooms/available?checkInDate=${checkInDate}&checkOutDate=${checkOutDate}&propertyId=${propertyId}`);
};

// ==========================================
// ROOM TYPES (Categories & Base Pricing)
// ==========================================

// Fetch all room types
export const getRoomTypes = (params = {}) => {
  return api.get('/rooms/types', { params });
};

// Fetch a single room type by ID
export const getRoomTypeById = (id) => {
  return api.get(`/rooms/types/${id}`);
};

// Fetch stats for a room type
export const getRoomTypeStats = (id) => {
  return api.get(`/rooms/types/${id}/stats`);
};

// Create a new room type (Manager only)
export const createRoomType = (data) => {
  return api.post('/rooms/types', data);
};

// Update an existing room type (Manager only)
export const updateRoomType = (id, data) => {
  return api.put(`/rooms/types/${id}`, data);
};

// Delete a room type (Manager only)
export const deleteRoomType = (id) => {
  return api.delete(`/rooms/types/${id}`);
};