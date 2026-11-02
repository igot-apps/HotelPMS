import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/optimize-discovery-hero.mjs <source-image>');
const directory = fileURLToPath(new URL('../public/images/', import.meta.url));
await mkdir(directory, { recursive: true });
const metadata = await sharp(input).metadata();
// Retain the illuminated hotel and palms when art-directing the phone crop.
const cropWidth = Math.round(metadata.height * 0.6);
const left = Math.max(0, Math.min(metadata.width - cropWidth, Math.round(metadata.width * 0.25 - cropWidth / 2)));
for (const width of [480, 768]) {
  const result = await sharp(input).extract({ left, top: 0, width: cropWidth, height: metadata.height })
    .resize(width, Math.round(width / 0.6)).webp({ quality: 72, effort: 6 })
    .toFile(`${directory}/discovery-hero-mobile-${width}.webp`);
  console.log(`Mobile ${width}px: ${(result.size / 1024).toFixed(1)} KB`);
}
for (const width of [1280, 1920]) {
  const result = await sharp(input).resize({ width, withoutEnlargement: true })
    .webp({ quality: 76, effort: 6 }).toFile(`${directory}/discovery-hero-${width}.webp`);
  console.log(`Desktop ${width}px: ${(result.size / 1024).toFixed(1)} KB`);
}
