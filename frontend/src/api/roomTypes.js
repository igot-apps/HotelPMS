import api from '../lib/axios';

export const getRoomTypes = (params = {}) => {
  return api.get('/rooms/types', { params });
};

export const createRoomType = (data) => {
  return api.post('/rooms/types', data);
};

export const updateRoomType = (id, data) => {
  return api.put(`/rooms/types/${id}`, data);
};

export const deleteRoomType = (id) => {
  return api.delete(`/rooms/types/${id}`);
};