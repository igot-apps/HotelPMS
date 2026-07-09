import * as dashboardRepository from './dashboard.repository';

export const getOperationalOverview = async (tenantId: number, propertyId?: number) => {
  return dashboardRepository.getOperationalOverview(tenantId, propertyId);
};