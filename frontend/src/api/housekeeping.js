import api from '../lib/axios';

export const getHousekeepingRooms = () => api.get('/housekeeping/rooms');
export const setCleaningStatus = (roomId, status) => api.patch(`/housekeeping/rooms/${roomId}`, { status });
