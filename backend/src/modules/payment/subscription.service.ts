import axios from 'axios';
import { randomUUID } from 'crypto';
import { prisma } from '../../shared/utils/prisma';
import { Prisma } from '../../../src/generated/prisma';
import { getFrontendBaseUrl } from '../../shared/utils/frontend-url';
import { listFreeAccess } from './free-access.service';
import { addMonthsClamped, buildQuote, Override, SubscriptionConfig, SubscriptionError, Terms } from './subscription-plans';
import { getLimits, getSubscriptionState, getTerms, termsFields } from './subscription-state';
import { getSubscriptionConfig, getUsage } from './subscription-access';

const paystackSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new SubscriptionError('Subscription payments are not configured. Set PAYSTACK_SECRET_KEY on the backend.', 503);
  return secret;
};

const termsColumns = (t: Terms) => ({
  subscriptionPackage: t.packageCode, subscriptionPlan: t.packageName,
  roomAllowance: t.roomAllowance, staffAllowance: t.staffAllowance,
  subscriptionMonthlyPrice: t.monthlyPrice, subscriptionDiscountPercent: t.discountPercent,
});

const currentEndOf = (p: { subscriptionStatus: string; trialEndsAt: Date | null; subscriptionEndsAt: Date | null }) =>
  p.subscriptionStatus === 'Trial' ? p.trialEndsAt : p.subscriptionStatus === 'Active' ? p.subscriptionEndsAt : null;

async function loadContext(propertyId: number, db: any = prisma, now = new Date()) {
  const [property, config, usage] = await Promise.all([
    db.property.findUnique({ where: { propertyId }, select: { ...termsFields, propertyId: true } }),
    getSubscriptionConfig(db),
    getUsage(propertyId, db),
  ]);
  if (!property) throw new SubscriptionError('Property not found', 404);
  const state = getSubscriptionState(property, now);
  const { current, scheduled } = getTerms(property, config, now);
  const override = (property.subscriptionOverride as Override | null) || {};
  const ctx = {
    now, status: property.subscriptionStatus, expired: state.expired,
    currentEnd: state.expired ? null : currentEndOf(property),
    current: scheduled ? { ...scheduled } : current, scheduled, usage,
    hotelDiscount: Number(override.discountPercent || 0),
  };
  return { property, config, usage, state, current, scheduled, override, ctx };
}

const catalog = (config: SubscriptionConfig) => ({
  packages: config.packages.filter(p => p.active),
  custom: config.custom.enabled ? config.custom : null,
  minMonths: config.minMonths, maxMonths: config.maxMonths, discounts: config.discounts,
});

export const getSubscriptionStatus = async (propertyId: number) => {
  const { property, config, usage, state, current, scheduled, override } = await loadContext(propertyId);
  const [freeAccess, payments] = await Promise.all([
    listFreeAccess(propertyId),
    prisma.subscriptionPayment.findMany({
      where: { propertyId, status: 'Completed' }, orderBy: { subscriptionPaymentId: 'desc' }, take: 10,
      select: { reference: true, amount: true, durationMonths: true, planName: true, packageCode: true, kind: true, roomAllowance: true, staffAllowance: true, paidAt: true },
    }),
  ]);
  return {
    subscriptionPlan: current.packageName,
    subscriptionStatus: property.subscriptionStatus,
    trialEndsAt: property.trialEndsAt,
    subscriptionEndsAt: property.subscriptionEndsAt,
    state, current, scheduled, usage,
    limits: getLimits(property, config),
    hotelDiscountPercent: Number(override.discountPercent || 0),
    freeAccess: freeAccess.map(entry => entry.newData),
    payments,
    catalog: catalog(config),
  };
};

export const quoteSubscription = async (propertyId: number, input: any) => {
  const { config, ctx } = await loadContext(propertyId);
  return buildQuote(config, input, ctx);
};

/** Apply a paid (or zero-cost) order inside a transaction that holds the property row lock. */
async function applyPayment(tx: any, payment: any, now: Date) {
  await tx.$queryRaw`SELECT "propertyId" FROM "properties" WHERE "propertyId" = ${payment.propertyId} FOR UPDATE`;
  const property = await tx.property.findUnique({ where: { propertyId: payment.propertyId }, select: termsFields });
  if (!property) throw new SubscriptionError('Property not found', 404);
  const config = await getSubscriptionConfig(tx);
  const state = getSubscriptionState(property, now);
  const { current, scheduled } = getTerms(property, config, now);
  const currentEnd = state.expired ? null : currentEndOf(property);
  const live = !!currentEnd && currentEnd > now;
  const purchased: Terms = {
    packageCode: payment.packageCode, packageName: payment.planName,
    roomAllowance: payment.roomAllowance, staffAllowance: payment.staffAllowance,
    monthlyPrice: Number(payment.monthlyPrice), discountPercent: Number(payment.discountPercent),
  };
  const subscriptionEndsAt = payment.durationMonths
    ? addMonthsClamped(live ? currentEnd! : now, payment.durationMonths)
    : currentEnd ?? property.subscriptionEndsAt;

  // Downgrades (and renewals of an already scheduled downgrade) wait for the current period to end.
  const deferred = live && (payment.kind === 'Downgrade' || !!scheduled);
  const nextScheduled = deferred ? { ...purchased, effectiveAt: scheduled?.effectiveAt ?? currentEnd!.toISOString() } : null;
  await tx.property.update({
    where: { propertyId: payment.propertyId },
    data: {
      ...termsColumns(deferred ? current : purchased),
      scheduledSubscription: nextScheduled ?? Prisma.DbNull,
      subscriptionStatus: 'Active',
      subscriptionEndsAt,
    },
    select: { propertyId: true },
  });
  await tx.auditLog.create({ data: {
    userId: payment.initiatedBy ?? null, action: 'SubscriptionPurchased', entityType: 'Property', entityId: payment.propertyId,
    oldData: { ...current, endsAt: currentEnd?.toISOString() ?? null } as any,
    newData: { ...purchased, kind: payment.kind, reference: payment.reference, amount: Number(payment.amount), months: payment.durationMonths, appliesAt: nextScheduled?.effectiveAt ?? now.toISOString(), endsAt: subscriptionEndsAt?.toISOString() ?? null } as any,
  } });
  return subscriptionEndsAt;
}

export const initializeSubscriptionPayment = async (userId: number, propertyId: number, input: any) => {
  const { config, ctx } = await loadContext(propertyId);
  const quote = buildQuote(config, input, ctx);
  const reference = `SUB-${propertyId}-${randomUUID()}`;
  const orderData = {
    propertyId, initiatedBy: userId, reference, amount: quote.total, currency: 'GHS',
    durationMonths: quote.months, planName: quote.packageName, kind: quote.kind as any,
    packageCode: quote.packageCode, roomAllowance: quote.roomAllowance, staffAllowance: quote.staffAllowance,
    monthlyPrice: quote.monthlyPrice, discountPercent: quote.discountPercent, prorationAmount: quote.prorationAmount,
    pricing: quote as any,
  };

  if (quote.total <= 0) {
    // Nothing to charge (e.g. an equal-price upgrade): record and apply it directly.
    const subscriptionEndsAt = await prisma.$transaction(async tx => {
      const payment = await tx.subscriptionPayment.create({ data: { ...orderData, status: 'Completed', paidAt: new Date() } });
      return applyPayment(tx, payment, new Date());
    });
    return { applied: true, reference, subscriptionEndsAt };
  }

  const [property, user] = await Promise.all([
    prisma.property.findUnique({ where: { propertyId }, select: { propertyName: true, primaryEmail: true } }),
    prisma.user.findUnique({ where: { userId }, select: { email: true } }),
  ]);
  const email = user?.email || property?.primaryEmail;
  if (!email) throw new SubscriptionError('Add a billing email to your user or property profile before paying.');
  const secret = paystackSecret();

  const pendingPayment = await prisma.subscriptionPayment.create({ data: orderData });
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: String(Math.round(quote.total * 100)),
        currency: 'GHS',
        reference,
        // Paystack only displays channels enabled for this merchant account and currency.
        channels: ['mobile_money', 'card'],
        callback_url: `${getFrontendBaseUrl()}/billing`,
        metadata: {
          purpose: 'hotel_pms_subscription', propertyId, propertyName: property?.propertyName,
          subscriptionPaymentId: pendingPayment.subscriptionPaymentId, durationMonths: quote.months,
          planName: quote.packageName, kind: quote.kind,
        },
      },
      { headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' } },
    );
    if (!response.data?.status || !response.data?.data?.authorization_url) {
      throw new Error(response.data?.message || 'Paystack could not initialize this payment.');
    }
    return response.data.data;
  } catch (error: any) {
    await prisma.subscriptionPayment.update({
      where: { subscriptionPaymentId: pendingPayment.subscriptionPaymentId }, data: { status: 'Failed' },
    });
    throw new Error(error.response?.data?.message || error.message || 'Could not start payment with Paystack.');
  }
};

export const verifySubscriptionPayment = async (reference: string, propertyId: number) => {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { reference } });
  if (!payment || payment.propertyId !== propertyId) throw new Error('Subscription payment reference not found.');
  if (payment.status === 'Completed') return { status: 'success', alreadyProcessed: true };
  if (payment.status !== 'Pending') throw new Error('This subscription payment is no longer pending.');

  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackSecret()}` } },
  );
  const transaction = response.data?.data;
  if (!response.data?.status || !transaction) throw new Error('Paystack could not verify this payment.');
  if (transaction.status !== 'success') return { status: transaction.status || 'failed', alreadyProcessed: false };
  if (transaction.reference !== payment.reference) throw new Error('Paystack returned a different payment reference.');
  if (Number(transaction.amount) !== Math.round(Number(payment.amount) * 100) || transaction.currency !== payment.currency) {
    throw new Error('Verified payment amount or currency does not match this subscription order.');
  }

  return prisma.$transaction(async (tx) => {
    // Claim the order first so concurrent callbacks/webhooks apply it exactly once.
    const claim = await tx.subscriptionPayment.updateMany({
      where: { subscriptionPaymentId: payment.subscriptionPaymentId, status: 'Pending' },
      data: { status: 'Processing' },
    });
    if (claim.count !== 1) {
      const latest = await tx.subscriptionPayment.findUnique({ where: { reference } });
      if (latest?.status === 'Completed') return { status: 'success', alreadyProcessed: true };
      throw new Error('This payment is already being processed. Refresh the billing page shortly.');
    }
    const subscriptionEndsAt = await applyPayment(tx, payment, new Date());
    await tx.subscriptionPayment.update({
      where: { subscriptionPaymentId: payment.subscriptionPaymentId },
      data: { status: 'Completed', paidAt: new Date() },
    });
    return { status: 'success', alreadyProcessed: false, subscriptionEndsAt };
  });
};

export const processSubscriptionWebhook = async (reference: string) => {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { reference }, select: { propertyId: true } });
  if (!payment) throw new SubscriptionError('Subscription payment reference not found.', 404);
  return verifySubscriptionPayment(reference, payment.propertyId);
};

// ---------------- Platform admin ----------------

const HISTORY_ACTIONS = ['SubscriptionPurchased', 'SubscriptionOverrideChanged', 'FreeSubscriptionAccessGranted'];

export const getSubscriptionAdminView = async (propertyId: number) => {
  const [status, payments, history] = await Promise.all([
    getSubscriptionStatus(propertyId),
    prisma.subscriptionPayment.findMany({ where: { propertyId }, orderBy: { subscriptionPaymentId: 'desc' }, take: 100 }),
    prisma.auditLog.findMany({
      where: { entityType: 'Property', entityId: propertyId, action: { in: HISTORY_ACTIONS } },
      orderBy: { auditLogId: 'desc' }, take: 100,
      select: { auditLogId: true, action: true, oldData: true, newData: true, createdAt: true, user: { select: { fullName: true } } },
    }),
  ]);
  return { ...status, override: (await prisma.property.findUnique({ where: { propertyId }, select: { subscriptionOverride: true } }))?.subscriptionOverride ?? null, allPayments: payments, history };
};

export const setSubscriptionOverride = async (propertyId: number, userId: number, input: any) => {
  const optionalInt = (v: unknown, label: string) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || n > 10000) throw new SubscriptionError(`${label} must be a whole number of at least 1, or empty.`);
    return n;
  };
  const discount = input?.discountPercent === null || input?.discountPercent === undefined || input?.discountPercent === '' ? null : Number(input.discountPercent);
  if (discount !== null && (!Number.isFinite(discount) || discount < 0 || discount > 90)) throw new SubscriptionError('Hotel discount must be between 0 and 90%.');
  const note = typeof input?.note === 'string' ? input.note.trim().slice(0, 300) : '';
  const next: Override = {
    discountPercent: discount || null,
    roomAllowance: optionalInt(input?.roomAllowance, 'Room allowance'),
    staffAllowance: optionalInt(input?.staffAllowance, 'Staff allowance'),
    note: note || null,
  };
  const empty = !next.discountPercent && !next.roomAllowance && !next.staffAllowance;
  return prisma.$transaction(async tx => {
    const before = await tx.property.findUnique({ where: { propertyId }, select: { subscriptionOverride: true } });
    if (!before) throw new SubscriptionError('Property not found', 404);
    await tx.property.update({ where: { propertyId }, data: { subscriptionOverride: empty ? Prisma.DbNull : next as any }, select: { propertyId: true } });
    await tx.auditLog.create({ data: {
      userId, action: 'SubscriptionOverrideChanged', entityType: 'Property', entityId: propertyId,
      oldData: (before.subscriptionOverride as any) ?? undefined, newData: (empty ? { cleared: true } : next) as any,
    } });
    return empty ? null : next;
  });
};
