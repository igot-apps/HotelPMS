import { test, expect } from '@jest/globals';
import { canCorrect, validateCorrectionPermissions, CORRECTION_ACTIONS, DEFAULT_RECEPTIONIST_CORRECTIONS } from '../src/modules/reservation/correction-policy';

test('receptionists apply every correction directly (no manager-only actions)', () => {
  const user = { isActive: true, role: { roleName: 'Receptionist' }, correctionPermissions: DEFAULT_RECEPTIONIST_CORRECTIONS };
  for (const item of CORRECTION_ACTIONS) expect(canCorrect(user, item.action)).toBe(true);
  expect(canCorrect({ ...user, correctionPermissions: [] }, 'restore')).toBe(true);
});
test('active receptionists can apply room and financial corrections, including recording a departure', () => {
  const user = { isActive: true, role: { roleName: 'Receptionist' }, correctionPermissions: ['undo-checkin', 'correct-payment', 'credit-checkout'] };
  expect(canCorrect(user, 'undo-checkin')).toBe(true);
  expect(canCorrect(user, 'undo-checkout')).toBe(true);
  expect(canCorrect(user, 'correct-payment')).toBe(true);
  expect(canCorrect(user, 'credit-checkout')).toBe(true);
  expect(canCorrect(user, 'record-departure')).toBe(false);
  expect(canCorrect({ ...user, correctionPermissions: [] }, 'undo-checkin')).toBe(true);
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
