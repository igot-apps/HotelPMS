import * as reportRepository from './report.repository';
import { prisma } from '../../shared/utils/prisma';
import { dayBounds, hotelDate } from './daily-overview.service';

// A report period as whole hotel days: from the start of the first day to the end of the last day
// (inclusive), in the hotel's time zone. Defaults to the current month.
async function hotelRange(propertyId: number, startDate?: string, endDate?: string) {
  const hotel = await prisma.property.findUnique({ where: { propertyId }, select: { timezone: true } });
  const timeZone = hotel?.timezone || 'Africa/Accra';
  const today = hotelDate(new Date(), timeZone);
  const from = startDate || `${today.slice(0, 8)}01`;
  const to = endDate || today;
  const start = dayBounds(from, timeZone).gte;
  const end = new Date(dayBounds(to, timeZone).lt.getTime() - 1);
  if (start > end) throw new Error('Start date must be before or equal to end date');
  return { start, end, timeZone };
}


// ==========================================
// 1. FINANCIAL SUMMARY SERVICE
// ==========================================
export const getFinancialSummary = async (
  propertyId: number, // ✅ REMOVED tenantId
  startDate?: string,
  endDate?: string
) => {
  const { start, end } = await hotelRange(propertyId, startDate, endDate);
  return reportRepository.getFinancialSummary(propertyId, start, end);
};

// ==========================================
// 2. TIME-SERIES SERVICE (For Charts)
// ==========================================
export const getRevenueTimeSeries = async (
  propertyId: number, // ✅ REMOVED tenantId
  startDate?: string,
  endDate?: string
) => {
  const { start, end, timeZone } = await hotelRange(propertyId, startDate, endDate);
  return reportRepository.getRevenueTimeSeries(propertyId, start, end, timeZone);
};

// ==========================================
// 3. CATEGORY BREAKDOWNS SERVICE
// ==========================================
export const getCategoryBreakdowns = async (
  propertyId: number, // ✅ REMOVED tenantId
  startDate?: string,
  endDate?: string
) => {
  const { start, end } = await hotelRange(propertyId, startDate, endDate);
  return reportRepository.getCategoryBreakdowns(propertyId, start, end);
};

// ==========================================
// 🌟 4. THE "ONE-CALL" DASHBOARD AGGREGATOR
// ==========================================
export const getFullDashboardReport = async (
  propertyId: number, // ✅ REMOVED tenantId
  startDate?: string,
  endDate?: string
) => {
  const { start, end, timeZone } = await hotelRange(propertyId, startDate, endDate);

  // Fetch all data simultaneously
  const [financials, timeSeries, categories] = await Promise.all([
    reportRepository.getFinancialSummary(propertyId, start, end),
    reportRepository.getRevenueTimeSeries(propertyId, start, end, timeZone),
    reportRepository.getCategoryBreakdowns(propertyId, start, end),
  ]);

  return {
    summary: financials,
    timeSeries,
    categories,
  };
};