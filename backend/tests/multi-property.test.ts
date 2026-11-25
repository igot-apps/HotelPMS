import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma';
import { authenticate } from '../src/shared/middleware/auth.middleware';
import { generateAccessToken } from '../src/shared/utils/jwt';
import { atProperty, countsAsStaff, auditAt, listAccessibleProperties, canAccessProperty } from '../src/shared/utils/property-access';

jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({
  user: { findUnique: jest.fn() }, property: { findUnique: jest.fn() },
})) }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: {} }));

const db = (PrismaClient as any).mock.results[0].value;
const ownerAt = (propertyId: number) => generateAccessToken({ userId: 7, propertyId, roleId: 1, username: 'owner' });
const app = express();
let actions = 0;
app.all('/api/action', authenticate, (_req, res) => { actions++; res.json({ success: true }); });
app.post('/api/auth/switch-property', authenticate, (_req, res) => res.json({ success: true }));
app.post('/api/auth/properties', authenticate, (_req, res) => res.json({ success: true }));

beforeEach(() => {
  jest.clearAllMocks(); actions = 0;
  db.property.findUnique.mockResolvedValue({ subscriptionStatus: 'Active', subscriptionEndsAt: null, trialEndsAt: null });
});

test('an owner token for an additional property works only while that membership is active', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 1, memberships: [{ propertyId: 2 }] });
  expect((await request(app).post('/api/action').auth(ownerAt(2), { type: 'bearer' })).status).toBe(200);
  // The lookup only asks for an active membership in the token's property.
  expect(db.user.findUnique.mock.calls[0][0].select.memberships.where).toEqual({ propertyId: 2, isActive: true });

  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 1, memberships: [] });
  const removed = await request(app).post('/api/action').auth(ownerAt(2), { type: 'bearer' });
  expect(removed.status).toBe(401); expect(removed.body.code).toBe('STAFF_ACCESS_CHANGED');
  expect(actions).toBe(1);
});

test('the home property keeps working without a membership row (existing accounts)', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 1 });
  expect((await request(app).get('/api/action').auth(ownerAt(1), { type: 'bearer' })).status).toBe(200);
});

test('a deactivated account loses every property at once', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: false, propertyId: 1, memberships: [{ propertyId: 2 }] });
  expect((await request(app).get('/api/action').auth(ownerAt(2), { type: 'bearer' })).status).toBe(401);
});

test('a token without a property never matches a membership', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 1, memberships: [{ propertyId: 0 }] });
  expect((await request(app).get('/api/action').auth(ownerAt(0), { type: 'bearer' })).status).toBe(401);
});

test('an expired property is read-only but the owner can still switch away or add a property', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 1, memberships: [{ propertyId: 2 }] });
  db.property.findUnique.mockResolvedValue({ subscriptionStatus: 'Expired', subscriptionEndsAt: new Date(Date.now() - 1000), trialEndsAt: null });
  const token = ownerAt(2);
  expect((await request(app).post('/api/action').auth(token, { type: 'bearer' })).body.code).toBe('SUBSCRIPTION_EXPIRED');
  expect((await request(app).get('/api/action').auth(token, { type: 'bearer' })).status).toBe(200);
  expect((await request(app).post('/api/auth/switch-property').auth(token, { type: 'bearer' })).status).toBe(200);
  expect((await request(app).post('/api/auth/properties').auth(token, { type: 'bearer' })).status).toBe(200);
  // Expiry is read from the token's (active) property only.
  expect(db.property.findUnique.mock.calls.every((c: any) => c[0].where.propertyId === 2)).toBe(true);
});

test('query fragments scope people, staff seats and audit entries to one property', () => {
  expect(atProperty(3)).toEqual({ OR: [{ propertyId: 3 }, { memberships: { some: { propertyId: 3, isActive: true } } }] });
  expect(countsAsStaff(3)).toEqual({ propertyId: 3, NOT: { memberships: { some: { propertyId: 3, isOwner: true } } } });
  expect(auditAt(3)).toEqual({ OR: [{ propertyId: 3 }, { propertyId: null, user: { propertyId: 3 } }] });
});

test('switcher lists home first, then active memberships, with owner flags', async () => {
  const fake: any = {
    user: { findUnique: jest.fn<any>().mockResolvedValue({ propertyId: 1, memberships: [{ propertyId: 1, isOwner: true }, { propertyId: 5, isOwner: true }] }) },
    property: { findMany: jest.fn<any>().mockResolvedValue([{ propertyId: 5, propertyName: 'Beach' }, { propertyId: 1, propertyName: 'City' }]) },
  };
  const list = await listAccessibleProperties(fake, 7);
  expect(list.map(p => [p.propertyId, p.isOwner])).toEqual([[1, true], [5, true]]);
  expect(fake.user.findUnique.mock.calls[0][0].select.memberships.where).toEqual({ isActive: true });
});

test('access checks require an active account and refuse property 0', async () => {
  const fake: any = { user: { findFirst: jest.fn<any>().mockResolvedValue(null) } };
  expect(await canAccessProperty(fake, 7, 0)).toBe(false);
  expect(fake.user.findFirst).not.toHaveBeenCalled();
  expect(await canAccessProperty(fake, 7, 9)).toBe(false);
  expect(fake.user.findFirst.mock.calls[0][0].where).toEqual({ userId: 7, isActive: true, ...atProperty(9) });
});
