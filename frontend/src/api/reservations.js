import api from '../lib/axios';

export const getReservations = (params = {}) => {
  return api.get('/reservations', { params });
};

export const createReservation = (data) => {
  return api.post('/reservations', data);
};

export const checkInReservation = (id) => {
  return api.post(`/reservations/${id}/check-in`);
};

export const checkOutReservation = (id) => {
  return api.post(`/reservations/${id}/check-out`);
};

export const cancelReservation = (id) => {
  return api.delete(`/reservations/${id}`);
};

// Get full details of a single reservation
export const getReservationById = (id) => {
  return api.get(`/reservations/${id}`);
};

// Get financial and stay stats for a specific reservation
export const getReservationStats = (id) => {
  return api.get(`/reservations/${id}/stats`);
};

// Update reservation details (e.g., notes, source)
export const updateReservation = (id, data) => {
  return api.put(`/reservations/${id}`, data);
};

// Get reservations overlapping a specific date range (For Calendar)
export const getReservationsByDateRange = (fromDate, toDate, propertyId) => {
  return api.get('/reservations/date-range', { params: { fromDate, toDate, propertyId } });
};

   export const updateReservationRoomStatus = (reservationRoomId, data) => 
     api.patch(`/reservations/rooms/${reservationRoomId}/status`, data);

   export const extendReservationRoom = (reservationRoomId, newCheckOutDate) => 
  api.patch(`/reservations/rooms/${reservationRoomId}/extend`, { newCheckOutDate });