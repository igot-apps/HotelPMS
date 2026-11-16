export const subscriptionFields = {
  subscriptionStatus: true,
  trialEndsAt: true,
  subscriptionEndsAt: true,
} as const;

export function getSubscriptionState(property: {
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
}, now = new Date()) {
  const isTrial = property.subscriptionStatus === 'Trial';
  const currentEnd = isTrial ? property.trialEndsAt : property.subscriptionEndsAt;
  const endsAt = property.subscriptionStatus === 'Expired'
    ? property.subscriptionEndsAt ?? property.trialEndsAt
    : currentEnd;
  const expired = !['Trial', 'Active'].includes(property.subscriptionStatus)
    || (currentEnd !== null && currentEnd <= now);
  return { isTrial, endsAt, expired, cancelled: property.subscriptionStatus === 'Cancelled' };
}
