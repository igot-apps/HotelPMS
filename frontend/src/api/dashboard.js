import api from '../lib/axios';

export const getOperationalOverview = (params = {}) => {
  return api.get('/dashboard/overview', { params });
};