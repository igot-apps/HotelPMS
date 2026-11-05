const apiBaseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/$/, '');

export function publicImageSrc(reference) {
  return reference?.startsWith('/public/images/') ? `${apiBaseUrl}${reference}` : reference;
}
