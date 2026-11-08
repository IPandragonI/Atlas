// Builds every brand asset from the single source image `logo.png` (a stylized "A" above the wordmark "ATLAS" on cream).
//   public/logo/mark.png       the stylized A, transparent, brand green   (header, share image; tinted with CSS masks)
//   public/logo/wordmark.png   the word "ATLAS", transparent, brand green
//   public/icons/*             favicon (the A only), PWA icons (any + maskable), Apple touch icon
//   public/favicon.ico         16 / 32 / 48 px PNG entries
// Usage: npm run brand:build   (commit the generated files; the site build does not need to run it)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "logo.png");
const pub = path.join(root, "public");
const GREEN = [0x1f, 0x45, 0x38];
const CREAM = [0xfb, 0xf7, 0xeb];
fs.mkdirSync(path.join(pub, "icons"), { recursive: true });
fs.mkdirSync(path.join(pub, "logo"), { recursive: true });

// ---- 1. alpha mask from luminance: dark artwork (~0.2) on cream (~0.97) -> opaque on transparent, anti-aliased edges kept
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const alpha = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) {
  const L = (0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]) / 255;
  alpha[i] = Math.round(255 * Math.min(1, Math.max(0, (0.88 - L) / (0.88 - 0.45))));
}

/** Bounding box of the opaque pixels inside a horizontal band of the logo. */
function bbox(y0, y1) {
  let x0 = W, x1 = -1, ty0 = H, ty1 = -1;
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (alpha[y * W + x] > 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); ty0 = Math.min(ty0, y); ty1 = Math.max(ty1, y); }
  if (x1 < 0) throw new Error(`nothing found in rows ${y0}-${y1}`);
  return { left: x0, top: ty0, width: x1 - x0 + 1, height: ty1 - ty0 + 1 };
}
// The band split is the empty gap between the A and the wordmark.
let gap = 0;
{
  const rowHas = (y) => { for (let x = 0; x < W; x++) if (alpha[y * W + x] > 128) return true; return false; };
  let y = 0;
  while (!rowHas(y)) y++; // top of the A
  while (rowHas(y)) y++; // through the A
  gap = y; // first empty row below the A
}
const markBox = bbox(0, gap);
const wordBox = bbox(gap, H);

/** RGBA PNG buffer of a region of the mask, filled with one colour. */
async function tinted(box, rgb) {
  const px = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) {
    const o = (y * box.width + x) * 4;
    px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = alpha[(box.top + y) * W + box.left + x];
  }
  return sharp(px, { raw: { width: box.width, height: box.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

const markGreen = await tinted(markBox, GREEN);
const markCream = await tinted(markBox, CREAM);
fs.writeFileSync(path.join(pub, "logo/mark.png"), markGreen);
fs.writeFileSync(path.join(pub, "logo/wordmark.png"), await tinted(wordBox, GREEN));

// ---- 2. icons: the A in cream on a brand-green tile (readable on any tab / home-screen background)
async function tile(size, { markFrac, radiusFrac = 0 }) {
  const mw = Math.round(size * markFrac);
  const markImg = await sharp(markCream).resize({ width: mw }).toBuffer();
  const mh = (await sharp(markImg).metadata()).height;
  let base = sharp({ create: { width: size, height: size, channels: 4, background: { r: GREEN[0], g: GREEN[1], b: GREEN[2], alpha: 1 } } })
    .composite([{ input: markImg, left: Math.round((size - mw) / 2), top: Math.round((size - mh) / 2) }]);
  if (radiusFrac > 0) {
    const r = Math.round(size * radiusFrac);
    const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`);
    base = sharp(await base.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
  }
  return base.png({ compressionLevel: 9 }).toBuffer();
}

const out = (name, buf) => fs.writeFileSync(path.join(pub, name), buf);
out("icons/icon-192.png", await tile(192, { markFrac: 0.6, radiusFrac: 0.22 }));
out("icons/icon-512.png", await tile(512, { markFrac: 0.6, radiusFrac: 0.22 }));
out("icons/icon-maskable-512.png", await tile(512, { markFrac: 0.5 })); // full bleed, the A inside the 80% safe zone
out("icons/apple-touch-icon.png", await tile(180, { markFrac: 0.6 })); // iOS rounds the corners itself
const fav = { 16: await tile(16, { markFrac: 0.74, radiusFrac: 0.2 }), 32: await tile(32, { markFrac: 0.72, radiusFrac: 0.2 }), 48: await tile(48, { markFrac: 0.7, radiusFrac: 0.2 }) };
out("icons/favicon-32.png", fav[32]);
out("icons/favicon-48.png", fav[48]);

// favicon.ico with PNG entries (supported by every current browser)
const sizes = [16, 32, 48];
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = head.length;
sizes.forEach((s, i) => {
  const o = 6 + i * 16;
  head[o] = s; head[o + 1] = s; head[o + 2] = 0; head[o + 3] = 0;
  head.writeUInt16LE(1, o + 4); head.writeUInt16LE(32, o + 6);
  head.writeUInt32LE(fav[s].length, o + 8); head.writeUInt32LE(offset, o + 12);
  offset += fav[s].length;
});
out("favicon.ico", Buffer.concat([head, ...sizes.map((s) => fav[s])]));

console.log(`brand assets written: mark ${markBox.width}x${markBox.height}, wordmark ${wordBox.width}x${wordBox.height}`);
