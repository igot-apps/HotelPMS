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