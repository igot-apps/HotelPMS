export const isWithinGhanaBounds = (latitude, longitude) =>
  Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= 4.5 && latitude <= 11.2
  && longitude >= -3.3 && longitude <= 1.3;

export const googleMapsUrl = (latitude, longitude) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`;
