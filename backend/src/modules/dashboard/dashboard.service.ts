import * as dashboardRepository from './dashboard.repository';

export const getOperationalOverview = async (propertyId: number) => { // ✅ REMOVED tenantId
  return dashboardRepository.getOperationalOverview(propertyId);
};