import api from '../lib/axios';

export const getNotifications = () => api.get('/notifications');
export const setSmsSimulation = enabled => api.patch('/notifications/settings', { enabled });
export const checkSmsStatus = messageId => api.post(`/notifications/${messageId}/status`);
