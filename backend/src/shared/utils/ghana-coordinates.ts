// Broad geographic bounds; the map preview lets the owner verify the exact pin.
export const isWithinGhanaBounds = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= 4.5 && latitude <= 11.2
  && longitude >= -3.3 && longitude <= 1.3;

const blank = (value: unknown) => value === undefined || value === null || String(value).trim() === '';

/**
 * Coordinates are optional: both blank means "not set yet" (null). If either is given, both are
 * required and must be inside Ghana.
 */
export function parseOptionalCoordinates(latitude: unknown, longitude: unknown): { latitude: number | null; longitude: number | null } {
  if (blank(latitude) && blank(longitude)) return { latitude: null, longitude: null };
  const lat = Number(latitude), lng = Number(longitude);
  if (blank(latitude) || blank(longitude) || !isWithinGhanaBounds(lat, lng)) {
    throw new Error('Enter both Google Maps coordinates within Ghana, or leave both empty and add them later.');
  }
  return { latitude: lat, longitude: lng };
}
