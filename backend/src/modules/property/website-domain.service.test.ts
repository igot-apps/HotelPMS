import { defaultHotelHostname, normalizeWebsiteHostname, paymentReturnBaseUrl, resolveWebsiteHostname } from './website-domain.service';
import { prisma } from '../../shared/utils/prisma';
import { beforeEach, expect, it, jest } from '@jest/globals';

jest.mock('../../shared/utils/prisma', () => ({ prisma: {
  propertyWebsiteDomain: { findUnique: jest.fn() },
  property: { findMany: jest.fn() },
} }));

const mapped = prisma.propertyWebsiteDomain.findUnique as unknown as jest.Mock<(...args: any[]) => Promise<any>>;
const properties = prisma.property.findMany as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

beforeEach(() => { jest.clearAllMocks(); mapped.mockResolvedValue(null); properties.mockResolvedValue([]); });

it('rejects invalid and reserved hostnames', () => {
  expect(normalizeWebsiteHostname('https://royalhotel.com')).toBeNull();
  expect(normalizeWebsiteHostname('app.hideout24.com')).toBeNull();
  expect(normalizeWebsiteHostname('royalhotel.com.evil.test/path')).toBeNull();
  expect(normalizeWebsiteHostname(' RoyalHotel.COM. ')).toBe('royalhotel.com');
  expect(defaultHotelHostname('OB-hotel')).toBe('ob-hotel.hideout24.com');
});

it('resolves only one active property for an included subdomain', async () => {
  properties.mockResolvedValueOnce([{ propertyId: 7, propertyCode: 'OB-hotel', propertyName: 'OB Hotel', isActive: true, status: 'Active', isOnlineBookingEnabled: true }]);
  expect((await resolveWebsiteHostname('ob-hotel.hideout24.com'))?.propertyId).toBe(7);
  properties.mockResolvedValueOnce([{ propertyId: 7, propertyCode: 'OB-hotel' }, { propertyId: 8, propertyCode: 'ob-hotel' }]);
  expect(await resolveWebsiteHostname('ob-hotel.hideout24.com')).toBeNull();
});

it('never uses an unverified or another hotel domain for a payment return', async () => {
  mapped.mockResolvedValueOnce({ isActive: false, property: { propertyId: 7, isActive: true, status: 'Active', isOnlineBookingEnabled: true } });
  await expect(paymentReturnBaseUrl('royalhotel.com', 7, 'https://hideout24.com')).rejects.toThrow();
  mapped.mockResolvedValueOnce({ isActive: true, property: { propertyId: 8, isActive: true, status: 'Active', isOnlineBookingEnabled: true } });
  await expect(paymentReturnBaseUrl('royalhotel.com', 7, 'https://hideout24.com')).rejects.toThrow();
  expect(await paymentReturnBaseUrl(undefined, 7, 'https://hideout24.com')).toBe('https://hideout24.com');
});
