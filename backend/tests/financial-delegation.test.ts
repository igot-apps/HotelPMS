import { test, expect } from '@jest/globals';
import { validateFinancialDelegation, financialDecision } from '../src/modules/reservation/financial-delegation';
import { canCorrect } from '../src/modules/reservation/correction-policy';
const user = { userId: 2, isActive: true, role: { roleName: 'Receptionist' }, financialDelegation: { 'correct-date': 100, 'correct-payment': 100, 'credit-checkout': 100 } };
const now = new Date('2026-11-04T01:00:00Z');
test('financial access is off by default and refunds cannot be delegated', () => {
  expect(canCorrect({ ...user, financialDelegation: {} }, 'correct-payment')).toBe(false);
  expect(canCorrect({ ...user, financialDelegation: { refund: 100 } }, 'refund')).toBe(false);
  expect(() => validateFinancialDelegation({ refund: 100 })).toThrow();
  for (const bad of [null, [], { 'correct-date': 0 }, { 'correct-date': '100' }, { 'correct-date': -1 }, { 'correct-date': Infinity }, { 'correct-date': 1.001 }]) expect(() => validateFinancialDelegation(bad)).toThrow();
});
test('charge reductions and booking debt use inclusive cent-accurate limits', () => {
  expect(financialDecision(user, 'correct-date', { oldTotal: 200, newTotal: 100 }).canApply).toBe(true);
  expect(financialDecision(user, 'correct-date', { oldTotal: 200, newTotal: 99.99 }).canApply).toBe(false);
  expect(financialDecision(user, 'correct-date', { oldTotal: 200, newTotal: 500 }).canApply).toBe(true);
  expect(financialDecision(user, 'credit-checkout', { balance: 100 }).canApply).toBe(true);
  expect(financialDecision(user, 'credit-checkout', { balance: 100.01 }).canApply).toBe(false);
});
test('an extension at the agreed rate is direct without financial delegation', () => {
  const receptionist = { ...user, financialDelegation: {} };
  expect(financialDecision(receptionist, 'correct-date', { oldTotal: 200, newTotal: 400, isExtension: true }).canApply).toBe(true);
  expect(financialDecision(receptionist, 'correct-date', { oldTotal: 200, newTotal: 100, isExtension: false }).canApply).toBe(false);
  expect(financialDecision(receptionist, 'correct-date', { oldTotal: 200, newTotal: 100, isExtension: true }).canApply).toBe(false);
  expect(financialDecision({ ...receptionist, isActive: false }, 'correct-date', { oldTotal: 200, newTotal: 400, isExtension: true }).canApply).toBe(false);
});
test('payment delegation requires ownership, hotel-local today and both amounts within limit', () => {
  const payment = { receivedBy: 2, paymentDate: now, amount: 100 };
  const context = { payment, newAmount: 50, timezone: 'America/New_York' };
  expect(financialDecision(user, 'correct-payment', context, now).canApply).toBe(true);
  for (const change of [{ receivedBy: 3 }, { amount: 100.01 }, { gatewayReference: 'RES-booking' }, { paymentDate: new Date('2026-11-03T01:00Z') }]) expect(financialDecision(user, 'correct-payment', { ...context, payment: { ...payment, ...change } }, now).canApply).toBe(false);
  expect(financialDecision(user, 'correct-payment', { ...context, newAmount: 100.01 }, now).canApply).toBe(false);
  expect(financialDecision(user, 'correct-payment', { ...context, payment: { ...payment, paymentDate: new Date('2026-11-03T23:00Z') } }, now).canApply).toBe(true);
});
test('revoked and deactivated access is rejected even with a previous preview', () => {
  expect(financialDecision({ ...user, financialDelegation: {} }, 'credit-checkout', { balance: 1 }).canApply).toBe(false);
  expect(financialDecision({ ...user, isActive: false }, 'credit-checkout', { balance: 1 }).canApply).toBe(false);
});
