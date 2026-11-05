import { Router } from 'express';
import sharp from 'sharp';
import { prisma } from '../../shared/utils/prisma';

const router = Router();
const imageCache = new Map<string, Buffer>();
const MAX_CACHED_IMAGES = 60;

const photoList = (coverImage: string | null, galleryImages: unknown): string[] =>
  [...new Set([coverImage, ...(Array.isArray(galleryImages) ? galleryImages : [])]
    .filter((photo): photo is string => typeof photo === 'string' && !!photo))].slice(0, 3);

export const publicPhotoUrl = (propertyCode: string, index: number, variant: 'card' | 'full', updatedAt: Date): string =>
  `/public/images/${encodeURIComponent(propertyCode)}/${index}/${variant}?v=${updatedAt.getTime()}`;

export const publicPhotoReferences = (
  propertyCode: string,
  coverImage: string | null,
  galleryImages: unknown,
  updatedAt: Date,
  variant: 'card' | 'full',
): string[] => photoList(coverImage, galleryImages).map((photo, index) =>
  photo.startsWith('data:image/') ? publicPhotoUrl(propertyCode, index, variant, updatedAt) : photo);

router.get('/:propertyCode/:index/:variant', async (req, res) => {
  const index = Number(req.params.index);
  const variant = req.params.variant;
  if (!Number.isInteger(index) || index < 0 || index > 2 || (variant !== 'card' && variant !== 'full')) {
    return res.sendStatus(404);
  }

  try {
    const property = await prisma.property.findUnique({
      where: { propertyCode: req.params.propertyCode },
      select: { coverImage: true, galleryImages: true, updatedAt: true, isOnlineBookingEnabled: true, isActive: true },
    });
    if (!property?.isActive || !property.isOnlineBookingEnabled) return res.sendStatus(404);
    const photo = photoList(property.coverImage, property.galleryImages)[index];
    if (!photo?.startsWith('data:image/jpeg;base64,')) return res.sendStatus(404);

    const currentVersion = String(property.updatedAt.getTime());
    const cacheKey = `${req.params.propertyCode}:${index}:${variant}:${currentVersion}`;
    let image = imageCache.get(cacheKey);
    if (!image) {
      const original = Buffer.from(photo.slice('data:image/jpeg;base64,'.length), 'base64');
      const width = variant === 'card' ? 480 : 1280;
      image = await sharp(original).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: variant === 'card' ? 72 : 82 }).toBuffer();
      if (imageCache.size >= MAX_CACHED_IMAGES) imageCache.delete(imageCache.keys().next().value!);
      imageCache.set(cacheKey, image);
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', req.query.v === currentVersion ? 'public, max-age=31536000, immutable' : 'public, max-age=300');
    res.type('image/webp');
    return res.send(image);
  } catch (error) {
    console.error('Could not serve public property photo', error);
    return res.sendStatus(500);
  }
});

export default router;
