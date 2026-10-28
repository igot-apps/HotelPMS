export const formatPaymentMethod = (method) => {
  const normalized = String(method || '').toLowerCase();
  if (['mobilemoney', 'mobile money', 'mobile_money'].includes(normalized)) return 'Mobile Money';
  if (normalized === 'card') return 'Card';
  if (normalized === 'online') return 'Online payment';
  return method || 'Unknown';
};
