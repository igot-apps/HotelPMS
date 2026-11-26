import * as propertyRepository from './property.repository';
import { platformMoolreConfig } from '../payment/moolre.client';
import { prisma } from '../../shared/utils/prisma';
import { defaultHotelHostname } from './website-domain.service';
import { isWithinGhanaBounds } from '../../shared/utils/ghana-coordinates';

export const createProperty = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyName) throw new Error('Property name is required');
  if (data.country && String(data.country).toLowerCase() !== 'ghana') throw new Error('Hotels must be located in Ghana.');
  if (data.latitude === '' || data.longitude === '' || data.latitude == null || data.longitude == null || !isWithinGhanaBounds(Number(data.latitude), Number(data.longitude))) {
    throw new Error('Choose the property’s Google Maps coordinates within Ghana.');
  }
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
    if (!property && !domain) return propertyRepository.createProperty({ ...data, country: 'Ghana', latitude: Number(data.latitude), longitude: Number(data.longitude), propertyCode: code });
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

export const getPlatformProperties = async (page: number, limit: number, search: string, state = '', sort = 'newest') => {
  return propertyRepository.findPlatformProperties(page, limit, search, state, sort);
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
    'country', 'latitude', 'longitude', 'primaryEmail', 'primaryPhone', 'primaryPhoneWhatsappOnly', 'coverImage',
    'galleryImages', 'publicDescription', 'cancellationPolicy', 'houseRules', 'taxPercentage',
    'isOnlineBookingEnabled', 'checkInTime', 'checkOutTime', 'isNonRefundable', 'allowEarlyDepartureChargeReduction',
    'earlyDepartureChargeReductionPenaltyPercent',
  ] as const;
  const updateData: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) updateData[field] = data[field];
  }
  if (updateData.country !== undefined && String(updateData.country).toLowerCase() !== 'ghana') throw new Error('Hotels must be located in Ghana.');
  if (updateData.isNonRefundable !== undefined && typeof updateData.isNonRefundable !== 'boolean') throw new Error('Choose whether bookings are refundable.');
  if (updateData.allowEarlyDepartureChargeReduction !== undefined && typeof updateData.allowEarlyDepartureChargeReduction !== 'boolean') throw new Error('Choose an early-departure charge policy.');

  // Moolre keys change only with explicit consent, so saving other details can never wipe them.
  const moolreFields = ['moolreUsername', 'moolrePublicKey', 'moolreAccountNumber', 'moolreWebhookSecret'] as const;
  const suppliedMoolre = moolreFields.some(field => data[field] !== undefined);
  if (data.removeMoolreKeys === true) {
    for (const field of moolreFields) updateData[field] = null;
  } else if (suppliedMoolre && data.replaceMoolreKeys !== true) {
    throw new Error('Choose Replace Moolre keys before changing the payment setup.');
  } else if (data.replaceMoolreKeys === true) {
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    const username = text(data.moolreUsername);
    const publicKey = text(data.moolrePublicKey);
    const accountNumber = text(data.moolreAccountNumber);
    const webhookSecret = text(data.moolreWebhookSecret);
    if (!username || !publicKey || !accountNumber) throw new Error('Enter the Moolre username, public key and wallet account number.');
    if (username.length > 100 || /\s/.test(username)) throw new Error('Enter a valid Moolre username.');
    if (publicKey.length > 2000 || /\s/.test(publicKey)) throw new Error('Enter a valid Moolre public key.');
    if (!/^[0-9]{4,50}$/.test(accountNumber)) throw new Error('Enter the Moolre wallet account number (digits only).');
    if (webhookSecret.length > 2000) throw new Error('Enter a valid Moolre webhook secret.');
    Object.assign(updateData, { moolreUsername: username, moolrePublicKey: publicKey, moolreAccountNumber: accountNumber, moolreWebhookSecret: webhookSecret || null });
  }

  if (updateData.earlyDepartureChargeReductionPenaltyPercent !== undefined) {
    const raw = updateData.earlyDepartureChargeReductionPenaltyPercent;
    const penalty = Number(raw);
    if (raw === null || raw === '' || typeof raw === 'boolean' || !Number.isFinite(penalty) || penalty < 0 || penalty > 100 || Math.round(penalty * 100) / 100 !== penalty) throw new Error('Early-departure penalty must be between 0 and 100%, with at most two decimal places.');
    updateData.earlyDepartureChargeReductionPenaltyPercent = penalty;
  }
  if (updateData.taxPercentage !== undefined) {
    const tax = Number(updateData.taxPercentage);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error('Tax percentage must be between 0 and 100.');
    updateData.taxPercentage = tax;
  }
  if (updateData.latitude !== undefined || updateData.longitude !== undefined) {
    const latitude = updateData.latitude === undefined ? property.latitude : updateData.latitude;
    const longitude = updateData.longitude === undefined ? property.longitude : updateData.longitude;
    if (latitude === '' || longitude === '' || latitude == null || longitude == null || !isWithinGhanaBounds(Number(latitude), Number(longitude))) {
      throw new Error('Choose the property’s Google Maps coordinates within Ghana.');
    }
    updateData.latitude = Number(latitude);
    updateData.longitude = Number(longitude);
  }

  const willHaveOwnMoolre = updateData.moolreUsername !== undefined ? Boolean(updateData.moolreUsername)
    : Boolean(property.moolreUsername && property.moolrePublicKey && property.moolreAccountNumber);
  const onlineWillBeOn = updateData.isOnlineBookingEnabled === true || (updateData.isOnlineBookingEnabled === undefined && data.removeMoolreKeys === true && property.isOnlineBookingEnabled);
  if (onlineWillBeOn && !willHaveOwnMoolre && !platformMoolreConfig()) {
    throw new Error('Configure Moolre keys before enabling online bookings.');
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

export const reactivateProperty = async (propertyId: number) => {
  const property = await propertyRepository.findPropertyById(propertyId);
  if (!property) throw new Error('Property not found');
  return propertyRepository.reactivateProperty(propertyId);
};
