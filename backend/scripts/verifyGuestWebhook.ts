import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import axios from 'axios';
import app from '../src/app';
import { verifyGuestPayment } from '../src/modules/payment/guest-payment.service';
import { prisma } from '../src/shared/utils/prisma';

async function main() {
  assert(['localhost', '127.0.0.1'].includes(new URL(process.env.DATABASE_URL!).hostname), 'Local database only.');
  const code = `webhook-check-${randomUUID().slice(0, 8)}`;
  const secret = 'sk_test_webhook_fixture';
  const hotel = await prisma.property.create({ data: { propertyCode: code, propertyName: 'Webhook fixture', businessName: 'Test', propertyType: 'Hotel', country: 'Ghana', paystackSecretKey: secret } });
  const reservation = await prisma.reservation.create({ data: { propertyId: hotel.propertyId, confirmationCode: code, checkInDate: new Date(), checkOutDate: new Date(Date.now() + 86400000), totalAmount: 200, amountPaid: 0, status: 'InHouse' } });
  const reference = `RES-${reservation.reservationId}-1`;
  const transaction = { status: 'success', reference, amount: 20000, currency: 'GHS', channel: 'mobile_money', metadata: { propertyCode: code, reservationId: reservation.reservationId } };
  const raw = JSON.stringify({ event: 'charge.success', data: transaction });
  const sign = (body: string, key = secret) => createHmac('sha512', key).update(body).digest('hex');
  const post = (body = raw, signature = sign(body), endpoint = '/api/paystack/webhooks/guest-bookings') =>
    request(app).post(endpoint).set('Content-Type', 'application/json').set('x-paystack-signature', signature).send(body);
  const originalGet = axios.get;
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalPlatformKey = process.env.PAYSTACK_SECRET_KEY;
  let providerCalls = 0;
  (axios as any).get = async () => { providerCalls++; return { data: { status: true, data: transaction } }; };
  try {
    assert.equal((await post(raw, sign(raw, 'wrong-key'))).status, 401);
    assert.equal(providerCalls, 0);
    assert.equal((await post('{', sign('{'))).status, 400);

    // Exercise rollback after inserting the payment but before adjusting its balance.
    (prisma as any).$transaction = (callback: any, options: any) => originalTransaction(async tx => {
      (tx.reservation as any).update = async () => { throw new Error('Injected balance-write failure'); };
      return callback(tx);
    }, options);
    assert.equal((await post()).status, 500);
    (prisma as any).$transaction = originalTransaction;
    assert.equal(await prisma.payment.count({ where: { reservationId: reservation.reservationId } }), 0);
    assert.equal(Number((await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId } })).amountPaid), 0);

    const outcomes = await Promise.all([post(), post(), verifyGuestPayment(code, reference)]);
    assert.equal((outcomes[0] as any).status, 200); assert.equal((outcomes[1] as any).status, 200);
    assert.equal(await prisma.payment.count({ where: { reservationId: reservation.reservationId } }), 1);
    let stay = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId } });
    assert.equal(Number(stay.amountPaid), 200); assert.equal(stay.status, 'InHouse');
    assert.equal((await post(raw, sign(raw), '/api/payments/webhooks/guest-bookings')).status, 200);

    (axios as any).get = async () => { throw new Error('Temporary provider outage'); };
    assert.equal((await post()).status, 500);
    (axios as any).get = async () => ({ data: { status: true, data: { ...transaction, currency: 'USD' } } });
    assert.equal((await post()).status, 400);

    // Platform-account guest payments work through either configured webhook URL.
    process.env.PAYSTACK_SECRET_KEY = secret;
    await prisma.property.update({ where: { propertyId: hotel.propertyId }, data: { paystackSecretKey: null } });
    (axios as any).get = async () => ({ data: { status: true, data: transaction } });
    assert.equal((await post(raw, sign(raw), '/api/paystack/webhooks/platform')).status, 200);
    const ignored = JSON.stringify({ event: 'transfer.success', data: {} });
    assert.equal((await post(ignored)).status, 200);

    await prisma.reservation.update({ where: { reservationId: reservation.reservationId }, data: { status: 'Cancelled', refundDue: 200, refundStatus: 'Pending' } });
    const late = { ...transaction, reference: `RES-${reservation.reservationId}-2`, amount: 5000 };
    (axios as any).get = async () => ({ data: { status: true, data: late } });
    const lateRaw = JSON.stringify({ event: 'charge.success', data: late });
    assert.equal((await post(lateRaw)).status, 200);
    stay = await prisma.reservation.findUniqueOrThrow({ where: { reservationId: reservation.reservationId } });
    assert.equal(stay.status, 'Cancelled'); assert.equal(Number(stay.refundDue), 250);
    console.log('Passed: signature checks, raw-body routes, rollback/retry, concurrent duplicate settlement, provider outage, currency validation, shared-key routing, and delayed cancellation settlement. No Paystack calls were made.');
  } finally {
    (prisma as any).$transaction = originalTransaction; axios.get = originalGet;
    if (originalPlatformKey === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = originalPlatformKey;
    await prisma.payment.deleteMany({ where: { reservationId: reservation.reservationId } });
    await prisma.property.delete({ where: { propertyId: hotel.propertyId } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
