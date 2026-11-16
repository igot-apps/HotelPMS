import { getSubscriptionState, subscriptionFields } from '../payment/subscription-state';

export const publicBookingFields = {
  isActive: true,
  status: true,
  isOnlineBookingEnabled: true,
  ...subscriptionFields,
} as const;

export function canBookOnline(property: {
  isActive: boolean;
  status: string;
  isOnlineBookingEnabled: boolean;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
}, now = new Date()) {
  if (!property.isActive || property.status !== 'Active' || !property.isOnlineBookingEnabled) return false;
  return !getSubscriptionState(property, now).expired;
}

export class OnlineBookingPausedError extends Error {
  readonly code = 'ONLINE_BOOKING_PAUSED';
  readonly statusCode = 409;

  constructor() {
    super('This hotel is temporarily unable to accept online bookings.');
  }
}
