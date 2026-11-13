// Broad geographic bounds; the map preview lets the owner verify the exact pin.
export const isWithinGhanaBounds = (latitude: number, longitude: number): boolean =>
  Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= 4.5 && latitude <= 11.2
  && longitude >= -3.3 && longitude <= 1.3;
