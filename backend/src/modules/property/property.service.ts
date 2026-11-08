import * as propertyRepository from './property.repository';
import { prisma } from '../../shared/utils/prisma';
import { defaultHotelHostname } from './website-domain.service';

export const createProperty = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyName) throw new Error('Property name is required');
  const requestedCode = typeof data.propertyCode === 'string' ? data.propertyCode.trim().toLowerCase() : '';
  if (requestedCode && requestedCode !== data.propertyCode.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) throw new Error('Use letters, numbers, and hyphens for the hotel code.');
  const base = String(requestedCode || data.propertyName).trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42).replace(/-$/, '');
  if (!base) throw new Error('Choose a hotel name that can form a valid website address.');
  if (requestedCode && !defaultHotelHostname(base)) throw new Error('This hotel code is reserved. Choose another.');
  let code = defaultHotelHostname(base) ? base : `${base}-hotel`;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const [property, domain] = await Promise.all([
      prisma.property.findFirst({ where: { propertyCode: { equals: code, mode: 'insensitive' } }, select: { propertyId: true } }),
      prisma.propertyWebsiteDomain.findUnique({ where: { hostname: `${code}.hideout24.com` }, select: { domainId: true } }),
    ]);
    if (!property && !domain) return propertyRepository.createProperty({ ...data, propertyCode: code });
    if (data.propertyCode) throw new Error('This hotel code is already in use. Choose another.');
    code = `${base}-${suffix}`;
  }
  throw new Error('Could not assign a unique hotel website address.');
};

export const getProperties = async (
  page: number = 1,
  limit: number = 10,
  propertyId?: number
) => {
  return propertyRepository.findProperties(page, limit, propertyId);
};

export const getPlatformProperties = async (page: number, limit: number, search: string) => {
  return propertyRepository.findPlatformProperties(page, limit, search);
};

export const getPropertyById = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');
  return property;
};

// ✅ Renamed from getPropertiesByTenant
export const getAllActiveProperties = async (propertyId?: number) => {
  return propertyRepository.findAllActiveProperties(propertyId);
};

export const getPropertyStats = async (propertyId: number) => {
  const stats = await propertyRepository.getPropertyStats(propertyId);
  if (!stats) throw new Error('Property not found');
  return stats;
};

export const updateProperty = async (propertyId: number, data: any) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');

  const allowedFields = [
    'propertyName', 'businessName', 'legalName', 'propertyType', 'address', 'area', 'city', 'region',
    'country', 'ghanaPostAddress', 'latitude', 'longitude', 'primaryEmail', 'primaryPhone', 'primaryPhoneWhatsappOnly', 'coverImage',
    'galleryImages', 'publicDescription', 'cancellationPolicy', 'houseRules', 'taxPercentage',
    'isOnlineBookingEnabled', 'checkInTime', 'checkOutTime',
  ] as const;
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) updateData[field] = data[field];
  }

  if (data.paystackSecretKey !== undefined && data.replacePaystackSecretKey !== true) {
    throw new Error('Choose Replace Paystack key before changing the payment setup.');
  }
  if (data.replacePaystackSecretKey === true && (typeof data.paystackSecretKey !== 'string' || !data.paystackSecretKey.trim())) {
    throw new Error('Enter a new Paystack key to replace the current one.');
  }
  if (data.replacePaystackSecretKey === true) {
    const key = data.paystackSecretKey.trim();
    if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) {
      throw new Error('Enter a valid Paystack secret key beginning with sk_test_ or sk_live_.');
    }
    updateData.paystackSecretKey = key;
  }

  if (updateData.taxPercentage !== undefined) {
    const tax = Number(updateData.taxPercentage);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error('Tax percentage must be between 0 and 100.');
    updateData.taxPercentage = tax;
  }
  for (const field of ['latitude', 'longitude'] as const) {
    if (updateData[field] !== undefined && updateData[field] !== null) {
      const coordinate = Number(updateData[field]);
      if (!Number.isFinite(coordinate) || (field === 'latitude' && (coordinate < -90 || coordinate > 90)) || (field === 'longitude' && (coordinate < -180 || coordinate > 180))) {
        throw new Error(`Enter a valid ${field === 'latitude' ? 'latitude' : 'longitude'}.`);
      }
      updateData[field] = coordinate;
    }
  }

  if (updateData.isOnlineBookingEnabled === true && !property.paystackSecretKey && !process.env.PAYSTACK_SECRET_KEY && !updateData.paystackSecretKey) {
    throw new Error('Configure a Paystack key before enabling online bookings.');
  }

  if (updateData.galleryImages !== undefined) {
    if (!Array.isArray(updateData.galleryImages) || updateData.galleryImages.length > 2) {
      throw new Error('Choose no more than three property photos, including the cover photo.');
    }
    for (const image of updateData.galleryImages) {
      if (typeof image !== 'string' || image.length > 500_000) {
        throw new Error('Each uploaded photo must be 350 KB or smaller.');
      }
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image) && !/^https:\/\/.+/.test(image)) {
        throw new Error('Property photos must be JPEG uploads or secure image URLs.');
      }
    }
  }
  if (updateData.coverImage !== undefined && typeof updateData.coverImage !== 'string') {
    throw new Error('Choose a valid cover photo.');
  }
  if (typeof updateData.coverImage === 'string' && updateData.coverImage.length > 500_000) {
    throw new Error('Each uploaded photo must be 350 KB or smaller.');
  }

  if (typeof updateData.propertyName === 'string' && !updateData.propertyName.trim()) throw new Error('Property name cannot be empty.');
  if (typeof updateData.checkInTime === 'string' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(updateData.checkInTime)) throw new Error('Enter a valid check-in time.');
  if (typeof updateData.checkOutTime === 'string' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(updateData.checkOutTime)) throw new Error('Enter a valid check-out time.');

  return propertyRepository.updateProperty(propertyId, updateData);
};

export const deleteProperty = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');
  return propertyRepository.deleteProperty(propertyId);
};

export const permanentlyDeleteProperty = (propertyId: number, confirmationCode: string) =>
  propertyRepository.permanentlyDeleteProperty(propertyId, confirmationCode);
