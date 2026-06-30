import api from '../lib/axios';

export const getRatePlans = (params = {}) => {
  return api.get('/rooms/rate-plans', { params });
};

export const createRatePlan = (data) => {
  return api.post('/rooms/rate-plans', data);
};

export const updateRatePlan = (id, data) => {
  return api.put(`/rooms/rate-plans/${id}`, data);
};

export const deleteRatePlan = (id) => {
  return api.delete(`/rooms/rate-plans/${id}`);
};