/**
 * Objective audit of the curated sea links: for every pair, the shortest distance between the two countries'
 * coastlines (haversine over a sample of polygon vertices, ≈ ±15 km). Writes src/data/connections/sea-audit.json.
 *   npm run data:audit-sea
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const world = JSON.parse(fs.readFileSync(path.join(root, "public/data/world.geojson"), "utf8")) as {
  features: { properties: { id: string; playable: boolean }; geometry: { coordinates: number[][][][] } }[];
};
const connections = JSON.parse(fs.readFileSync(path.join(root, "src/data/connections/connections.json"), "utf8")) as { sea: [string, string][] };

const R = 6371;
const rad = (d: number) => (d * Math.PI) / 180;
function haversine(a: number[], b: number[]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// sampled outline vertices per country (outer rings only), at most ~1500 points
const points = new Map<string, number[][]>();
for (const f of world.features) {
  if (!f.properties.playable) continue;
  const all: number[][] = [];
  for (const poly of f.geometry.coordinates) for (const p of poly[0]) all.push(p);
  const step = Math.max(1, Math.floor(all.length / 1500));
  points.set(f.properties.id, all.filter((_, i) => i % step === 0));
}

const rows = connections.sea.map(([a, b]) => {
  let best = Infinity;
  for (const p of points.get(a)!) for (const q of points.get(b)!) best = Math.min(best, haversine(p, q));
  return { a, b, km: Math.round(best) };
});
rows.sort((x, y) => y.km - x.km);
fs.writeFileSync(path.join(root, "src/data/connections/sea-audit.json"), JSON.stringify({ generatedFrom: "Natural Earth 1:50m", pairs: rows }, null, 1));
console.log(`${rows.length} sea links audited. Longest crossings:`);
for (const r of rows.slice(0, 30)) console.log(`${r.a}-${r.b}: ${r.km} km`);
const buckets = [100, 200, 300, 500, 800, 1500];
console.log(buckets.map((b, i) => `<=${b}km: ${rows.filter((r) => r.km <= b && (i === 0 || r.km > buckets[i - 1])).length}`).join("  "), `>${buckets[buckets.length - 1]}km: ${rows.filter((r) => r.km > buckets[buckets.length - 1]).length}`);
