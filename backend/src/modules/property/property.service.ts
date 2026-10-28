import * as propertyRepository from './property.repository';

export const createProperty = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyName) throw new Error('Property name is required');
  if (!data.propertyCode) throw new Error('Property code is required');
  
  return propertyRepository.createProperty(data);
};

export const getProperties = async (
  page: number = 1,
  limit: number = 10,
  propertyId?: number
) => {
  return propertyRepository.findProperties(page, limit, propertyId);
};

export const getPlatformProperties = async (page: number, limit: number, search: string) => {
  return propertyRepository.findPlatformProperties(page, limit, search);
};

export const getPropertyById = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');
  return property;
};

// ✅ Renamed from getPropertiesByTenant
export const getAllActiveProperties = async (propertyId?: number) => {
  return propertyRepository.findAllActiveProperties(propertyId);
};

export const getPropertyStats = async (propertyId: number) => {
  const stats = await propertyRepository.getPropertyStats(propertyId);
  if (!stats) throw new Error('Property not found');
  return stats;
};

export const updateProperty = async (propertyId: number, data: any) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');
  return propertyRepository.updateProperty(propertyId, data);
};

export const deleteProperty = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');
  return propertyRepository.deleteProperty(propertyId);
};
