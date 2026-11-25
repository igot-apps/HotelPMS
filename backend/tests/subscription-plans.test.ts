import { describe, expect, test } from '@jest/globals';
import { buildQuote, DEFAULT_CONFIG as C, discountFor, validateConfig, QuoteContext, cheapestCovering } from '../src/modules/payment/subscription-plans';
import { getLimits, getSubscriptionState, getTerms } from '../src/modules/payment/subscription-state';

const now = new Date('2026-11-25T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);
const standard = { packageCode: 'standard', packageName: 'Standard', roomAllowance: 20, staffAllowance: 5, monthlyPrice: 200, discountPercent: 0 };
const ctx = (over: Partial<QuoteContext> = {}): QuoteContext => ({
  now, status: 'Active', expired: false, currentEnd: days(30), current: standard, scheduled: null,
  usage: { rooms: 10, staff: 3 }, hotelDiscount: 0, ...over,
});

describe('pricing', () => {
  test('duration discount tiers match the approved table', () => {
    expect([1, 2, 3, 5, 6, 11, 12, 23, 24].map(m => discountFor(C, m))).toEqual([0, 0, 8.33, 8.33, 10, 10, 16.67, 16.67, 20]);
  });

  test('standard renewal totals with live breakdown (rounded to whole cedis)', () => {
    const q = (months: number) => buildQuote(C, { packageCode: 'standard', months }, ctx({ status: 'Expired', expired: true, currentEnd: null }));
    expect(q(1)).toMatchObject({ total: 200, discountAmount: 0, effectiveMonthly: 200, kind: 'Renewal' });
    expect(q(3)).toMatchObject({ subtotal: 600, total: 550, discountAmount: 50 });
    expect(q(12)).toMatchObject({ subtotal: 2400, total: 2000, discountAmount: 400 });
    expect(q(24)).toMatchObject({ subtotal: 4800, total: 3840, discountAmount: 960, effectiveMonthly: 160 });
  });

  test('custom package uses base + per-room + per-staff formula and bounds', () => {
    const q = buildQuote(C, { packageCode: 'custom', rooms: 15, staff: 5, months: 1 }, ctx({ status: 'Expired', expired: true, currentEnd: null }));
    expect(q).toMatchObject({ monthlyPrice: 175, roomAllowance: 15, staffAllowance: 5, total: 175 });
    expect(() => buildQuote(C, { packageCode: 'custom', rooms: 0, staff: 5, months: 1 }, ctx())).toThrow(/between 1 and 200 rooms/);
    expect(() => buildQuote(C, { packageCode: 'custom', rooms: 10, staff: 51, months: 1 }, ctx())).toThrow(/staff accounts/);
  });

  test('recommends a cheaper suitable option', () => {
    const expired = { status: 'Expired', expired: true, currentEnd: null };
    // Pro chosen, but usage (10 rooms / 3 staff) fits Standard.
    expect(buildQuote(C, { packageCode: 'pro', months: 1 }, ctx(expired)).recommendation).toMatchObject({ packageCode: 'standard', monthlySaving: 150 });
    // Custom 30/8 (GHS 280) while Standard still covers usage.
    expect(buildQuote(C, { packageCode: 'custom', rooms: 30, staff: 8, months: 1 }, ctx(expired)).recommendation).toMatchObject({ packageCode: 'standard', monthlySaving: 80 });
    // Usage 25/6 needs Pro-sized allowances: custom 40/10 ties with Pro, so nothing cheaper.
    expect(buildQuote(C, { packageCode: 'custom', rooms: 40, staff: 10, months: 1 }, ctx({ ...expired, usage: { rooms: 25, staff: 6 } })).recommendation).toBeNull();
    // Named package wins a price tie.
    expect(cheapestCovering(C, 20, 5)?.packageCode).toBe('standard');
    expect(buildQuote(C, { packageCode: 'standard', months: 1 }, ctx()).recommendation).toBeNull();
  });

  test('hotel-specific discount lowers package prices', () => {
    const q = buildQuote(C, { packageCode: 'pro', months: 1 }, ctx({ status: 'Expired', expired: true, currentEnd: null, hotelDiscount: 10 }));
    expect(q.monthlyPrice).toBe(315);
  });

  test('rejects months outside 1–24 and non-whole months', () => {
    expect(() => buildQuote(C, { months: 25 }, ctx())).toThrow(/between 1 and 24/);
    expect(() => buildQuote(C, { months: 1.5 }, ctx())).toThrow();
    expect(() => buildQuote(C, { months: 0 }, ctx())).toThrow(); // renewal needs at least a month
  });
});

describe('plan changes', () => {
  test('upgrade mid-period charges the prorated difference and applies now', () => {
    const q = buildQuote(C, { packageCode: 'pro', months: 0 }, ctx({ currentEnd: days(365 / 12) }));
    expect(q.kind).toBe('Upgrade');
    expect(q.prorationAmount).toBeCloseTo(150, 1); // full month left × (350-200)
    expect(q.total).toBeCloseTo(150, 1);
    expect(q.appliesAt).toBe(now.toISOString());
  });

  test('upgrade proration respects the discount the hotel originally paid', () => {
    const q = buildQuote(C, { packageCode: 'pro', months: 0 }, ctx({ currentEnd: days(365 / 12), current: { ...standard, discountPercent: 20 } }));
    expect(q.prorationAmount).toBeCloseTo(120, 1);
  });

  test('upgrade with extra months = renewal at new price + proration', () => {
    const q = buildQuote(C, { packageCode: 'pro', months: 3 }, ctx({ currentEnd: days(365 / 24) }));
    expect(q.renewalTotal).toBe(Math.round(1050 * (1 - 0.0833)));
    expect(q.prorationAmount).toBeCloseTo(75, 1);
    expect(new Date(q.endsAt!).getTime()).toBeGreaterThan(days(365 / 24).getTime()); // remaining time preserved
  });

  test('upgrade during a trial is free of proration', () => {
    const trial = { ...standard, packageCode: 'trial', packageName: 'Trial' };
    const q = buildQuote(C, { packageCode: 'pro', months: 1 }, ctx({ status: 'Trial', current: trial, currentEnd: days(5) }));
    expect(q).toMatchObject({ kind: 'Upgrade', prorationAmount: 0, total: 350 });
    expect(() => buildQuote(C, { packageCode: 'pro', months: 0 }, ctx({ status: 'Trial', current: trial }))).toThrow();
  });

  test('downgrade is scheduled for the end of the current period and needs months', () => {
    const pro = { packageCode: 'pro', packageName: 'Pro', roomAllowance: 40, staffAllowance: 10, monthlyPrice: 350, discountPercent: 0 };
    const q = buildQuote(C, { packageCode: 'standard', months: 1 }, ctx({ current: pro }));
    expect(q).toMatchObject({ kind: 'Downgrade', prorationAmount: 0, total: 200, appliesAt: days(30).toISOString() });
    expect(() => buildQuote(C, { packageCode: 'standard', months: 0 }, ctx({ current: pro }))).toThrow();
  });

  test('downgrade is refused until usage fits the smaller allowances', () => {
    const pro = { packageCode: 'pro', packageName: 'Pro', roomAllowance: 40, staffAllowance: 10, monthlyPrice: 350, discountPercent: 0 };
    expect(() => buildQuote(C, { packageCode: 'standard', months: 1 }, ctx({ current: pro, usage: { rooms: 25, staff: 3 } }))).toThrow(/uses 25 rooms/);
    expect(() => buildQuote(C, { packageCode: 'custom', rooms: 30, staff: 4, months: 1 }, ctx({ current: pro, usage: { rooms: 25, staff: 5 } }))).toThrow(/5 staff/);
  });

  test('a pending downgrade blocks other changes but allows renewing it', () => {
    const scheduled = { ...standard, effectiveAt: days(30).toISOString() };
    const c = ctx({ current: standard, scheduled });
    expect(() => buildQuote(C, { packageCode: 'pro', months: 1 }, c)).toThrow(/scheduled/);
    expect(buildQuote(C, { packageCode: 'standard', months: 1 }, c).kind).toBe('Renewal');
  });

  test('expired hotels pay from today with no proration', () => {
    const q = buildQuote(C, { packageCode: 'pro', months: 1 }, ctx({ status: 'Expired', expired: true, currentEnd: null }));
    expect(q).toMatchObject({ kind: 'Renewal', prorationAmount: 0, startsAt: now.toISOString() });
  });
});

describe('state, terms and limits', () => {
  test('Cancelled and Expired statuses count as expired even with a future end date', () => {
    expect(getSubscriptionState({ subscriptionStatus: 'Cancelled', trialEndsAt: null, subscriptionEndsAt: days(10) }, now).expired).toBe(true);
    expect(getSubscriptionState({ subscriptionStatus: 'Expired', trialEndsAt: null, subscriptionEndsAt: days(10) }, now).expired).toBe(true);
    expect(getSubscriptionState({ subscriptionStatus: 'Active', trialEndsAt: null, subscriptionEndsAt: days(10) }, now).expired).toBe(false);
  });

  test('a scheduled downgrade takes effect once its date passes', () => {
    const property = { subscriptionPackage: 'pro', subscriptionPlan: 'Pro', roomAllowance: 40, staffAllowance: 10, subscriptionMonthlyPrice: 350,
      scheduledSubscription: { ...standard, effectiveAt: days(1).toISOString() } };
    expect(getTerms(property, C, now).current.packageCode).toBe('pro');
    expect(getLimits(property, C, now)).toMatchObject({ rooms: 20, staff: 5 }); // pending downgrade caps new additions
    expect(getTerms(property, C, days(2))).toMatchObject({ current: { packageCode: 'standard' }, scheduled: null });
  });

  test('admin allowance override replaces plan limits; missing allowances fall back to trial terms', () => {
    expect(getLimits({ roomAllowance: 20, staffAllowance: 5, subscriptionOverride: { roomAllowance: 60 } }, C)).toMatchObject({ rooms: 60, staff: 5 });
    expect(getLimits({}, C)).toMatchObject({ rooms: C.trial.rooms, staff: C.trial.staff });
  });

  test('config validation rejects bad admin input', () => {
    expect(validateConfig(C)).toEqual(C);
    expect(() => validateConfig({ ...C, packages: [{ ...C.packages[0], code: 'custom' }] })).toThrow(/reserved/);
    expect(() => validateConfig({ ...C, packages: [C.packages[0], C.packages[0]] })).toThrow(/twice/);
    expect(() => validateConfig({ ...C, maxMonths: 0 })).toThrow(/Durations/);
    expect(() => validateConfig({ ...C, custom: { ...C.custom, minRooms: 50, maxRooms: 10 } })).toThrow(/Custom room/);
    expect(() => validateConfig({ ...C, discounts: [{ minMonths: 3, percent: 95 }] })).toThrow(/Discounts/);
    expect(() => validateConfig({ ...C, trial: { days: 0, rooms: 1, staff: 1 } })).toThrow(/Trial/);
  });
});
