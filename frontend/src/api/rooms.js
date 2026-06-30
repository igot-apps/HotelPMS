import api from '../lib/axios';

// Fetch all rooms for a specific property
export const getRooms = (propertyId, filters = {}) => {
  const queryParams = new URLSearchParams({ propertyId, limit: 100, ...filters }).toString();
  return api.get(`/rooms?${queryParams}`);
};

// Update room status (Housekeeping or Operational)
export const updateRoomStatus = (roomId, statusData) => {
  return api.patch(`/rooms/${roomId}/status`, statusData);
};