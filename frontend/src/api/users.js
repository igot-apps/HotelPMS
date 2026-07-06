// frontend/src/api/users.js
import api from '../lib/axios';

export const getUsers = (params = {}) => api.get('/users', { params });
export const getUserById = (id) => api.get(`/users/${id}`);
export const createUser = (data) => api.post('/users', data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data);
export const deactivateUser = (id) => api.delete(`/users/${id}`);

// 🚨 NEW: For the Role dropdown in the User Modal
export const getRoles = () => api.get('/users/roles');