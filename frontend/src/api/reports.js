import api from '../lib/axios';

// 🌟 The Master Endpoint (Fetches everything in one call)
export const getFullDashboardReport = (params = {}) => {
  return api.get('/reports', { params });
};

// Individual endpoints (if you ever need to refresh just one section)
export const getFinancialSummary = (params = {}) => api.get('/reports/financial', { params });
export const getRevenueTimeSeries = (params = {}) => api.get('/reports/time-series', { params });
export const getCategoryBreakdowns = (params = {}) => api.get('/reports/categories', { params });