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
// Front desk rule: receptionists handle stay dates (unused nights only — enforced in the
// correction itself), checkout with a balance owing and manual payment corrections directly.
// Only refunds and recorded (backdated) departures need a manager, plus corrections to online
// gateway payments, whose records must match the payment provider.
export function financialDecision(user: any, action: string, context: { oldTotal?: number; newTotal?: number; isExtension?: boolean; balance?: number; payment?: any; newAmount?: number; timezone?: string }, _now = new Date()) {
  if (!user.isActive) return { canApply: false, delegationReason: 'An active staff account is required.' };
  if (user.role?.roleName === 'Manager') return { canApply: true, delegationReason: '' };
  if (user.role?.roleName !== 'Receptionist') return { canApply: false, delegationReason: 'Front desk staff required.' };
  if (action === 'correct-payment' && context.payment?.gatewayReference) return { canApply: false, delegationReason: 'Online payments must match the payment provider, so a manager corrects them.' };
  // A manager may cap how much a receptionist can let a guest leave owing (Staff settings).
  const creditLimit = action === 'credit-checkout' ? delegationLimit(user, action) : null;
  if (creditLimit !== null && Number(context.balance || 0) > creditLimit + 0.001) {
    return { canApply: false, delegationReason: `The guest owes GHS ${Number(context.balance).toFixed(2)}, above your limit of GHS ${creditLimit.toFixed(2)} for checkout with money owing. Ask a manager to check the guest out, or take a payment first.` };
  }
  return { canApply: FINANCIAL_ACTIONS.includes(action) || action === 'correct-payment', delegationReason: '' };
}
