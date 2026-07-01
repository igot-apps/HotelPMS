import * as tenantRepository from './tenant.repository';
import { createTenantSchema } from '../../shared/utils/validation';

export const createTenant = async (data: any) => {
  // Validate data
  const result = createTenantSchema.safeParse(data);
  if (!result.success) {
    throw new Error('Validation failed: ' + result.error.message);
  }

  // Check if tenant code already exists
  const existing = await tenantRepository.findTenantByCode(data.tenantCode);
  if (existing) {
    throw new Error('Tenant code already exists');
  }

  return tenantRepository.createTenant(data);
};

export const getTenants = async (page: number = 1, limit: number = 10) => {
  return tenantRepository.findTenants(page, limit);
};

export const getTenantById = async (tenantId: number) => {
  const tenant = await tenantRepository.findTenantById(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }
  return tenant;
};

export const getTenantStats = async (tenantId: number) => {
  const stats = await tenantRepository.getTenantStats(tenantId);
  if (!stats) {
    throw new Error('Tenant not found');
  }
  return stats;
};

export const updateTenant = async (tenantId: number, data: any) => {
  const tenant = await tenantRepository.findTenantById(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  return tenantRepository.updateTenant(tenantId, data);
};

export const deleteTenant = async (tenantId: number) => {
  const tenant = await tenantRepository.findTenantById(tenantId);
  if (!tenant) {
    throw new Error('Tenant not found');
  }

  return tenantRepository.deleteTenant(tenantId);
};