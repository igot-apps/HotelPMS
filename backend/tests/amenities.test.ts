import { beforeEach, expect, jest, test } from '@jest/globals';
import { prisma } from '../src/shared/utils/prisma';
import { amenityName, saveAmenity, removeAmenity } from '../src/modules/amenity/amenity.service';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
const tx = { $queryRaw: jest.fn<any>(), roomTypeAmenity: { deleteMany: jest.fn<any>() }, amenity: {
  findMany: jest.fn<any>(), findUniqueOrThrow: jest.fn<any>(), findFirst: jest.fn<any>(), create: jest.fn<any>(), update: jest.fn<any>(), delete: jest.fn<any>(),
} };
beforeEach(() => {
  jest.resetAllMocks();
  (prisma.$transaction as any).mockImplementation((work: any) => work(tx));
  tx.amenity.findMany.mockResolvedValue([]);
  tx.amenity.create.mockImplementation(async (input: any) => ({ amenityId: 1, ...input.data }));
});
test('validates names without accepting blank, non-string, or oversized input', () => {
  for (const value of ['', '   ', null, 42, 'a'.repeat(101)]) expect(() => amenityName(value)).toThrow();
  expect(amenityName('  Free   Wi-Fi  ')).toBe('Free Wi-Fi');
});
test('new amenities are normalized and scoped to the authenticated hotel', async () => {
  const result = await saveAmenity(7, { name: ' Hot   water ' });
  expect(result.amenity).toMatchObject({ name: 'Hot water', propertyId: 7 });
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.amenity.findMany).toHaveBeenCalledWith({ where: { propertyId: 7 } });
});
test('case and whitespace variations reuse an existing amenity', async () => {
  tx.amenity.findMany.mockResolvedValue([{ amenityId: 9, name: 'Free  Wi-Fi' }]);
  tx.amenity.findUniqueOrThrow.mockResolvedValue({ amenityId: 9 });
  expect((await saveAmenity(7, { name: ' free wi-fi ' })).reused).toBe(true);
  expect(tx.amenity.create).not.toHaveBeenCalled();
});
test('renaming to an existing name is rejected without overwriting either amenity', async () => {
  tx.amenity.findMany.mockResolvedValue([{ amenityId: 1, name: 'TV' }, { amenityId: 2, name: 'Wi-Fi' }]);
  await expect(saveAmenity(7, { name: 'wifi' }, 99)).rejects.toMatchObject({ statusCode: 404 });
  await expect(saveAmenity(7, { name: 'wi-fi' }, 1)).rejects.toMatchObject({ statusCode: 409 });
  expect(tx.amenity.update).not.toHaveBeenCalled();
});
test('renaming preserves an existing icon unless explicitly changed', async () => {
  tx.amenity.findMany.mockResolvedValue([{ amenityId: 1, name: 'TV', icon: 'tv' }]);
  await saveAmenity(7, { name: 'Television' }, 1);
  expect(tx.amenity.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Television' } }));
});
test('assigned amenities cannot be deleted; unrelated hotels cannot delete them', async () => {
  tx.amenity.findFirst.mockResolvedValueOnce({ amenityId: 1, _count: { roomTypes: 2 } }).mockResolvedValueOnce(null);
  await expect(removeAmenity(7, 1)).rejects.toMatchObject({ statusCode: 409 });
  await expect(removeAmenity(8, 1)).rejects.toMatchObject({ statusCode: 404 });
  expect(tx.amenity.delete).not.toHaveBeenCalled();
});
test('unused amenities can be deleted after locking and checking usage', async () => {
  tx.amenity.findFirst.mockResolvedValue({ amenityId: 1, _count: { roomTypes: 0 } });
  await removeAmenity(7, 1);
  expect(tx.$queryRaw).toHaveBeenCalled();
  expect(tx.amenity.delete).toHaveBeenCalledWith({ where: { amenityId: 1 } });
});
test('assigned deletion requires exactly the room types previewed and removes assignments atomically', async () => {
  tx.amenity.findFirst.mockResolvedValue({ amenityId: 1, _count: { roomTypes: 1 }, roomTypes: [{ roomTypeId: 4, roomType: { propertyId: 7 } }] });
  await expect(removeAmenity(7, 1, [3])).rejects.toMatchObject({ statusCode: 409 });
  expect(tx.roomTypeAmenity.deleteMany).not.toHaveBeenCalled();
  expect(tx.amenity.delete).not.toHaveBeenCalled();
  await removeAmenity(7, 1, [4]);
  expect(tx.roomTypeAmenity.deleteMany).toHaveBeenCalledWith({ where: { amenityId: 1, roomTypeId: { in: [4] } } });
  expect(tx.amenity.delete).toHaveBeenCalledWith({ where: { amenityId: 1 } });
});
