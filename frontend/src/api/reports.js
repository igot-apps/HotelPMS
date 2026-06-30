import api from '../lib/axios';

// Fetch Daily Summary for the dashboard stats
export const getDailySummary = (propertyId, date) => {
  return api.get(`/reports/daily-summary?propertyId=${propertyId}&date=${date}`);
};

// Fetch Recent Reservations for the dashboard table
export const getRecentReservations = (propertyId, limit = 5) => {
  return api.get(`/reservations?propertyId=${propertyId}&limit=${limit}`);
};