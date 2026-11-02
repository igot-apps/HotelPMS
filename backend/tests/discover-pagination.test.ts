import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import app from '../src/app';
jest.mock('../src/modules/reservation/online-hold.service', () => ({ expireOnlineHolds: jest.fn<any>().mockResolvedValue(0) }));
import { prisma } from '../src/shared/utils/prisma';

jest.mock('../src/shared/utils/prisma', () => ({ prisma: {
  property: { findMany: jest.fn(), count: jest.fn() },
  amenity: { findMany: jest.fn() }, room: { count: jest.fn() },
} }));

const hotels = [
  { propertyId: 50, latitude: 0, longitude: 10 },
  { propertyId: 40, latitude: null, longitude: null },
  { propertyId: 30, latitude: 0, longitude: 1 },
  { propertyId: 20, latitude: 0, longitude: 0.1 },
  { propertyId: 10, latitude: 0, longitude: 1 },
];
const profile = (hotel: typeof hotels[number]) => ({ ...hotel,
  propertyCode: `hotel-${hotel.propertyId}`, propertyName: `Hotel ${hotel.propertyId}`,
  coverImage: 'photo', galleryImages: [], roomTypes: [{ basePrice: 200 }], amenities: [],
});

beforeEach(() => {
  jest.resetAllMocks();
  (prisma.property.count as any).mockResolvedValue(hotels.length);
  (prisma.amenity.findMany as any).mockResolvedValue([]);
  (prisma.room.count as any).mockResolvedValue(1);
  (prisma.property.findMany as any).mockImplementation(async (args: any) => {
    if (!args.select.propertyName) return hotels.map(hotel => ({ ...hotel }));
    const ordered = [...hotels].sort((a, b) => a.propertyId - b.propertyId);
    const ids = args.where.AND?.[1]?.propertyId?.in;
    return (ids ? ordered.filter(hotel => ids.includes(hotel.propertyId))
      : ordered.slice(args.skip, args.skip + args.take)).map(profile);
  });
});

describe('discovery distance pagination', () => {
  it('shows only assigned room-type amenities, deduplicated across eligible room types', async () => {
    const link = (name: string, propertyId = 10) => ({ amenity: { name, propertyId } });
    (prisma.property.findMany as any).mockResolvedValueOnce([{ ...profile(hotels[4]),
      amenities: [{ name: 'Unused catalog feature' }],
      roomTypes: [{ basePrice: 250, amenities: [link('TV'), link('Another hotel feature', 99)] },
        { basePrice: 500, amenities: [link('Breakfast'), link('Free Wi-Fi'), link('AC'), link('tv')] }],
    }]);
    const response = await request(app).get('/api/public/discover');
    expect(response.status).toBe(200);
    expect(response.body.data.hotels[0].amenities).toEqual(['tv', 'Breakfast', 'Free Wi-Fi', 'AC']);
    expect(response.body.data.hotels[0].minPrice).toBe(250);
    const selection = (prisma.property.findMany as any).mock.calls[0][0].select;
    expect(selection.roomTypes.take).toBeUndefined();
    expect(selection.roomTypes.select.amenities).toBeDefined();
    expect(selection.amenities).toBeUndefined();
  });
  it('ranks all matches before paginating, with deterministic ties and unknown coordinates last', async () => {
    const codes: string[] = [];
    for (let page = 1; page <= 3; page++) {
      const response = await request(app).get(`/api/public/discover?userLat=0&userLng=0&limit=2&page=${page}`);
      expect(response.status).toBe(200);
      expect(response.body.data.total).toBe(5);
      expect(response.body.data.totalPages).toBe(3);
      codes.push(...response.body.data.hotels.map((hotel: any) => hotel.propertyCode));
    }
    expect(codes).toEqual(['hotel-20', 'hotel-10', 'hotel-30', 'hotel-50', 'hotel-40']);
    expect(new Set(codes).size).toBe(5);
    const calls = (prisma.property.findMany as any).mock.calls;
    expect(calls[0][0]).toEqual(expect.objectContaining({ select: { propertyId: true, latitude: true, longitude: true } }));
    expect(calls[0][0].skip).toBeUndefined();
    expect(calls[1][0].where.AND[1].propertyId.in).toEqual([20, 10]);
  });

  it('retains search/date/price/amenity filters when ranking and loading profiles', async () => {
    const response = await request(app).get('/api/public/discover?userLat=5&userLng=-1&search=Accra&maxPrice=300&amenity=Wifi&checkIn=2030-01-01&checkOut=2030-01-03');
    expect(response.status).toBe(200);
    const [ranking, profiles] = (prisma.property.findMany as any).mock.calls.map((call: any[]) => call[0]);
    expect(profiles.where.AND[0]).toEqual(ranking.where);
    expect(ranking.where.roomTypes.some.basePrice).toEqual({ lte: 300 });
    expect(ranking.where.roomTypes.some.rooms.some.reservationRooms.none).toBeDefined();
    expect(ranking.where.roomTypes.some.amenities).toBeDefined();
    expect(ranking.where.OR).toContainEqual({ city: { contains: 'Accra', mode: 'insensitive' } });
  });

  it('uses stable database pagination without GPS', async () => {
    const response = await request(app).get('/api/public/discover?limit=2&page=2');
    expect(response.status).toBe(200);
    expect(response.body.data.hotels.map((hotel: any) => hotel.propertyCode)).toEqual(['hotel-30', 'hotel-40']);
    expect(prisma.property.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 2, take: 2, orderBy: { propertyId: 'asc' } }));
  });

  it('rejects partial and invalid coordinates and returns an empty out-of-range page', async () => {
    for (const query of ['userLat=5', 'userLat=abc&userLng=0', 'userLat=91&userLng=0', 'userLat=0&userLng=181']) {
      expect((await request(app).get(`/api/public/discover?${query}`)).status).toBe(400);
    }
    const response = await request(app).get('/api/public/discover?userLat=0&userLng=0&page=20&limit=2');
    expect(response.status).toBe(200);
    expect(response.body.data.hotels).toEqual([]);
    expect(response.body.data.total).toBe(5);
  });
});
