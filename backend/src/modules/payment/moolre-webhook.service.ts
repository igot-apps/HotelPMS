import { prisma } from '../../shared/utils/prisma';
import { moolreConfigFor, verifyGuestPayment } from './guest-payment.service';
import { platformMoolreConfig, verifyMoolreSignature } from './moolre.client';
import * as subscriptionService from './subscription.service';

const failure = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/**
 * Moolre callback. The payload only says which reference to look at: every outcome is re-checked
 * with Moolre's status API before anything is recorded, and settlement is idempotent, so duplicate
 * deliveries are harmless. Throwing a 5xx lets Moolre retry.
 */
export async function processMoolreWebhook(rawBody: unknown, signature: string | undefined) {
  if (!Buffer.isBuffer(rawBody)) throw failure('Invalid webhook payload.');
  let event: any;
  try { event = JSON.parse(rawBody.toString('utf8')); }
  catch { throw failure('Invalid webhook payload.'); }
  const reference = event?.data?.externalref;
  if (typeof reference !== 'string' || !reference || reference.length > 200) return { handled: false };

  if (reference.startsWith('RES-')) {
    // The reference is only a routing hint until the signature is checked with that wallet's secret.
    const attempt = await prisma.guestPaymentAttempt.findUnique({ where: { reference }, include: { reservation: { select: { property: {
      select: { propertyCode: true, moolreUsername: true, moolrePublicKey: true, moolreAccountNumber: true, moolreWebhookSecret: true } } } } } });
    if (!attempt) {
      if (!verifyMoolreSignature(rawBody, signature, platformMoolreConfig()?.webhookSecret)) throw failure('Invalid Moolre webhook signature.', 401);
      return { handled: false };
    }
    const property = attempt.reservation.property;
    const secret = moolreConfigFor(property)?.webhookSecret;
    if (!secret) throw failure('Webhook signing secret is not configured.', 503);
    if (!verifyMoolreSignature(rawBody, signature, secret)) throw failure('Invalid Moolre webhook signature.', 401);
    const result = await verifyGuestPayment(property.propertyCode, reference);
    if (result.status === 'failed') {
      await prisma.guestPaymentAttempt.updateMany({ where: { reference, status: { not: 'Completed' } }, data: { status: 'Failed' } });
      return { handled: true };
    }
    if (event.event === 'payment.succeeded' && result.status !== 'success') throw failure('Guest payment is not yet verified as successful.', 503);
    return { handled: true };
  }

  if (!verifyMoolreSignature(rawBody, signature, platformMoolreConfig()?.webhookSecret)) throw failure('Invalid Moolre webhook signature.', 401);
  if (reference.startsWith('SUB-')) {
    try {
      const result = await subscriptionService.processSubscriptionWebhook(reference);
      if (event.event === 'payment.succeeded' && result.status !== 'success') throw failure('Subscription payment is not yet verified as successful.', 503);
    } catch (error: any) {
      if (error.statusCode === 404) return { handled: false };
      throw error;
    }
    return { handled: true };
  }
  return { handled: false };
}
