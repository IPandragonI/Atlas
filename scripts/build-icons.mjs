// Generates the PNG PWA icons (pure Node: raster + zlib), matching public/icons/icon.svg.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icons");
fs.mkdirSync(out, { recursive: true });

const BG = [0x55, 0x74, 0x5c], FG = [0xf5, 0xf3, 0xeb], DOT = [0xc0, 0x8a, 0x2e];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
const mixc = (a, b, t) => a.map((v, i) => Math.round(v * t + b[i] * (1 - t)));
const smooth = (d, w) => Math.max(0, Math.min(1, 0.5 - d / w));

/** u,v in 0..1. `maskable` fills the whole square and shrinks the glyph into the safe zone. */
function drawer(maskable) {
  const scale = maskable ? 0.72 : 1;
  return (u, v) => {
    let col = BG, alpha = 255;
    if (!maskable) {
      // rounded square mask
      const r = 112 / 512, cx = Math.abs(u - 0.5) - (0.5 - r), cy = Math.abs(v - 0.5) - (0.5 - r);
      const d = Math.hypot(Math.max(cx, 0), Math.max(cy, 0)) + Math.min(Math.max(cx, cy), 0) - r;
      alpha = Math.round(255 * smooth(d, 0.004));
    }
    const x = (u - 0.5) / scale + 0.5, y = (v - 0.5) / scale + 0.5;
    const px = x * 512, py = y * 512, w = 11 * 1;
    const dc = Math.abs(Math.hypot(px - 256, py - 256) - 150);
    const dh = Math.abs(py - 256) > w ? 999 : Math.abs(px - 256) <= 150 ? 0 : 999;
    // meridians: ellipse arcs
    const ex = (px - 256) / 62, ey = (py - 256) / 150;
    const dm = Math.abs(Math.hypot(ex, ey) - 1) * 62;
    const line = Math.min(dc, dh, dm);
    col = mixc(FG, col, smooth(line - w, 1.6 / scale) * (Math.hypot(px - 256, py - 256) <= 151 + w ? 1 : 0));
    const dd = Math.hypot(px - 352, py - 170) - 26;
    col = mixc(DOT, col, smooth(dd, 1.6));
    return [col[0], col[1], col[2], alpha];
  };
}
fs.writeFileSync(path.join(out, "icon-192.png"), png(192, drawer(false)));
fs.writeFileSync(path.join(out, "icon-512.png"), png(512, drawer(false)));
fs.writeFileSync(path.join(out, "icon-maskable-512.png"), png(512, drawer(true)));
fs.writeFileSync(path.join(out, "apple-touch-icon.png"), png(180, drawer(true)));
console.log("icons written to", out);
