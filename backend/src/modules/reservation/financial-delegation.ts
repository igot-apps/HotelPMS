import { hotelDate } from '../reports/daily-overview.service';
export const FINANCIAL_ACTIONS = ['correct-date', 'correct-payment', 'credit-checkout'];
export function validateFinancialDelegation(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose valid financial delegation limits.');
  const result: Record<string, number> = {};
  for (const [action, limit] of Object.entries(input)) {
    if (!FINANCIAL_ACTIONS.includes(action) || typeof limit !== 'number' || !Number.isFinite(limit) || limit <= 0 || limit > 99999999.99 || Math.round(limit * 100) / 100 !== limit) throw new Error('Enter a positive limit with at most two decimal places for each delegated financial action.');
    result[action] = limit;
  }
  return result;
}
export function delegationLimit(user: any, action: string): number | null {
  const value = user.financialDelegation?.[action];
  return FINANCIAL_ACTIONS.includes(action) && typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
export function financialDecision(user: any, action: string, context: { oldTotal?: number; newTotal?: number; balance?: number; payment?: any; newAmount?: number; timezone?: string }, now = new Date()) {
  if (user.isActive && user.role?.roleName === 'Manager') return { canApply: true, delegationReason: '' };
  const limit = delegationLimit(user, action);
  let allowed = user.isActive && user.role?.roleName === 'Receptionist' && limit !== null;
  if (allowed && action === 'correct-date') allowed = Number.isFinite(context.oldTotal) && Number.isFinite(context.newTotal) && Math.round(Math.max(0, context.oldTotal! - context.newTotal!) * 100) <= Math.round(limit! * 100);
  if (allowed && action === 'credit-checkout') allowed = Number.isFinite(context.balance) && context.balance! >= 0 && Math.round(context.balance! * 100) <= Math.round(limit! * 100);
  if (allowed && action === 'correct-payment') {
    const p = context.payment;
    allowed = Boolean(p && p.receivedBy === user.userId && !p.gatewayReference?.startsWith('RES-') && hotelDate(new Date(p.paymentDate), context.timezone || 'Africa/Accra') === hotelDate(now, context.timezone || 'Africa/Accra') && Number.isFinite(context.newAmount) && Math.max(Number(p.amount), context.newAmount!) <= limit!);
  }
  return { canApply: Boolean(allowed), delegationReason: allowed ? `Within your delegated limit of GHS ${limit!.toFixed(2)}.` : 'Manager approval required: this correction is outside your delegated limits or payment ownership/date rules.' };
}
