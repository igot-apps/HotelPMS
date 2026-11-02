import { beforeEach, expect, jest, test } from '@jest/globals';
import { PrismaClient } from '../src/generated/prisma';
import { createRoomType } from '../src/modules/room/room-type.repository';
jest.mock('../src/generated/prisma', () => ({ PrismaClient: jest.fn().mockImplementation(() => ({ $transaction: jest.fn() })) }));
const db = (PrismaClient as any).mock.results[0].value;
const tx = { amenity: { count: jest.fn<any>() }, roomType: { create: jest.fn<any>() } };
const data = { propertyId: 7, typeName: 'Standard', basePrice: 200, maxOccupancy: 2 };
beforeEach(() => {
  jest.resetAllMocks();
  db.$transaction.mockImplementation((work: any) => work(tx));
});
test('room types reject foreign or missing amenities without creating anything', async () => {
  tx.amenity.count.mockResolvedValue(0);
  await expect(createRoomType({ ...data, amenityIds: [99] })).rejects.toThrow('belonging to this hotel');
  expect(tx.amenity.count).toHaveBeenCalledWith({ where: { propertyId: 7, amenityId: { in: [99] } } });
  expect(tx.roomType.create).not.toHaveBeenCalled();
});
test('room types deduplicate repeated amenity IDs before creating junction records', async () => {
  tx.amenity.count.mockResolvedValue(1);
  await createRoomType({ ...data, amenityIds: [2, 2] });
  expect(tx.roomType.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amenities: { create: [{ amenity: { connect: { amenityId: 2 } } }] } }) }));
});
test('invalid amenity IDs are rejected before opening a write transaction', async () => {
  await expect(createRoomType({ ...data, amenityIds: [-1] })).rejects.toThrow('valid room amenities');
  expect(db.$transaction).not.toHaveBeenCalled();
});
