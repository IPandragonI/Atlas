import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../../..");
const pub = (p: string) => path.join(root, "public", p);
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("brand assets built from logo.png", () => {
  it("the source logo and the generator are in the repository", () => {
    expect(fs.existsSync(path.join(root, "logo.png"))).toBe(true);
    expect(fs.existsSync(path.join(root, "scripts/build-brand.mjs"))).toBe(true);
    expect(JSON.parse(read("package.json")).scripts["brand:build"]).toBe("node scripts/build-brand.mjs");
  });

  it("every icon has exactly the size it claims", async () => {
    const expected: Record<string, number> = {
      "icons/icon-192.png": 192, "icons/icon-512.png": 512, "icons/icon-maskable-512.png": 512,
      "icons/apple-touch-icon.png": 180, "icons/favicon-32.png": 32, "icons/favicon-48.png": 48,
    };
    for (const [file, size] of Object.entries(expected)) {
      const m = await sharp(pub(file)).metadata();
      expect([m.width, m.height], file).toEqual([size, size]);
      expect(m.format, file).toBe("png");
    }
  });

  it("the favicon is the stylized A on a tile: dark tile, light A in the middle", async () => {
    for (const file of ["icons/favicon-48.png", "icons/icon-512.png", "icons/apple-touch-icon.png"]) {
      const { data, info } = await sharp(pub(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const px = (x: number, y: number) => { const o = (y * info.width + x) * 4; return data[o] + data[o + 1] + data[o + 2]; };
      const cx = Math.floor(info.width / 2);
      expect(px(Math.floor(info.width * 0.12), Math.floor(info.height * 0.5)), `${file} tile`).toBeLessThan(260); // brand green
      let light = 0;
      for (let y = Math.floor(info.height * 0.3); y < Math.floor(info.height * 0.7); y++) if (px(cx, y) > 600) light++; // the cream A
      expect(light, `${file} has the A in the middle`).toBeGreaterThan(info.height * 0.05);
    }
  });

  it("the maskable icon is full bleed with the A inside the safe zone", async () => {
    const { data, info } = await sharp(pub("icons/icon-maskable-512.png")).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(255); // corner pixel opaque: no transparent margin that a mask could expose
    // no light pixel outside the central 80% (the maskable safe zone)
    const margin = Math.round(info.width * 0.1);
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (x >= margin && x < info.width - margin && y >= margin && y < info.height - margin) continue;
      const o = (y * info.width + x) * 4;
      expect(data[o] + data[o + 1] + data[o + 2]).toBeLessThan(400);
    }
  });

  it("favicon.ico holds the 16, 32 and 48 px images", () => {
    const ico = fs.readFileSync(pub("favicon.ico"));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1); // icon type
    const count = ico.readUInt16LE(4);
    expect(count).toBe(3);
    expect(Array.from({ length: count }, (_, i) => ico[6 + i * 16])).toEqual([16, 32, 48]);
    for (let i = 0; i < count; i++) {
      const len = ico.readUInt32LE(6 + i * 16 + 8);
      const off = ico.readUInt32LE(6 + i * 16 + 12);
      expect(ico.subarray(off, off + 8).toString("hex")).toBe("89504e470d0a1a0a"); // an embedded PNG
      expect(off + len).toBeLessThanOrEqual(ico.length);
    }
  });

  it("the logo mark and wordmark are transparent PNGs (corners see through) with the aspect ratios the CSS expects", async () => {
    const css = read("src/app/globals.css");
    for (const [file, ratio] of [["logo/mark.png", /aspect-ratio: 460 \/ 326/], ["logo/wordmark.png", /aspect-ratio: 774 \/ 134/]] as const) {
      const m = await sharp(pub(file)).metadata();
      expect(m.hasAlpha, file).toBe(true);
      expect(css, file).toMatch(ratio);
      const { data, info } = await sharp(pub(file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data[3], `${file} top-left corner`).toBe(0);
      let opaque = 0;
      let clear = 0;
      for (let i = 3; i < data.length; i += 4) { if (data[i] > 200) opaque++; if (data[i] === 0) clear++; }
      expect(clear, `${file} is mostly see-through around the artwork`).toBeGreaterThan(info.width * info.height * 0.15);
      expect(opaque, `${file} has artwork`).toBeGreaterThan(info.width * info.height * 0.1);
    }
    expect(css).toContain("/logo/mark.png");
    expect(css).toContain("/logo/wordmark.png");
  });
});

describe("the icons are referenced everywhere, and nothing points at the old globe icon", () => {
  it("every icon in the manifest exists and has the declared size", async () => {
    const manifest = JSON.parse(fs.readFileSync(pub("manifest.webmanifest"), "utf8")) as { icons: { src: string; sizes: string; type: string; purpose: string }[] };
    expect(manifest.icons.map((i) => i.purpose).sort()).toEqual(["any", "any", "maskable"]);
    for (const i of manifest.icons) {
      expect(fs.existsSync(pub(i.src.slice(1))), i.src).toBe(true);
      expect(i.type).toBe("image/png");
      const m = await sharp(pub(i.src.slice(1))).metadata();
      expect(`${m.width}x${m.height}`).toBe(i.sizes);
    }
  });

  it("the page metadata points at existing files: favicon.ico, the PNG favicons (the A) and the Apple touch icon", () => {
    const layout = read("src/app/[locale]/layout.tsx");
    const urls = [...layout.matchAll(/["'](\/(?:icons\/|favicon)[^"']+)["']/g)].map((m) => m[1]);
    expect(urls).toEqual(expect.arrayContaining(["/favicon.ico", "/icons/favicon-32.png", "/icons/favicon-48.png", "/icons/apple-touch-icon.png"]));
    for (const u of urls) expect(fs.existsSync(pub(u.slice(1))), u).toBe(true);
  });

  it("the old globe icon and its generator are gone, and no source file refers to them", () => {
    expect(fs.existsSync(pub("icons/icon.svg"))).toBe(false);
    expect(fs.existsSync(path.join(root, "scripts/build-icons.mjs"))).toBe(false);
    for (const f of ["src/app/[locale]/layout.tsx", "src/components/ui/Header.tsx", "public/manifest.webmanifest", "docs/ARCHITECTURE.md", "package.json"]) {
      expect(read(f), f).not.toMatch(/icon\.svg|build-icons/);
    }
  });

  it("the header uses the logo (mark + wordmark), not a drawn globe", () => {
    const header = read("src/components/ui/Header.tsx");
    expect(header).toContain('data-testid="brand-mark"');
    expect(header).toContain('data-testid="brand-word"');
    expect(header).not.toContain("<svg");
  });
});
