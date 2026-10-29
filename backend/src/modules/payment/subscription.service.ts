import axios from 'axios';
import { randomUUID } from 'crypto';
import { prisma } from '../../shared/utils/prisma';
import { getFrontendBaseUrl } from '../../shared/utils/frontend-url';

const PLAN_PRICES: Record<number, number> = {
  1: 200,
  3: 550,
  12: 2000,
};

const addMonthsClamped = (date: Date, months: number) => {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDayOfTargetMonth = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return result;
};

const paystackSecret = () => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    const error: any = new Error('Subscription payments are not configured. Set PAYSTACK_SECRET_KEY on the backend.');
    error.statusCode = 503;
    throw error;
  }
  return secret;
};

export const getSubscriptionStatus = async (propertyId: number) => {
  const property = await prisma.property.findUnique({
    where: { propertyId },
    select: {
      subscriptionPlan: true,
      subscriptionStatus: true,
      trialEndsAt: true,
      subscriptionEndsAt: true,
    },
  });
  if (!property) throw new Error('Property not found');
  return property;
};

export const initializeSubscriptionPayment = async (
  userId: number,
  propertyId: number,
  durationMonths: number
) => {
  const amount = PLAN_PRICES[durationMonths];
  if (!amount) throw new Error('Choose a valid subscription duration.');

  const [property, user] = await Promise.all([
    prisma.property.findUnique({
      where: { propertyId },
      select: { propertyId: true, propertyName: true, primaryEmail: true },
    }),
    prisma.user.findUnique({ where: { userId }, select: { email: true } }),
  ]);
  if (!property) throw new Error('Property not found');
  const email = user?.email || property.primaryEmail;
  if (!email) throw new Error('Add a billing email to your user or property profile before paying.');

  const reference = `SUB-${propertyId}-${randomUUID()}`;
  const pendingPayment = await prisma.subscriptionPayment.create({
    data: {
      propertyId,
      initiatedBy: userId,
      reference,
      amount,
      currency: 'GHS',
      durationMonths,
      planName: 'Pro',
    },
  });

  const frontendUrl = getFrontendBaseUrl();
  try {
    const response = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email,
        amount: String(Math.round(amount * 100)),
        currency: 'GHS',
        reference,
        // Offer both common Ghana checkout options; Paystack only displays
        // channels enabled for this merchant account and currency.
        channels: ['mobile_money', 'card'],
        callback_url: `${frontendUrl}/billing`,
        metadata: {
          purpose: 'hotel_pms_subscription',
          propertyId,
          propertyName: property.propertyName,
          subscriptionPaymentId: pendingPayment.subscriptionPaymentId,
          durationMonths,
          planName: pendingPayment.planName,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${paystackSecret()}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data?.status || !response.data?.data?.authorization_url) {
      throw new Error(response.data?.message || 'Paystack could not initialize this payment.');
    }
    return response.data.data;
  } catch (error: any) {
    await prisma.subscriptionPayment.update({
      where: { subscriptionPaymentId: pendingPayment.subscriptionPaymentId },
      data: { status: 'Failed' },
    });
    if (error.statusCode) throw error;
    const message = error.response?.data?.message || error.message || 'Could not start payment with Paystack.';
    throw new Error(message);
  }
};

export const verifySubscriptionPayment = async (reference: string, propertyId: number) => {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { reference } });
  if (!payment || payment.propertyId !== propertyId) throw new Error('Subscription payment reference not found.');
  if (payment.status === 'Completed') return { status: 'success', alreadyProcessed: true };
  if (payment.status !== 'Pending') throw new Error('This subscription payment is no longer pending.');

  const response = await axios.get(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackSecret()}` } }
  );
  const transaction = response.data?.data;
  if (!response.data?.status || !transaction) throw new Error('Paystack could not verify this payment.');
  if (transaction.status !== 'success') return { status: transaction.status || 'failed', alreadyProcessed: false };
  if (transaction.reference !== payment.reference) throw new Error('Paystack returned a different payment reference.');
  if (Number(transaction.amount) !== Math.round(Number(payment.amount) * 100) || transaction.currency !== payment.currency) {
    throw new Error('Verified payment amount or currency does not match this subscription order.');
  }

  return prisma.$transaction(async (tx) => {
    const claim = await tx.subscriptionPayment.updateMany({
      where: { subscriptionPaymentId: payment.subscriptionPaymentId, status: 'Pending' },
      data: { status: 'Processing' },
    });
    if (claim.count !== 1) {
      const latest = await tx.subscriptionPayment.findUnique({ where: { reference } });
      if (latest?.status === 'Completed') return { status: 'success', alreadyProcessed: true };
      throw new Error('This payment is already being processed. Refresh the billing page shortly.');
    }

    const property = await tx.property.findUnique({
      where: { propertyId },
      select: { subscriptionStatus: true, subscriptionEndsAt: true, trialEndsAt: true },
    });
    if (!property) throw new Error('Property not found');

    const now = new Date();
    const currentEnd = property.subscriptionStatus === 'Active'
      ? property.subscriptionEndsAt
      : property.subscriptionStatus === 'Trial'
        ? property.trialEndsAt
        : null;
    const startsAt = currentEnd && currentEnd > now ? currentEnd : now;
    const subscriptionEndsAt = addMonthsClamped(startsAt, payment.durationMonths);

    await tx.property.update({
      where: { propertyId },
      data: {
        subscriptionPlan: payment.planName,
        subscriptionStatus: 'Active',
        subscriptionEndsAt,
      },
    });
    await tx.subscriptionPayment.update({
      where: { subscriptionPaymentId: payment.subscriptionPaymentId },
      data: { status: 'Completed', paidAt: new Date() },
    });

    return { status: 'success', alreadyProcessed: false, subscriptionEndsAt };
  });
};

export const processSubscriptionWebhook = async (reference: string) => {
  const payment = await prisma.subscriptionPayment.findUnique({ where: { reference }, select: { propertyId: true } });
  if (!payment) {
    const error: any = new Error('Subscription payment reference not found.');
    error.statusCode = 404;
    throw error;
  }
  return verifySubscriptionPayment(reference, payment.propertyId);
};
