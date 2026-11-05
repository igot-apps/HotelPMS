import api from '../lib/axios';

export const getNotifications = () => api.get('/notifications');
export const setSmsSimulation = enabled => api.patch('/notifications/settings', { enabled });
