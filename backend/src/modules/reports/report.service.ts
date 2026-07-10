import * as reportRepository from './report.repository';

// Helper to get default date range (Current Month)
const getDefaultDates = () => {
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st day of current month
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
  return { startDate, endDate };
};

// ==========================================
// 1. FINANCIAL SUMMARY SERVICE
// ==========================================
export const getFinancialSummary = async (
  propertyId: number, // ✅ REMOVED tenantId
  startDate?: string,
  endDate?: string
) => {
  const start = startDate ? new Date(startDate) : getDefaultDates().startDate;
  const end = endDate ? new Date(endDate) : getDefaultDates().endDate;
  if (start > end) throw new Error('Start date must be before or equal to end date');
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
  const start = startDate ? new Date(startDate) : getDefaultDates().startDate;
  const end = endDate ? new Date(endDate) : getDefaultDates().endDate;
  if (start > end) throw new Error('Start date must be before or equal to end date');
  return reportRepository.getRevenueTimeSeries(propertyId, start, end);
};

// ==========================================
// 3. CATEGORY BREAKDOWNS SERVICE
// ==========================================
export const getCategoryBreakdowns = async (
  propertyId: number, // ✅ REMOVED tenantId
  startDate?: string,
  endDate?: string
) => {
  const start = startDate ? new Date(startDate) : getDefaultDates().startDate;
  const end = endDate ? new Date(endDate) : getDefaultDates().endDate;
  if (start > end) throw new Error('Start date must be before or equal to end date');
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
  const start = startDate ? new Date(startDate) : getDefaultDates().startDate;
  const end = endDate ? new Date(endDate) : getDefaultDates().endDate;
  if (start > end) throw new Error('Start date must be before or equal to end date');

  // Fetch all data simultaneously
  const [financials, timeSeries, categories] = await Promise.all([
    reportRepository.getFinancialSummary(propertyId, start, end),
    reportRepository.getRevenueTimeSeries(propertyId, start, end),
    reportRepository.getCategoryBreakdowns(propertyId, start, end),
  ]);

  return {
    summary: financials,
    timeSeries,
    categories,
  };
};