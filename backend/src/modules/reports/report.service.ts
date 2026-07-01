import * as reportRepository from './report.repository';
import { getPropertyById } from '../property/property.service';

export const getOccupancyReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from >= to) {
    throw new Error('From date must be before to date');
  }

  // Validate property belongs to tenant
  const property = await getPropertyById(propertyId);
  if (property.tenantId !== tenantId) {
    throw new Error('Property not found for this tenant');
  }

  return reportRepository.getOccupancyReport(tenantId, propertyId, from, to);
};

export const getRevenueReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from >= to) {
    throw new Error('From date must be before to date');
  }

  const property = await getPropertyById(propertyId);
  if (property.tenantId !== tenantId) {
    throw new Error('Property not found for this tenant');
  }

  return reportRepository.getRevenueReport(tenantId, propertyId, from, to);
};

export const getReservationReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from >= to) {
    throw new Error('From date must be before to date');
  }

  const property = await getPropertyById(propertyId);
  if (property.tenantId !== tenantId) {
    throw new Error('Property not found for this tenant');
  }

  return reportRepository.getReservationReport(tenantId, propertyId, from, to);
};

export const getGuestReport = async (
  tenantId: number,
  propertyId: number,
  fromDate: string,
  toDate: string
) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);

  if (from >= to) {
    throw new Error('From date must be before to date');
  }

  const property = await getPropertyById(propertyId);
  if (property.tenantId !== tenantId) {
    throw new Error('Property not found for this tenant');
  }

  return reportRepository.getGuestReport(tenantId, propertyId, from, to);
};

export const getDailySummary = async (
  tenantId: number,
  propertyId: number,
  date: string
) => {
  const targetDate = new Date(date);
  
  const property = await getPropertyById(propertyId);
  if (property.tenantId !== tenantId) {
    throw new Error('Property not found for this tenant');
  }

  return reportRepository.getDailySummary(tenantId, propertyId, targetDate);
};

export const getMonthlySummary = async (
  tenantId: number,
  propertyId: number,
  month: number,
  year: number
) => {
  if (month < 1 || month > 12) {
    throw new Error('Month must be between 1 and 12');
  }

  if (year < 2000 || year > 2100) {
    throw new Error('Year must be between 2000 and 2100');
  }

  const property = await getPropertyById(propertyId);
  if (property.tenantId !== tenantId) {
    throw new Error('Property not found for this tenant');
  }

  return reportRepository.getMonthlySummary(tenantId, propertyId, month, year);
};