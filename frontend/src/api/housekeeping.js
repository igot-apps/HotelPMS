import api from '../lib/axios';

export const getHousekeepingRooms = () => api.get('/housekeeping/rooms');
export const getHousekeepingOverview = () => api.get('/housekeeping/overview');
export const setCleaningStatus = (roomId, status) => api.patch(`/housekeeping/rooms/${roomId}`, { status });
export const startCleaning = (roomId) => api.post(`/housekeeping/rooms/${roomId}/start`);
export const releaseCleaning = (roomId) => api.post(`/housekeeping/rooms/${roomId}/release`);
export const reportRoomIssue = (roomId, issue) => api.post(`/housekeeping/rooms/${roomId}/issues`, issue);

// Reception and managers
export const getOpenRoomIssues = () => api.get('/room-issues');
export const resolveRoomIssue = (issueId, note) => api.post(`/room-issues/${issueId}/resolve`, { note });
