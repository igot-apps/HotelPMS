import api from '../lib/axios';

// Dashboard endpoints
export const getDailySummary = (propertyId, date) => {
  return api.get('/reports/daily-summary', { params: { propertyId, date } });
};

export const getRecentReservations = (propertyId, limit = 5) => {
  return api.get('/reservations', { params: { propertyId, limit } });
};

// Comprehensive Analytics endpoints
export const getOccupancyReport = (propertyId, fromDate, toDate) => {
  return api.get('/reports/occupancy', { params: { propertyId, fromDate, toDate } });
};

export const getRevenueReport = (propertyId, fromDate, toDate) => {
  return api.get('/reports/revenue', { params: { propertyId, fromDate, toDate } });
};

export const getReservationReport = (propertyId, fromDate, toDate) => {
  return api.get('/reports/reservations', { params: { propertyId, fromDate, toDate } });
};

export const getGuestReport = (propertyId, fromDate, toDate) => {
  return api.get('/reports/guests', { params: { propertyId, fromDate, toDate } });
};

// NEW: Monthly Summary for Daily Trends Chart
export const getMonthlySummary = (propertyId, month, year) => {
  return api.get('/reports/monthly-summary', { params: { propertyId, month, year } });
};