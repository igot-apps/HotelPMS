import api from '../lib/axios';

export const getHousekeepingRooms = () => api.get('/housekeeping/rooms');
export const getHousekeepingOverview = () => api.get('/housekeeping/overview');
export const setCleaningStatus = (roomId, status) => api.patch(`/housekeeping/rooms/${roomId}`, { status });
