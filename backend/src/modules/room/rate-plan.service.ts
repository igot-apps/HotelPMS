import * as ratePlanRepository from './rate-plan.repository';

export const createRatePlan = async (data: any) => {
  if (!data.tenantId) throw new Error('Tenant ID is required');
  if (!data.propertyId) throw new Error('Property ID is required');
  if (!data.roomTypeId) throw new Error('Room type ID is required');
  if (!data.planName) throw new Error('Plan name is required');

  return ratePlanRepository.createRatePlan(data);
};

export const getRatePlans = async (
  tenantId?: number,
  propertyId?: number,
  roomTypeId?: number,
  page: number = 1,
  limit: number = 10
) => {
  return ratePlanRepository.findRatePlans(tenantId, propertyId, roomTypeId, page, limit);
};

export const getRatePlanById = async (ratePlanId: number) => {
  const ratePlan = await ratePlanRepository.findRatePlanById(ratePlanId);
  if (!ratePlan) throw new Error('Rate plan not found');
  return ratePlan;
};

export const updateRatePlan = async (ratePlanId: number, data: any) => {
  const ratePlan = await ratePlanRepository.findRatePlanById(ratePlanId);
  if (!ratePlan) throw new Error('Rate plan not found');
  return ratePlanRepository.updateRatePlan(ratePlanId, data);
};

export const deleteRatePlan = async (ratePlanId: number) => {
  const ratePlan = await ratePlanRepository.findRatePlanById(ratePlanId);
  if (!ratePlan) throw new Error('Rate plan not found');
  return ratePlanRepository.deleteRatePlan(ratePlanId);
};