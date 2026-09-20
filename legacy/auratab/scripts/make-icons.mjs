// Renders the AuraTab icon (gradient squircle with a 2x2 tile grid) to PNGs.
// Zero dependencies: rasterises with supersampling and writes PNG via node:zlib.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from './lib/crc32.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'icons');
const STORE = join(ROOT, 'store');
const SIZES = [16, 32, 48, 128];
const SS = 8; // subsamples per axis

// Design-system ramp (docs/design-system.md §2.1): Cool Deep 400 → Midnight 800, tiles in Periwinkle Pale 50.
const FROM = [0x5e, 0x64, 0x91]; // ramp-400
const TO = [0x1e, 0x23, 0x3c]; // ramp-800
const TILE = [0xe8, 0xea, 0xf5]; // ramp-50

function inRoundRect(x, y, left, top, size, radius) {
  const right = left + size;
  const bottom = top + size;
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

// Returns premultiplied [r, g, b, a] for a point in unit space.
function shade(u, v) {
  if (!inRoundRect(u, v, 0.02, 0.02, 0.96, 0.24)) return [0, 0, 0, 0];
  const t = (u + v) / 2;
  let rgb = FROM.map((c, i) => c + (TO[i] - c) * t);

  const tile = 0.24;
  const gap = 0.075;
  const start = 0.5 - tile - gap / 2;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const x0 = start + col * (tile + gap);
      const y0 = start + row * (tile + gap);
      if (inRoundRect(u, v, x0, y0, tile, 0.07)) {
        const alpha = row === 0 && col === 0 ? 1 : 0.55;
        rgb = rgb.map((c, i) => c + (TILE[i] - c) * alpha);
      }
    }
  }
  return [...rgb, 1];
}

function rasterise(size) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const [r, g, b, a] = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          acc[0] += r * a; acc[1] += g * a; acc[2] += b * a; acc[3] += a;
        }
      }
      const i = (y * size + x) * 4;
      const a = acc[3] / (SS * SS);
      pixels[i] = a ? Math.round(acc[0] / acc[3]) : 0;
      pixels[i + 1] = a ? Math.round(acc[1] / acc[3]) : 0;
      pixels[i + 2] = a ? Math.round(acc[2] / acc[3]) : 0;
      pixels[i + 3] = Math.round(a * 255);
    }
  }
  return pixels;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, rasterise(size)));
  console.log('wrote', file);
}

// Store logo (Edge Add-ons recommends 300x300).
mkdirSync(STORE, { recursive: true });
writeFileSync(join(STORE, 'logo-300.png'), encodePng(300, rasterise(300)));
console.log('wrote', join(STORE, 'logo-300.png'));
