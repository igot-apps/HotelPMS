import api from '../lib/axios';

export const getPlatformProperties = (params = {}) => api.get('/platform/properties', { params });
export const createPlatformProperty = (data) => api.post('/platform/properties', data);
export const updatePlatformProperty = (id, data) => api.put(`/platform/properties/${id}`, data);
export const getWebsiteDomains = (id) => api.get(`/platform/properties/${id}/website-domains`);
export const addWebsiteDomain = (id, hostname) => api.post(`/platform/properties/${id}/website-domains`, { hostname });
export const checkWebsiteDomain = (id, domainId) => api.post(`/platform/properties/${id}/website-domains/${domainId}/check`);
export const setWebsiteDomainActive = (id, domainId, isActive) => api.patch(`/platform/properties/${id}/website-domains/${domainId}`, { isActive });
export const setWebsiteDomainAutoActivate = (id, domainId, autoActivate) => api.patch(`/platform/properties/${id}/website-domains/${domainId}`, { autoActivate });
export const removeWebsiteDomain = (id, domainId) => api.delete(`/platform/properties/${id}/website-domains/${domainId}`);
export const deactivatePlatformProperty = (id) => api.delete(`/platform/properties/${id}`);
export const permanentlyDeletePlatformProperty = ({ id, confirmationCode }) =>
  api.delete(`/platform/properties/${id}/permanent`, { data: { confirmationCode } });
