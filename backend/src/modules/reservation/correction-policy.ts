export const DEFAULT_RECEPTIONIST_CORRECTIONS = ['undo-checkin', 'undo-checkout', 'restore', 'transfer'];
export const CORRECTION_ACTIONS = [
  { action: 'refund', label: 'Refund payment', delegatable: false },
  { action: 'undo-checkin', label: 'Undo mistaken check-in', delegatable: true },
  { action: 'undo-checkout', label: 'Undo mistaken checkout', delegatable: true },
  { action: 'restore', label: 'Restore cancelled reservation', delegatable: true },
  { action: 'transfer', label: 'Transfer guest to another room', delegatable: true },
  { action: 'correct-date', label: 'Correct departure date and charges', delegatable: false },
  { action: 'correct-payment', label: 'Correct or void a manual payment', delegatable: false },
  { action: 'credit-checkout', label: 'Checkout with outstanding balance', delegatable: false },
  { action: 'record-departure', label: 'Record actual departure (forgotten checkout)', delegatable: false },
];
// No operational correction needs a manager; staff apply them directly with a reason (audited).
export const MANAGER_ONLY_ACTIONS: string[] = [];
export function canCorrect(user: any, action: string) {
  const policy = CORRECTION_ACTIONS.find(item => item.action === action);
  if (!policy || !user.isActive) return false;
  // Front desk staff apply every correction directly; each one is audited with its reason.
  return user.role?.roleName === 'Manager' || (user.role?.roleName === 'Receptionist' && !MANAGER_ONLY_ACTIONS.includes(action));
}
export function validateCorrectionPermissions(value: unknown): string[] {
  if (!Array.isArray(value) || value.some(action => typeof action !== 'string' || !CORRECTION_ACTIONS.some(item => item.action === action && item.delegatable))) throw new Error('Choose valid operational correction permissions. Financial corrections require a manager.');
  return [...new Set(value)] as string[];
}
