import * as propertyRepository from './property.repository';

export const createProperty = async (data: any) => {
  // Validate required fields
  if (!data.tenantId) {
    throw new Error('Tenant ID is required');
  }
  if (!data.propertyName) {
    throw new Error('Property name is required');
  }
  if (!data.propertyCode) {
    throw new Error('Property code is required');
  }

  return propertyRepository.createProperty(data);
};

export const getProperties = async (
  tenantId?: number,
  page: number = 1,
  limit: number = 10
) => {
  return propertyRepository.findProperties(tenantId, page, limit);
};

export const getPropertyById = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) {
    throw new Error('Property not found');
  }
  return property;
};

export const getPropertiesByTenant = async (tenantId: number) => {
  return propertyRepository.findPropertiesByTenant(tenantId);
};

export const getPropertyStats = async (propertyId: number) => {
  const stats = await propertyRepository.getPropertyStats(propertyId);
  if (!stats) {
    throw new Error('Property not found');
  }
  return stats;
};

export const updateProperty = async (propertyId: number, data: any) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) {
    throw new Error('Property not found');
  }

  return propertyRepository.updateProperty(propertyId, data);
};

export const deleteProperty = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) {
    throw new Error('Property not found');
  }

  return propertyRepository.deleteProperty(propertyId);
};