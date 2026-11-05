import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma';
import { authenticate } from '../src/shared/middleware/auth.middleware';
import { generateAccessToken, generateRefreshToken } from '../src/shared/utils/jwt';
import { refreshAccessToken } from '../src/modules/auth/auth.service';
import * as repository from '../src/modules/auth/auth.repository';

jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({
  user: { findUnique: jest.fn() }, property: { findUnique: jest.fn() },
})) }));
jest.mock('../src/modules/auth/auth.repository', () => ({ findUserById: jest.fn() }));

const db = (PrismaClient as any).mock.results[0].value;
const identity = { userId: 42, propertyId: 5, roleId: 3, username: 'receptionist' };
const accessToken = generateAccessToken(identity);
const app = express();
let actions = 0;
app.all('/action', authenticate, (_req, res) => { actions++; res.json({ success: true }); });
app.get('/api/rooms', authenticate, (_req, res) => res.json({ success: true }));
app.get('/api/housekeeping/rooms', authenticate, (_req, res) => res.json({ success: true }));

beforeEach(() => {
  jest.clearAllMocks(); actions = 0;
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 5 });
  db.property.findUnique.mockResolvedValue({ subscriptionStatus: 'Active' });
});

test('the same valid token is rejected on the next write after deactivation, before the action runs', async () => {
  expect((await request(app).post('/action').auth(accessToken, { type: 'bearer' })).status).toBe(200);
  db.user.findUnique.mockResolvedValue({ isActive: false, propertyId: 5 });
  const denied = await request(app).post('/action').auth(accessToken, { type: 'bearer' });
  expect(denied.status).toBe(401); expect(denied.body.code).toBe('STAFF_ACCOUNT_DISABLED');
  expect(actions).toBe(1); expect(db.user.findUnique).toHaveBeenCalledTimes(2);
});

test('deactivated accounts cannot read protected data with their old token either', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: false, propertyId: 5 });
  expect((await request(app).get('/action').auth(accessToken, { type: 'bearer' })).status).toBe(401);
  expect(actions).toBe(0);
});

test('housekeeper access is limited to housekeeping and account endpoints', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 5, role: { roleName: 'Housekeeper' } });
  expect((await request(app).get('/api/rooms').auth(accessToken, { type: 'bearer' })).status).toBe(403);
  expect((await request(app).get('/api/housekeeping/rooms').auth(accessToken, { type: 'bearer' })).status).toBe(200);
});

test('deleted and transferred accounts are rejected', async () => {
  for (const account of [null, { isActive: true, propertyId: 6 }]) {
    db.user.findUnique.mockResolvedValue(account);
    expect((await request(app).post('/action').auth(accessToken, { type: 'bearer' })).status).toBe(401);
  }
  expect(actions).toBe(0);
});

test('account lookup outages fail closed rather than authorizing an old token', async () => {
  db.user.findUnique.mockRejectedValue(new Error('Database unavailable'));
  expect((await request(app).post('/action').auth(accessToken, { type: 'bearer' })).status).toBe(503);
  expect(actions).toBe(0);
});

test('a deactivated receptionist cannot obtain a new access token using their refresh token', async () => {
  (repository.findUserById as any).mockResolvedValue({ ...identity, isActive: false });
  expect(await refreshAccessToken(generateRefreshToken(identity))).toMatchObject({ success: false });
});

test('changing a password rejects both the old access and refresh tokens', async () => {
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 5, sessionVersion: 'new-session' });
  const denied = await request(app).post('/action').auth(accessToken, { type: 'bearer' });
  expect(denied.status).toBe(401);
  expect(denied.body.code).toBe('STAFF_SESSION_EXPIRED');
  expect(actions).toBe(0);
  (repository.findUserById as any).mockResolvedValue({ ...identity, isActive: true, sessionVersion: 'new-session' });
  expect(await refreshAccessToken(generateRefreshToken(identity))).toMatchObject({ success: false });
});
