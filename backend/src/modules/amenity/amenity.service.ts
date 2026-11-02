import { prisma } from '../../shared/utils/prisma';

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export function amenityName(value: unknown): string {
  if (typeof value !== 'string') throw fail('Enter an amenity name.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 100) throw fail('Amenity names must contain 1–100 characters.');
  return name;
}
export const amenityDetails = {
  _count: { select: { roomTypes: true } },
  roomTypes: { select: { roomType: { select: { roomTypeId: true, typeName: true } } } },
};
export async function saveAmenity(propertyId: number, input: any, amenityId?: number) {
  const name = amenityName(input?.name);
  if (input?.icon !== undefined && input.icon !== null && (typeof input.icon !== 'string' || input.icon.length > 50)) throw fail('Choose a valid amenity icon.');
  return prisma.$transaction(async tx => {
    // Serialize catalog writes per hotel, including case/spacing variations.
    await tx.$queryRaw`SELECT "propertyId" FROM properties WHERE "propertyId" = ${propertyId} FOR UPDATE`;
    const amenities = await tx.amenity.findMany({ where: { propertyId } });
    const existing = amenityId === undefined ? null : amenities.find(a => a.amenityId === amenityId);
    if (amenityId !== undefined && !existing) throw fail('Amenity not found.', 404);
    const duplicate = amenities.find(a => a.name.trim().replace(/\s+/g, ' ').toLowerCase() === name.toLowerCase() && a.amenityId !== amenityId);
    if (duplicate) {
      if (amenityId !== undefined) throw fail('An amenity with this name already exists. Use the existing amenity.', 409);
      return { amenity: await tx.amenity.findUniqueOrThrow({ where: { amenityId: duplicate.amenityId }, include: amenityDetails }), reused: true };
    }
    const data = { name, ...(input.icon !== undefined ? { icon: input.icon || null } : {}) };
    const amenity = existing
      ? await tx.amenity.update({ where: { amenityId: existing.amenityId }, data, include: amenityDetails })
      : await tx.amenity.create({ data: { ...data, propertyId }, include: amenityDetails });
    return { amenity, reused: false };
  });
}
export async function removeAmenity(propertyId: number, amenityId: number, confirmedRoomTypeIds?: number[]) {
  if (confirmedRoomTypeIds !== undefined && (!Array.isArray(confirmedRoomTypeIds) || confirmedRoomTypeIds.some(id => !Number.isSafeInteger(id) || id < 1))) throw fail('Invalid room-type confirmation.');
  return prisma.$transaction(async tx => {
    // The lock also blocks concurrent FK assignments until deletion commits.
    await tx.$queryRaw`SELECT "amenityId" FROM amenities WHERE "amenityId" = ${amenityId} AND "propertyId" = ${propertyId} FOR UPDATE`;
    const existing = await tx.amenity.findFirst({ where: { amenityId, propertyId }, include: { _count: { select: { roomTypes: true } }, roomTypes: { select: { roomTypeId: true, roomType: { select: { propertyId: true } } } } } });
    if (!existing) throw fail('Amenity not found.', 404);
    if (existing._count.roomTypes > 0) {
      if (confirmedRoomTypeIds === undefined) throw fail('Review and confirm the affected room types before deleting this amenity.', 409);
      const links = existing.roomTypes;
      const expected = [...new Set(confirmedRoomTypeIds || [])].sort((a, b) => a - b);
      const actual = links.map(link => link.roomTypeId).sort((a, b) => a - b);
      if (confirmedRoomTypeIds === undefined || JSON.stringify(expected) !== JSON.stringify(actual)) throw fail('Room-type assignments must be confirmed before deletion. Refresh the library, review the affected room types, and confirm again.', 409);
      if (links.some(link => link.roomType.propertyId !== propertyId)) throw fail('An assignment belongs to another hotel. Contact support to review it.', 409);
      await tx.roomTypeAmenity.deleteMany({ where: { amenityId, roomTypeId: { in: actual } } });
    }
    await tx.amenity.delete({ where: { amenityId } });
  });
}
