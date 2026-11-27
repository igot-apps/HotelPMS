import { test, expect } from '@jest/globals';
import { validateFinancialDelegation, financialDecision } from '../src/modules/reservation/financial-delegation';
import { canCorrect } from '../src/modules/reservation/correction-policy';

const receptionist = { userId: 2, isActive: true, role: { roleName: 'Receptionist' }, financialDelegation: {} };
const manager = { userId: 1, isActive: true, role: { roleName: 'Manager' } };

test('no correction needs a manager; receptionists refund and record departures directly', () => {
  expect(canCorrect(receptionist, 'refund')).toBe(true);
  expect(canCorrect(receptionist, 'record-departure')).toBe(false);
  for (const action of ['correct-date', 'credit-checkout', 'correct-payment', 'undo-checkin', 'undo-checkout', 'restore', 'transfer']) expect(canCorrect(receptionist, action)).toBe(true);
  expect(canCorrect(manager, 'record-departure')).toBe(false);
});

test('receptionists extend, shorten and check out with a balance without limits', () => {
  expect(financialDecision(receptionist, 'correct-date', { oldTotal: 200, newTotal: 400, isExtension: true }).canApply).toBe(true);
  expect(financialDecision(receptionist, 'correct-date', { oldTotal: 500, newTotal: 100, isExtension: false }).canApply).toBe(true);
  expect(financialDecision(receptionist, 'credit-checkout', { balance: 5000 }).canApply).toBe(true);
});

test('receptionists and managers correct staff-recorded payments (verified online payments are locked in the correction itself)', () => {
  const payment = { receivedBy: 3, paymentDate: new Date('2026-10-01T10:00:00Z'), amount: 900 };
  expect(financialDecision(receptionist, 'correct-payment', { payment, newAmount: 0 }).canApply).toBe(true);
  expect(financialDecision(receptionist, 'correct-payment', { payment: { ...payment, gatewayReference: 'MOMO-123' }, newAmount: 0 }).canApply).toBe(true);
  expect(financialDecision(manager, 'correct-payment', { payment: { ...payment, gatewayReference: 'RES-1' }, newAmount: 0 }).canApply).toBe(true);
});

test('inactive staff and other roles cannot apply financial corrections', () => {
  expect(financialDecision({ ...receptionist, isActive: false }, 'credit-checkout', { balance: 1 }).canApply).toBe(false);
  expect(financialDecision({ ...receptionist, role: { roleName: 'Housekeeper' } }, 'correct-date', { oldTotal: 1, newTotal: 2 }).canApply).toBe(false);
});

test('delegation settings still validate for older clients', () => {
  expect(() => validateFinancialDelegation({ refund: 100 })).toThrow();
  expect(validateFinancialDelegation({ 'correct-date': 100 })).toEqual({ 'correct-date': 100 });
});
