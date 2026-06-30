import api from '../lib/axios';

export const getProperties = (params = {}) => {
  return api.get('/properties', { params });
};

export const createProperty = (data) => {
  return api.post('/properties', data);
};

export const updateProperty = (id, data) => {
  return api.put(`/properties/${id}`, data);
};

export const deleteProperty = (id) => {
  return api.delete(`/properties/${id}`);
};