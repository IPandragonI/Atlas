import { describe, expect, it } from "vitest";
import { selectPrecache, toUrl } from "./sw-manifest.mjs";

const daily = (d: string) => `daily/${d}.json`;
const files = [
  "index.html", "fr/index.html", "en/game/index.html", "404.html", "sw.js", "manifest.webmanifest",
  "_next/static/chunks/a.js", "_next/static/chunks/a.js.map", "__next._tree.txt", "fr/__next.fr.txt",
  "data/world.geojson", "vendor/maplibre-gl-worker.mjs", "workers/generate.worker.js", "icons/icon-192.png", "daily/index.json",
  daily("2026-11-06"), daily("2026-11-07"), daily("2026-11-08"), daily("2026-12-08"), daily("2026-12-09"), daily("2027-06-01"),
];

describe("service worker precache selection", () => {
  const urls: string[] = selectPrecache(files, "2026-11-08");

  it("keeps the app shell, assets, data and both workers", () => {
    for (const u of ["/", "/fr/", "/en/game/", "/404.html", "/manifest.webmanifest", "/_next/static/chunks/a.js", "/data/world.geojson", "/vendor/maplibre-gl-worker.mjs", "/workers/generate.worker.js", "/icons/icon-192.png", "/daily/index.json"]) {
      expect(urls, u).toContain(u);
    }
  });
  it("skips source maps, RSC payloads and the service worker itself", () => {
    expect(urls.some((u) => u.endsWith(".map") || u.endsWith(".txt"))).toBe(false);
    expect(urls).not.toContain("/sw.js");
  });
  it("precaches only a window of daily files around today", () => {
    expect(urls).toContain("/daily/2026-11-07.json"); // yesterday
    expect(urls).toContain("/daily/2026-11-08.json"); // today
    expect(urls).toContain("/daily/2026-12-08.json"); // today + 30
    expect(urls).not.toContain("/daily/2026-11-06.json"); // older
    expect(urls).not.toContain("/daily/2026-12-09.json"); // today + 31
    expect(urls).not.toContain("/daily/2027-06-01.json"); // far future: cached on first use instead
  });
  it("is deterministic, sorted and duplicate-free", () => {
    expect(selectPrecache(files, "2026-11-08")).toEqual(urls);
    expect(urls).toEqual([...urls].sort());
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("maps index.html files to directory URLs", () => {
    expect(toUrl("index.html")).toBe("/");
    expect(toUrl("fr/collection/index.html")).toBe("/fr/collection/");
    expect(toUrl("data/world.geojson")).toBe("/data/world.geojson");
  });
});
