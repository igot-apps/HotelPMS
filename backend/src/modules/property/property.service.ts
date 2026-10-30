import * as propertyRepository from './property.repository';

export const createProperty = async (data: any) => {
  // ✅ Removed tenantId check
  if (!data.propertyName) throw new Error('Property name is required');
  if (!data.propertyCode) throw new Error('Property code is required');
  
  return propertyRepository.createProperty(data);
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

  if (typeof data.paystackSecretKey === 'string' && data.paystackSecretKey.trim()) {
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
