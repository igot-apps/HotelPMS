import { cheapestCovering, Override, SubscriptionConfig, Terms } from './subscription-plans';

export const subscriptionFields = {
  subscriptionStatus: true,
  trialEndsAt: true,
  subscriptionEndsAt: true,
} as const;

export const termsFields = {
  ...subscriptionFields,
  subscriptionPlan: true,
  subscriptionPackage: true,
  roomAllowance: true,
  staffAllowance: true,
  subscriptionMonthlyPrice: true,
  subscriptionDiscountPercent: true,
  scheduledSubscription: true,
  subscriptionOverride: true,
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

type TermsProperty = {
  subscriptionPlan?: string | null; subscriptionPackage?: string | null;
  roomAllowance?: number | null; staffAllowance?: number | null;
  subscriptionMonthlyPrice?: unknown; subscriptionDiscountPercent?: unknown;
  scheduledSubscription?: unknown; subscriptionOverride?: unknown;
};

/** Purchased terms in force now, plus any downgrade still waiting for renewal. */
export function getTerms(property: TermsProperty, config: SubscriptionConfig, now = new Date()) {
  const rooms = property.roomAllowance ?? config.trial.rooms;
  const staff = property.staffAllowance ?? config.trial.staff;
  const fallbackPrice = cheapestCovering(config, rooms, staff)?.monthlyPrice ?? 0;
  let current: Terms = {
    packageCode: property.subscriptionPackage || 'trial',
    packageName: property.subscriptionPlan || 'Trial',
    roomAllowance: rooms,
    staffAllowance: staff,
    monthlyPrice: property.subscriptionMonthlyPrice == null ? fallbackPrice : Number(property.subscriptionMonthlyPrice),
    discountPercent: Number(property.subscriptionDiscountPercent ?? 0),
  };
  let scheduled = (property.scheduledSubscription as (Terms & { effectiveAt: string }) | null) || null;
  if (scheduled && new Date(scheduled.effectiveAt) <= now) {
    const { effectiveAt: _effectiveAt, ...due } = scheduled;
    current = { ...due };
    scheduled = null;
  }
  return { current, scheduled };
}

/** Allowances enforced for new rooms/staff: admin override, else the smaller of current and scheduled terms. */
export function getLimits(property: TermsProperty, config: SubscriptionConfig, now = new Date()) {
  const { current, scheduled } = getTerms(property, config, now);
  const override = (property.subscriptionOverride as Override | null) || {};
  return {
    rooms: override.roomAllowance ?? Math.min(current.roomAllowance, scheduled?.roomAllowance ?? Infinity),
    staff: override.staffAllowance ?? Math.min(current.staffAllowance, scheduled?.staffAllowance ?? Infinity),
    packageName: current.packageName,
  };
}
