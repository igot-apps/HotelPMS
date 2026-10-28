import api from '../lib/axios';

export const getPlatformProperties = (params = {}) => api.get('/platform/properties', { params });
export const createPlatformProperty = (data) => api.post('/platform/properties', data);
export const updatePlatformProperty = (id, data) => api.put(`/platform/properties/${id}`, data);
export const deactivatePlatformProperty = (id) => api.delete(`/platform/properties/${id}`);
