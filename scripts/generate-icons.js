/**
 * One-time script to generate PNG icons from the SVG source.
 * Run: node scripts/generate-icons.js
 * Requires: npm install sharp (dev dependency, not needed for builds)
 */
import sharp from 'sharp';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const svgPath = resolve(rootDir, 'public/pwa-512x512.svg');
const outDir = resolve(rootDir, 'public/icons');

const sizes = [48, 72, 96, 128, 144, 192, 384, 512];

async function generate() {
  for (const size of sizes) {
    const outPath = resolve(outDir, `icon-${size}x${size}.png`);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outPath);
    console.log(`✓ ${outPath}`);
  }
  console.log('\nDone! Commit public/icons/ to the repo.');
}

generate().catch(err => {
  console.error(err);
  process.exit(1);
});
