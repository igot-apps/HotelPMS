import sharp from 'sharp';

const [source] = process.argv.slice(2);
if (!source) {
  throw new Error('Usage: node scripts/optimize-logo.mjs <source-image>');
}

const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
let left = info.width;
let top = info.height;
let right = 0;
let bottom = 0;

for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const offset = (y * info.width + x) * 4;
    const distanceFromWhite = Math.max(255 - data[offset], 255 - data[offset + 1], 255 - data[offset + 2]);
    const alpha = Math.min(255, Math.max(0, Math.round((distanceFromWhite - 24) * 10)));
    data[offset + 3] = alpha;
    if (alpha > 16) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
}

if (left > right) throw new Error('No visible logo pixels found');
const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
const logo = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
  .extract(crop)
  .resize({ width: 512, withoutEnlargement: true });

await logo.clone().webp({ quality: 86, effort: 6 }).toFile('public/images/hideout24-logo.webp');
await logo.clone().resize(64, 64, { fit: 'contain', background: '#00000000' }).png({ compressionLevel: 9 }).toFile('public/favicon.png');
