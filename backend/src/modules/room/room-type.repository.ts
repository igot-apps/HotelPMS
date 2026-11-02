import { PrismaClient } from '../../../src/generated/prisma';
const prisma = new PrismaClient();

export const createRoomType = async (data: {
  propertyId: number;
  typeName: string;
  description?: string;
  basePrice: number;
  maxOccupancy: number;
  isActive?: boolean;
  amenityIds?: number[]; // 🌟 ADDED: Accept array of amenity IDs
}) => {
  if (data.amenityIds !== undefined && (!Array.isArray(data.amenityIds) || data.amenityIds.some(id => !Number.isSafeInteger(id) || id < 1))) throw new Error('Choose valid room amenities.');
  const ids = [...new Set(data.amenityIds || [])];
  return prisma.$transaction(async tx => {
  if (ids.length && await tx.amenity.count({ where: { propertyId: data.propertyId, amenityId: { in: ids } } }) !== ids.length) throw new Error('Choose amenities belonging to this hotel.');
  return tx.roomType.create({
    data: {
      propertyId: data.propertyId,
      typeName: data.typeName,
      description: data.description,
      basePrice: data.basePrice,
      maxOccupancy: data.maxOccupancy || 1,
      isActive: data.isActive !== undefined ? data.isActive : true,
      // 🌟 ADDED: Link the selected amenities during creation
      ...(ids.length > 0 && {
        amenities: {
          create: ids.map((id) => ({
            amenity: { connect: { amenityId: id } },
          })),
        },
      }),
    },
    include: {
      property: { select: { propertyId: true, propertyName: true, propertyCode: true } },
      _count: { select: { rooms: true, ratePlans: true } },
      // 🌟 ADDED: Return the linked amenities in the response
      amenities: { include: { amenity: true } }, 
    },
  });
  });
};

export const findRoomTypes = async (
  propertyId?: number,
  page: number = 1,
  limit: number = 10
) => {
  const skip = (page - 1) * limit;
  const where: any = {};
  if (propertyId) where.propertyId = propertyId;
  where.isActive = true;

  const [roomTypes, total] = await Promise.all([
    prisma.roomType.findMany({
      where,
      skip,
      take: limit,
      orderBy: { typeName: 'asc' },
      include: {
        property: { select: { propertyId: true, propertyName: true, propertyCode: true } },
        _count: { select: { rooms: true, ratePlans: true } },
        // 🌟 ADDED: Include amenities in the list view
        amenities: { include: { amenity: true } }, 
      },
    }),
    prisma.roomType.count({ where }),
  ]);

  return { roomTypes, total, page, limit };
};

export const findRoomTypeById = async (roomTypeId: number) => {
  return prisma.roomType.findUnique({
    where: { roomTypeId },
    include: {
      property: { select: { propertyId: true, propertyName: true, propertyCode: true } },
      rooms: {
        include: {
          reservationRooms: {
            where: { 
              reservation: { 
                // 🌟 CHANGED: 'CheckedIn' → 'InHouse'
                status: { in: ['Confirmed', 'InHouse'] } 
              } 
            },
          },
        },
      },
      ratePlans: true,
      _count: { select: { rooms: true, ratePlans: true } },
      amenities: { include: { amenity: true } },
    },
  });
};

export const updateRoomType = async (
  roomTypeId: number,
  data: Partial<{
    typeName: string;
    description: string;
    basePrice: number;
    maxOccupancy: number;
    isActive: boolean;
    amenityIds: number[]; // 🌟 ADDED
  }>
) => {
  const { amenityIds, ...rest } = data;
  if (amenityIds !== undefined && (!Array.isArray(amenityIds) || amenityIds.some(id => !Number.isSafeInteger(id) || id < 1))) {
    throw new Error('Choose valid room amenities.');
  }
  const ids = amenityIds === undefined ? undefined : [...new Set(amenityIds)];
  return prisma.$transaction(async tx => {
    const roomType = await tx.roomType.findUniqueOrThrow({ where: { roomTypeId }, select: { propertyId: true } });
    if (ids?.length) {
      const count = await tx.amenity.count({ where: { amenityId: { in: ids }, propertyId: roomType.propertyId } });
      if (count !== ids.length) throw new Error('Choose amenities belonging to this hotel.');
    }
    return tx.roomType.update({
      where: { roomTypeId },
      data: {
        ...rest,
        // Junction records cannot be disconnected from their required room type.
        ...(ids !== undefined && { amenities: {
          deleteMany: {},
          create: ids.map(amenityId => ({ amenity: { connect: { amenityId } } })),
        } }),
      },
      include: { amenities: { include: { amenity: true } } },
    });
  });
};

export const deleteRoomType = async (roomTypeId: number) => {
  return prisma.roomType.update({
    where: { roomTypeId },
    data: { isActive: false },
  });
};

export const getRoomTypeStats = async (roomTypeId: number) => {
  const stats = await prisma.roomType.findUnique({
    where: { roomTypeId },
    include: {
      _count: { select: { rooms: true, ratePlans: true } },
      rooms: { where: { operationalStatus: 'Available' }, select: { roomId: true } },
    },
  });

  if (!stats) return null;

  return {
    roomTypeId: stats.roomTypeId,
    typeName: stats.typeName,
    basePrice: stats.basePrice,
    maxOccupancy: stats.maxOccupancy,
    totalRooms: stats._count.rooms,
    availableRooms: stats.rooms.length,
    occupiedRooms: stats._count.rooms - stats.rooms.length,
    totalRatePlans: stats._count.ratePlans,
    isActive: stats.isActive,
  };
};

// 🌟 NEW: Hard Delete Room Type (Permanent deletion)
export const hardDeleteRoomType = async (roomTypeId: number) => {
  return prisma.$transaction(async (tx) => {
    const roomType = await tx.roomType.findUnique({
      where: { roomTypeId },
      select: { roomTypeId: true, typeName: true },
    });

    if (!roomType) throw new Error('Room type not found');

    // ReservationRoom records are historical booking records. Keep them intact;
    // their foreign keys intentionally prevent deleting the room inventory they reference.
    const activeReservationRoomCount = await tx.reservationRoom.count({
      where: {
        roomTypeId,
        reservation: { status: { in: ['Pending', 'Confirmed', 'InHouse'] } },
      },
    });
    if (activeReservationRoomCount > 0) {
      throw new Error(
        `Cannot delete "${roomType.typeName}" because ${activeReservationRoomCount} pending, confirmed, or in-house reservation room record(s) still use it.`
      );
    }

    const reservationRoomRows = await tx.reservationRoom.findMany({
      where: { roomTypeId },
      select: {
        reservationRoomId: true,
        roomNumberSnapshot: true,
        roomTypeNameSnapshot: true,
        room: { select: { roomNumber: true } },
      },
    });

    for (const row of reservationRoomRows) {
      await tx.reservationRoom.update({
        where: { reservationRoomId: row.reservationRoomId },
        data: {
          roomNumberSnapshot: row.roomNumberSnapshot || row.room?.roomNumber || null,
          roomTypeNameSnapshot: row.roomTypeNameSnapshot || roomType.typeName,
        },
      });
    }

    const roomCount = await tx.room.count({ where: { roomTypeId } });
    const ratePlanCount = await tx.ratePlan.count({ where: { roomTypeId } });

    // Optional reservation links are detached by their SET NULL foreign keys;
    // dates, prices, occupants, and the room identity snapshots stay intact.
    await tx.ratePlan.deleteMany({ where: { roomTypeId } });
    await tx.room.deleteMany({ where: { roomTypeId } });
    await tx.roomType.delete({ where: { roomTypeId } });

    return { roomCount, ratePlanCount, preservedReservationRoomCount: reservationRoomRows.length };
  }, { isolationLevel: 'Serializable' });
};
