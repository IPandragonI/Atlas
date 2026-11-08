import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");

/** Reads the custom properties declared in a rule block (`:root { ... }` or `:root[data-theme="dark"] { ... }`). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = tokens(":root {");
const dark = { ...light, ...tokens(':root[data-theme="dark"]') };

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

describe("light theme map contrast", () => {
  it("land is clearly distinguishable from the ocean (it was 1.06, nearly invisible)", () => {
    expect(ratio(light["--land"], light["--water"])).toBeGreaterThanOrEqual(1.25);
    expect(ratio(light["--land"], light["--water"])).toBeLessThan(1.6); // subtle, not aggressive
  });
  it("land is darker than the ocean, and non-playable territories sit between them", () => {
    expect(lum(light["--land"])).toBeLessThan(lum(light["--water"]));
    expect(lum(light["--land-off"])).toBeGreaterThan(lum(light["--land"]));
    expect(lum(light["--land-off"])).toBeLessThan(lum(light["--water"]));
  });
  it("borders stay readable against the land", () => {
    expect(ratio(light["--map-border"], light["--land"])).toBeGreaterThanOrEqual(1.8);
  });
  it("discovered, start, destination, route and hint states stay distinguishable from land and ocean", () => {
    for (const bg of [light["--land"], light["--water"]]) {
      expect(ratio(light["--discovered"], bg), `discovered vs ${bg}`).toBeGreaterThanOrEqual(1.25);
      expect(ratio(light["--accent"], bg), `start vs ${bg}`).toBeGreaterThanOrEqual(3);
      expect(ratio(light["--dest"], bg), `destination vs ${bg}`).toBeGreaterThanOrEqual(1.8);
      expect(ratio(light["--hint"], bg), `hint vs ${bg}`).toBeGreaterThanOrEqual(1.6);
    }
    expect(ratio(light["--discovered"], light["--accent"])).toBeGreaterThanOrEqual(1.5); // traversed vs start
  });
  it("map labels and text keep an accessible contrast on land and ocean", () => {
    expect(ratio(light["--text"], light["--land"])).toBeGreaterThanOrEqual(7);
    expect(ratio(light["--text"], light["--water"])).toBeGreaterThanOrEqual(7);
  });
  it("the interface text colours still pass WCAG AA", () => {
    expect(ratio(light["--text"], light["--bg"])).toBeGreaterThanOrEqual(7);
    expect(ratio(light["--text-2"], light["--bg"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light["--text-2"], light["--surface"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(light["--accent-contrast"], light["--accent"])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark theme is unchanged", () => {
  it("keeps its original map palette", () => {
    expect(dark["--land"]).toBe("#303633");
    expect(dark["--land-off"]).toBe("#262b29");
    expect(dark["--water"]).toBe("#1b1f1e");
    expect(dark["--border"]).toBe("#555d57");
    expect(dark["--discovered"]).toBe("#6e9873");
    expect(dark["--accent"]).toBe("#a1c69f");
    expect(dark["--bg"]).toBe("#171a19");
  });
  it("map border and region tint resolve to the previous dark values", () => {
    expect(dark["--map-border"]).toBe(dark["--border"]); // the map used --border before
    expect(dark["--map-region"]).toBe(dark["--accent-soft"]); // the map used --accent-soft before
  });
  it("dark text and map states keep an accessible contrast", () => {
    expect(ratio(dark["--text"], dark["--bg"])).toBeGreaterThanOrEqual(7);
    expect(ratio(dark["--text-2"], dark["--bg"])).toBeGreaterThanOrEqual(4.5);
    expect(ratio(dark["--accent"], dark["--land"])).toBeGreaterThanOrEqual(3);
  });
});
