export function normalizeGhanaPhoneNumber(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || /[^\d+\s()-]/.test(trimmed)) return null;
  if ((trimmed.match(/\+/g) || []).length > 1 || (trimmed.includes('+') && !trimmed.startsWith('+'))) return null;

  const compact = trimmed.replace(/[\s()-]/g, '');
  let national: string | null = null;
  if (/^\d{9}$/.test(compact)) national = compact;
  else if (/^0\d{9}$/.test(compact)) national = compact.slice(1);
  else if (/^233\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^\+233\d{9}$/.test(compact)) national = compact.slice(4);
  else if (/^00233\d{9}$/.test(compact)) national = compact.slice(5);

  return national && /^[1-9]\d{8}$/.test(national) ? `+233${national}` : null;
}
