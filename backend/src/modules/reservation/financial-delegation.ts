export const FINANCIAL_ACTIONS = ['correct-date', 'credit-checkout'];
export const DEFAULT_MANUAL_PAYMENT_CORRECTION_LIMIT = 100;
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
// Front desk rule: managers and receptionists apply stay-date changes (unused nights only — enforced in
// the correction itself), checkout with a balance owing and manual payment corrections directly, each
// audited. Provider-verified payments are protected separately: nobody can edit them.
export function financialDecision(user: any, action: string, _context: { oldTotal?: number; newTotal?: number; isExtension?: boolean; balance?: number; payment?: any; newAmount?: number; timezone?: string } = {}, _now = new Date()) {
  if (!user.isActive) return { canApply: false, delegationReason: 'An active staff account is required.' };
  if (user.role?.roleName === 'Manager') return { canApply: true, delegationReason: '' };
  if (user.role?.roleName !== 'Receptionist') return { canApply: false, delegationReason: 'Front desk staff required.' };
  return { canApply: FINANCIAL_ACTIONS.includes(action) || action === 'correct-payment', delegationReason: '' };
}
