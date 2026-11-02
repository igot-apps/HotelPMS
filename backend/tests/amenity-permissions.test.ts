import { beforeEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma';
import router from '../src/modules/amenity/amenity.routes';
import { generateAccessToken } from '../src/shared/utils/jwt';
import { saveAmenity, removeAmenity } from '../src/modules/amenity/amenity.service';

jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({
  user: { findUnique: jest.fn() }, property: { findUnique: jest.fn() }, role: { findUnique: jest.fn() },
})) }));
jest.mock('../src/shared/utils/prisma', () => ({ prisma: { amenity: { findMany: jest.fn<any>().mockResolvedValue([]) } } }));
jest.mock('../src/modules/amenity/amenity.service', () => ({ amenityDetails: {}, saveAmenity: jest.fn(), removeAmenity: jest.fn() }));
const db = (PrismaClient as any).mock.results[0].value;
const token = generateAccessToken({ userId: 4, propertyId: 5, roleId: 3, username: 'desk' });
const app = express(); app.use(express.json()); app.use('/amenities', router);
beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({ isActive: true, propertyId: 5 });
  db.property.findUnique.mockResolvedValue({ subscriptionStatus: 'Active' });
  db.role.findUnique.mockResolvedValue({ rolePermissions: [] });
});
test('staff can read amenities but cannot mutate them without room-type permissions', async () => {
  expect((await request(app).get('/amenities').auth(token, { type: 'bearer' })).status).toBe(200);
  for (const [method, path] of [['post', '/amenities'], ['put', '/amenities/1'], ['delete', '/amenities/1']] as const) {
    expect((await request(app)[method](path).auth(token, { type: 'bearer' }).send({ name: 'TV' })).status).toBe(403);
  }
  expect(saveAmenity).not.toHaveBeenCalled(); expect(removeAmenity).not.toHaveBeenCalled();
});
test('authorized creation uses the current hotel, ignoring a supplied hotel ID', async () => {
  db.role.findUnique.mockResolvedValue({ rolePermissions: [{ permission: { code: 'CanCreateRoomType' } }] });
  (saveAmenity as any).mockResolvedValue({ amenity: { amenityId: 1, name: 'TV' }, reused: false });
  expect((await request(app).post('/amenities').auth(token, { type: 'bearer' }).send({ name: 'TV', propertyId: 99 })).status).toBe(201);
  expect(saveAmenity).toHaveBeenCalledWith(5, { name: 'TV', propertyId: 99 });
});
test('invalid amenity IDs are rejected before deletion', async () => {
  db.role.findUnique.mockResolvedValue({ rolePermissions: [{ permission: { code: 'CanDeleteRoomType' } }] });
  for (const id of ['NaN', '-1', '1.5']) expect((await request(app).delete(`/amenities/${id}`).auth(token, { type: 'bearer' })).status).toBe(400);
  expect(removeAmenity).not.toHaveBeenCalled();
});
test('removing assignments also requires room-type editing permission', async () => {
  db.role.findUnique.mockResolvedValue({ rolePermissions: [{ permission: { code: 'CanDeleteRoomType' } }] });
  expect((await request(app).delete('/amenities/1').auth(token, { type: 'bearer' }).send({ confirmedRoomTypeIds: [4] })).status).toBe(403);
  expect(removeAmenity).not.toHaveBeenCalled();
});
