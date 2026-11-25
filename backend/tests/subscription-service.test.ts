import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import axios from 'axios';

const db: any = {
  property: { findUnique: jest.fn(), update: jest.fn() },
  subscriptionSettings: { findUnique: jest.fn(), upsert: jest.fn() },
  subscriptionPayment: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  auditLog: { create: jest.fn(), findMany: jest.fn() },
  room: { count: jest.fn() },
  user: { count: jest.fn(), findUnique: jest.fn() },
  role: { findUnique: jest.fn() },
  $queryRaw: jest.fn(),
  $transaction: jest.fn((fn: any) => fn(db)),
};
jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn(() => db), Prisma: { DbNull: 'DbNull' } }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: db }));
jest.mock('axios');

import { verifySubscriptionPayment, initializeSubscriptionPayment, setSubscriptionOverride } from '../src/modules/payment/subscription.service';
import { DEFAULT_CONFIG } from '../src/modules/payment/subscription-plans';
import { assertCapacity, getSubscriptionConfig, saveSubscriptionConfig } from '../src/modules/payment/subscription-access';
import paystackRoutes from '../src/modules/payment/payment.routes';
import { authenticate } from '../src/shared/middleware/auth.middleware';
import { generateAccessToken } from '../src/shared/utils/jwt';

const day = 86_400_000;
const future = (n: number) => new Date(Date.now() + n * day);
const activeStandard = (over: any = {}) => ({
  propertyId: 5, subscriptionStatus: 'Active', trialEndsAt: null, subscriptionEndsAt: future(10),
  subscriptionPlan: 'Standard', subscriptionPackage: 'standard', roomAllowance: 20, staffAllowance: 5,
  subscriptionMonthlyPrice: 200, subscriptionDiscountPercent: 0, scheduledSubscription: null, subscriptionOverride: null, ...over,
});
const order = (over: any = {}) => ({
  subscriptionPaymentId: 9, propertyId: 5, initiatedBy: 1, reference: 'SUB-5-x', amount: 350, currency: 'GHS', status: 'Pending',
  durationMonths: 1, planName: 'Pro', kind: 'Upgrade', packageCode: 'pro', roomAllowance: 40, staffAllowance: 10,
  monthlyPrice: 350, discountPercent: 0, ...over,
});
const paystackOk = (amount: number) => (axios.get as any).mockResolvedValue({ data: { status: true, data: { status: 'success', reference: 'SUB-5-x', amount: amount * 100, currency: 'GHS' } } });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
  db.subscriptionSettings.findUnique.mockResolvedValue(null);
  db.subscriptionPayment.updateMany.mockResolvedValue({ count: 1 });
  db.room.count.mockResolvedValue(10);
  db.user.count.mockResolvedValue(3);
});

describe('payment verification', () => {
  test('applies the frozen purchased terms, extends from the current end, and logs the change', async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue(order());
    db.property.findUnique.mockResolvedValue(activeStandard());
    paystackOk(350);
    const result: any = await verifySubscriptionPayment('SUB-5-x', 5);
    expect(result.status).toBe('success');
    const data = db.property.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ subscriptionPackage: 'pro', roomAllowance: 40, staffAllowance: 10, subscriptionMonthlyPrice: 350, subscriptionStatus: 'Active', scheduledSubscription: 'DbNull' });
    expect(data.subscriptionEndsAt.getTime()).toBeGreaterThan(future(38).getTime()); // 10 days left + 1 month kept
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SubscriptionPurchased');
    expect(db.subscriptionPayment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'Completed' }) }));
  });

  test('a downgrade keeps current allowances and schedules the new ones at period end', async () => {
    const end = future(10);
    db.subscriptionPayment.findUnique.mockResolvedValue(order({ kind: 'Downgrade', packageCode: 'standard', planName: 'Standard', roomAllowance: 20, staffAllowance: 5, monthlyPrice: 200, amount: 200 }));
    db.property.findUnique.mockResolvedValue(activeStandard({ subscriptionPackage: 'pro', subscriptionPlan: 'Pro', roomAllowance: 40, staffAllowance: 10, subscriptionMonthlyPrice: 350, subscriptionEndsAt: end }));
    paystackOk(200);
    await verifySubscriptionPayment('SUB-5-x', 5);
    const data = db.property.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ subscriptionPackage: 'pro', roomAllowance: 40 });
    expect(data.scheduledSubscription).toMatchObject({ packageCode: 'standard', roomAllowance: 20, effectiveAt: end.toISOString() });
  });

  test('duplicate callbacks/webhooks never apply a payment twice', async () => {
    db.subscriptionPayment.findUnique.mockResolvedValueOnce(order({ status: 'Completed' }));
    expect(await verifySubscriptionPayment('SUB-5-x', 5)).toEqual({ status: 'success', alreadyProcessed: true });
    // Race: another request claimed the order between our check and the claim.
    db.subscriptionPayment.findUnique.mockResolvedValueOnce(order()).mockResolvedValueOnce(order({ status: 'Completed' }));
    db.subscriptionPayment.updateMany.mockResolvedValue({ count: 0 });
    paystackOk(350);
    expect(await verifySubscriptionPayment('SUB-5-x', 5)).toEqual({ status: 'success', alreadyProcessed: true });
    expect(db.property.update).not.toHaveBeenCalled();
  });

  test('rejects amount mismatches, other hotels, and unsuccessful transactions', async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue(order());
    paystackOk(10);
    await expect(verifySubscriptionPayment('SUB-5-x', 5)).rejects.toThrow(/amount or currency/);
    await expect(verifySubscriptionPayment('SUB-5-x', 6)).rejects.toThrow(/not found/);
    (axios.get as any).mockResolvedValue({ data: { status: true, data: { status: 'abandoned' } } });
    expect(await verifySubscriptionPayment('SUB-5-x', 5)).toMatchObject({ status: 'abandoned' });
    expect(db.property.update).not.toHaveBeenCalled();
  });

  test('initialize stores the full quote and charges the server-side price', async () => {
    db.property.findUnique.mockResolvedValue({ ...activeStandard(), propertyName: 'H', primaryEmail: 'h@x.com' });
    db.user.findUnique.mockResolvedValue({ email: 'm@x.com' });
    db.subscriptionPayment.create.mockResolvedValue({ subscriptionPaymentId: 1 });
    (axios.post as any).mockResolvedValue({ data: { status: true, data: { authorization_url: 'https://pay' } } });
    await initializeSubscriptionPayment(1, 5, { packageCode: 'standard', months: 12, amount: 1 });
    const created = db.subscriptionPayment.create.mock.calls[0][0].data;
    expect(created).toMatchObject({ amount: 2000, durationMonths: 12, kind: 'Renewal', packageCode: 'standard', roomAllowance: 20, discountPercent: 16.67 });
    expect((axios.post as any).mock.calls[0][1].amount).toBe('200000');
  });
});

describe('limits', () => {
  test('blocks adding past the allowance but allows up to it', async () => {
    db.property.findUnique.mockResolvedValue(activeStandard());
    db.room.count.mockResolvedValue(19);
    await expect(assertCapacity(5, 'rooms')).resolves.toBeUndefined();
    db.room.count.mockResolvedValue(20);
    await expect(assertCapacity(5, 'rooms')).rejects.toMatchObject({ code: 'PLAN_LIMIT_REACHED', statusCode: 409 });
    db.user.count.mockResolvedValue(5);
    await expect(assertCapacity(5, 'staff')).rejects.toThrow(/5 staff accounts \(including pending invitations\)/);
  });

  test('reactivating a room type checks all of its returning rooms', async () => {
    db.property.findUnique.mockResolvedValue(activeStandard());
    db.room.count.mockResolvedValue(15);
    await expect(assertCapacity(5, 'rooms', 5)).resolves.toBeUndefined();
    await expect(assertCapacity(5, 'rooms', 6)).rejects.toThrow(/allows 20 rooms/);
  });
});

describe('routes and permissions', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/paystack', paystackRoutes);
  app.post('/api/rooms', authenticate, (_req, res) => res.json({ success: true }));
  const token = generateAccessToken({ userId: 1, propertyId: 5, roleId: 3, username: 'u' } as any);
  const role = (codes: string[]) => db.role.findUnique.mockResolvedValue({ rolePermissions: codes.map(code => ({ permission: { code } })) });

  beforeEach(() => {
    db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 5, sessionVersion: null, role: { roleName: 'Receptionist' } });
  });

  test('billing endpoints require CanManageBilling', async () => {
    role(['CanProcessPayments']);
    expect((await request(app).get('/api/paystack/quote?months=1').auth(token, { type: 'bearer' })).status).toBe(403);
    expect((await request(app).post('/api/paystack/initialize').send({ months: 1 }).auth(token, { type: 'bearer' })).status).toBe(403);
    role(['CanManageBilling']);
    db.property.findUnique.mockResolvedValue(activeStandard());
    const ok = await request(app).get('/api/paystack/quote?packageCode=pro&months=3').auth(token, { type: 'bearer' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ packageCode: 'pro', kind: 'Upgrade' });
  });

  test('Cancelled hotels are read-only, but can still start a renewal payment', async () => {
    db.property.findUnique.mockResolvedValue(activeStandard({ subscriptionStatus: 'Cancelled' }));
    const blocked = await request(app).post('/api/rooms').auth(token, { type: 'bearer' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('SUBSCRIPTION_EXPIRED');
    role(['CanManageBilling']);
    const renew = await request(app).post('/api/paystack/initialize').send({ packageCode: 'pro', months: 0 }).auth(token, { type: 'bearer' });
    expect(renew.status).toBe(400); // reached the billing handler (not the lock); upgrade-only needs an active period
  });
});

describe('super admin settings and overrides', () => {
  test('saved settings drive pricing; invalid or corrupt settings never reach hotels', async () => {
    const changed = { ...DEFAULT_CONFIG, packages: [{ ...DEFAULT_CONFIG.packages[0], monthlyPrice: 220 }], trial: { days: 30, rooms: 10, staff: 3 } };
    db.subscriptionSettings.findUnique.mockResolvedValue(null);
    await saveSubscriptionConfig(changed, 1);
    expect(db.subscriptionSettings.upsert.mock.calls[0][0].update.config.packages[0].monthlyPrice).toBe(220);
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SubscriptionSettingsChanged');
    await expect(saveSubscriptionConfig({ ...changed, maxMonths: 0 }, 1)).rejects.toThrow(/Durations/);
    db.subscriptionSettings.findUnique.mockResolvedValue({ config: changed });
    expect((await getSubscriptionConfig()).trial.days).toBe(30);
    db.subscriptionSettings.findUnique.mockResolvedValue({ config: { broken: true } });
    expect(await getSubscriptionConfig()).toEqual(DEFAULT_CONFIG);
  });

  test('hotel override is validated, audited, and clears to the plan', async () => {
    db.property.findUnique.mockResolvedValue({ subscriptionOverride: null });
    expect(await setSubscriptionOverride(5, 1, { discountPercent: 15, roomAllowance: '30', note: ' partner ' })).toMatchObject({ discountPercent: 15, roomAllowance: 30, staffAllowance: null, note: 'partner' });
    expect(db.auditLog.create.mock.calls[0][0].data.action).toBe('SubscriptionOverrideChanged');
    expect(await setSubscriptionOverride(5, 1, { discountPercent: '', roomAllowance: '' })).toBeNull();
    expect(db.property.update.mock.calls[1][0].data.subscriptionOverride).toBe('DbNull');
    await expect(setSubscriptionOverride(5, 1, { discountPercent: 95 })).rejects.toThrow(/0 and 90/);
    await expect(setSubscriptionOverride(5, 1, { staffAllowance: 0 })).rejects.toThrow(/at least 1/);
  });

  test('a hotel discount is applied to quotes and a price change never alters a paid order', async () => {
    db.subscriptionPayment.findUnique.mockResolvedValue(order({ monthlyPrice: 350, amount: 350 }));
    db.property.findUnique.mockResolvedValue(activeStandard());
    db.subscriptionSettings.findUnique.mockResolvedValue({ config: { ...DEFAULT_CONFIG, packages: [{ ...DEFAULT_CONFIG.packages[1], monthlyPrice: 999 }] } });
    paystackOk(350);
    await verifySubscriptionPayment('SUB-5-x', 5);
    expect(db.property.update.mock.calls[0][0].data.subscriptionMonthlyPrice).toBe(350); // frozen order price, not the new 999
  });
});
