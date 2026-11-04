import { test, expect } from '@jest/globals';
import { canCorrect, validateCorrectionPermissions, CORRECTION_ACTIONS, DEFAULT_RECEPTIONIST_CORRECTIONS } from '../src/modules/reservation/correction-policy';

test('default receptionist access allows every room correction and no financial action', () => {
  const user = { isActive: true, role: { roleName: 'Receptionist' }, correctionPermissions: DEFAULT_RECEPTIONIST_CORRECTIONS };
  for (const item of CORRECTION_ACTIONS) expect(canCorrect(user, item.action)).toBe(item.delegatable);
  expect(canCorrect({ ...user, correctionPermissions: [] }, 'restore')).toBe(false);
});
test('receptionists start with no direct corrections; granting one never grants financial corrections', () => {
  const user = { isActive: true, role: { roleName: 'Receptionist' }, correctionPermissions: ['undo-checkin', 'correct-payment', 'credit-checkout'] };
  expect(canCorrect(user, 'undo-checkin')).toBe(true);
  expect(canCorrect(user, 'undo-checkout')).toBe(false);
  expect(canCorrect(user, 'correct-payment')).toBe(false);
  expect(canCorrect(user, 'credit-checkout')).toBe(false);
  expect(canCorrect({ ...user, correctionPermissions: [] }, 'undo-checkin')).toBe(false);
});
test('deactivated staff and unknown roles cannot correct; managers can perform known actions', () => {
  for (const item of CORRECTION_ACTIONS) {
    expect(canCorrect({ isActive: true, role: { roleName: 'Manager' } }, item.action)).toBe(true);
    expect(canCorrect({ isActive: false, role: { roleName: 'Manager' } }, item.action)).toBe(false);
    expect(canCorrect({ isActive: true, role: { roleName: 'Other' }, correctionPermissions: [item.action] }, item.action)).toBe(false);
  }
  expect(canCorrect({ isActive: true, role: { roleName: 'Manager' } }, 'unknown')).toBe(false);
});
test('permission input rejects blanket and financial grants', () => {
  for (const input of [null, 'all', ['*'], ['correct-payment'], ['correct-date'], ['credit-checkout'], [1]]) expect(() => validateCorrectionPermissions(input)).toThrow();
  expect(validateCorrectionPermissions(['restore', 'restore'])).toEqual(['restore']);
  expect(validateCorrectionPermissions([])).toEqual([]);
});
