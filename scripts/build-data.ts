/**
 * Builds the committed geographic datasets from:
 *  - world-countries (mledoze): names (en/fr), codes, capitals, land borders, regions
 *  - Natural Earth 1:50m admin_0_map_units (public domain): geometry + population estimates
 *  - src/data/connections/overrides.ts: reviewed land corrections and curated sea links
 * Outputs: src/data/countries.json, src/data/connections/connections.json, public/data/world.geojson
 */
import fs from "node:fs";
import path from "node:path";
import worldCountries from "world-countries";
import { DISPUTED_CONNECTIONS, LAND_ADDITIONS, LAND_REMOVALS, SEA_CONNECTIONS, STRAIT_CONNECTIONS } from "../src/data/connections/overrides";
import { ALIASES, CAPITAL_FR, CAPITAL_OVERRIDES, CONTINENT_OVERRIDES, ISLAND_OVERRIDES, NAME_OVERRIDES } from "../src/data/countries-meta";
import { normalizeText } from "../src/engine/search";

type Pos = number[];
type Poly = Pos[][];
interface NeFeature {
  properties: Record<string, string | number>;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: Poly | Poly[] };
}

const root = path.resolve(__dirname, "..");
const ne = JSON.parse(
  fs.readFileSync(path.join(root, "data-src/ne_50m_admin_0_map_units.geojson"), "utf8"),
) as { features: NeFeature[] };

const NE_TO_ISO: Record<string, string> = { SDS: "SSD", PSX: "PSE" };
/** Map units rendered but NOT part of their sovereign's playable geometry (overseas / remote). */
const EXCLUDED_UNITS = new Set(["MYT", "REU", "MTQ", "GLP", "GUF", "NLY", "NJM", "NSV", "TKL"]);

const playable = worldCountries.filter((c) => c.unMember || c.cca3 === "VAT" || c.cca3 === "PSE");
if (playable.length !== 195) throw new Error(`Expected 195 playable states, got ${playable.length}`);
const playableIds = new Set<string>(playable.map((c) => c.cca3));

const round = (n: number) => Math.round(n * 1000) / 1000;
const roundPoly = (p: Poly): Poly => p.map((r) => r.map(([x, y]) => [round(x), round(y)]));
const polysOf = (f: NeFeature): Poly[] =>
  f.geometry.type === "Polygon" ? [f.geometry.coordinates as Poly] : (f.geometry.coordinates as Poly[]);

const ringArea = (r: Pos[]) => {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
};
const ringCentroid = (r: Pos[]): [number, number] => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f;
  }
  a /= 2;
  return a === 0 ? [r[0][0], r[0][1]] : [cx / (6 * a), cy / (6 * a)];
};
const polyBBox = (p: Poly): [number, number, number, number] => {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const [x, y] of p[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
function mapContinent(region: string, sub: string): string {
  if (region === "Americas") return sub === "South America" ? "south-america" : "north-america";
  return ({ Europe: "europe", Africa: "africa", Asia: "asia", Oceania: "oceania" } as Record<string, string>)[region] ?? region.toLowerCase();
}

// ---- Group NE units per sovereign id
const groups = new Map<string, { polys: Poly[]; pop: number }>();
const neutralFeatures: { type: string; properties: object; geometry: { type: string; coordinates: Poly[] } }[] = [];
for (const f of ne.features) {
  const p = f.properties;
  const adm = NE_TO_ISO[p.ADM0_A3 as string] ?? (p.ADM0_A3 as string);
  const su = p.SU_A3 as string;
  if (adm === "ATA") continue;
  if (playableIds.has(adm) && !EXCLUDED_UNITS.has(su)) {
    const g = groups.get(adm) ?? { polys: [], pop: 0 };
    g.polys.push(...polysOf(f).map(roundPoly));
    g.pop += Number(p.POP_EST) || 0;
    groups.set(adm, g);
  } else {
    const id = `X-${su}-${p.NAME}`.replace(/[^A-Za-z0-9-]/g, "_");
    neutralFeatures.push({
      type: "Feature",
      properties: { id, playable: false, name: p.NAME },
      geometry: { type: "MultiPolygon", coordinates: polysOf(f).map(roundPoly) },
    });
  }
}

// ---- Countries
type Src = (typeof worldCountries)[number];
const sourceNames = (c: Src) => ({ fr: c.translations.fra?.common ?? c.name.common, en: c.name.common });
const nameOf = (c: Src) => ({ ...sourceNames(c), ...NAME_OVERRIDES[c.cca3] });
/** Source names replaced by a correction stay searchable (old names, spellings people still type). */
const replaced = (c: Src) => {
  const o = NAME_OVERRIDES[c.cca3];
  const s = sourceNames(c);
  return { fr: o?.fr && o.fr !== s.fr ? [s.fr] : [], en: o?.en && o.en !== s.en ? [s.en] : [] };
};
const countries = playable
  .map((c) => {
    const g = groups.get(c.cca3);
    if (!g) throw new Error(`No geometry for ${c.cca3}`);
    const sorted = [...g.polys].sort((a, b) => Math.abs(ringArea(b[0])) - Math.abs(ringArea(a[0])));
    const main = sorted[0];
    const mainArea = Math.abs(ringArea(main[0]));
    const major = sorted.filter((p) => Math.abs(ringArea(p[0])) >= mainArea * 0.1);
    let bbox = major
      .map(polyBBox)
      .reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
    if (bbox[2] - bbox[0] > 180) bbox = polyBBox(main);
    const center = ringCentroid(main[0]).map(round) as [number, number];
    const al = ALIASES[c.cca3] ?? { fr: [], en: [] };
    const alt = [...c.altSpellings, c.name.official, c.translations.fra?.official ?? ""].filter((s) => s.length >= 3);
    return {
      id: c.cca3,
      iso2: c.cca2,
      name: nameOf(c),
      aliases: { fr: [...al.fr, ...replaced(c).fr], en: [...al.en, ...alt, ...replaced(c).en] },
      capital: {
        en: CAPITAL_OVERRIDES[c.cca3]?.en ?? c.capital[0] ?? "—",
        fr: CAPITAL_OVERRIDES[c.cca3]?.fr ?? CAPITAL_FR[c.cca3] ?? c.capital[0] ?? "—",
      },
      continent: CONTINENT_OVERRIDES[c.cca3] ?? mapContinent(c.region, c.subregion),
      region: c.subregion || c.region,
      population: Math.round(g.pop) || 0,
      area: Math.round(c.area * 100) / 100,
      isCoastal: !c.landlocked,
      isIsland: ISLAND_OVERRIDES.has(c.cca3) || c.borders.length === 0,
      center,
      bbox: bbox.map(round) as [number, number, number, number],
    };
  })
  .sort((a, b) => a.id.localeCompare(b.id));

// ---- Alias hygiene: dedupe, drop redundant ones, drop ones that collide with another country
{
  const norm = normalizeText;
  const primary = new Map<string, string>();
  for (const c of countries) for (const n of [c.name.fr, c.name.en]) primary.set(norm(n), c.id);
  const owners = new Map<string, Set<string>>();
  for (const c of countries) for (const a of [...c.aliases.fr, ...c.aliases.en]) (owners.get(norm(a)) ?? owners.set(norm(a), new Set()).get(norm(a))!).add(c.id);
  let dropped = 0;
  for (const c of countries) {
    const own = new Set([norm(c.name.fr), norm(c.name.en)]);
    // curated aliases (ALIASES) are trusted: only the auto-imported alternate spellings get the length / ambiguity filters
    const curated = new Set([...(ALIASES[c.id]?.fr ?? []), ...(ALIASES[c.id]?.en ?? [])].map(norm));
    const clean = (list: string[]) => {
      const seen = new Set<string>();
      return list.filter((a) => {
        const k = norm(a);
        const keep = curated.has(k)
          ? !own.has(k) && !seen.has(k)
          : k.length >= 3 && !own.has(k) && !seen.has(k) && (primary.get(k) ?? c.id) === c.id && owners.get(k)!.size === 1;
        seen.add(k);
        if (!keep) dropped++;
        return keep;
      });
    };
    c.aliases = { fr: clean(c.aliases.fr), en: clean(c.aliases.en) };
    // an alias listed in French is not repeated in English
    const frKeys = new Set(c.aliases.fr.map(norm));
    c.aliases.en = c.aliases.en.filter((x) => !frKeys.has(norm(x)));
  }
  console.log("aliases dropped (duplicates / redundant / ambiguous):", dropped);
}

// ---- Connections
const norm = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const key = (a: string, b: string) => norm(a, b).join("-");
const land = new Map<string, [string, string]>();
for (const c of playable) for (const b of c.borders) if (playableIds.has(b)) land.set(key(c.cca3, b), norm(c.cca3, b));
for (const [a, b, why] of LAND_REMOVALS) {
  if (!land.delete(key(a, b))) console.log(`removal ${a}-${b} already absent from source (kept as guard): ${why}`);
}
for (const [a, b] of LAND_ADDITIONS) {
  if (!playableIds.has(a) || !playableIds.has(b)) throw new Error(`bad land addition ${a}-${b}`);
  land.set(key(a, b), norm(a, b));
}
for (const c of playable)
  for (const b of c.borders)
    if (playableIds.has(b) && !playable.find((x) => x.cca3 === b)!.borders.includes(c.cca3))
      console.warn(`asymmetric source border ${c.cca3}->${b} (normalised to undirected)`);

const sea = new Map<string, [string, string]>();
for (const [a, b] of SEA_CONNECTIONS) {
  if (!playableIds.has(a) || !playableIds.has(b)) throw new Error(`bad sea link ${a}-${b}`);
  if (a === b) throw new Error(`self sea link ${a}`);
  if (land.has(key(a, b))) continue; // land supersedes sea
  sea.set(key(a, b), norm(a, b));
}
// Strait and dispute links are independent options (never merged into sea or land); each must be a real, new link.
const optional = (name: string, list: readonly (readonly [string, string, string])[]) => {
  const out = new Map<string, [string, string]>();
  for (const [a, b] of list) {
    if (!playableIds.has(a) || !playableIds.has(b)) throw new Error(`bad ${name} link ${a}-${b}`);
    if (a === b) throw new Error(`self ${name} link ${a}`);
    if (land.has(key(a, b))) throw new Error(`${name} link ${a}-${b} is already an ordinary land link: remove it from the list`);
    out.set(key(a, b), norm(a, b));
  }
  return out;
};
const strait = optional("strait", STRAIT_CONNECTIONS);
const dispute = optional("dispute", DISPUTED_CONNECTIONS);
const sortPairs = (m: Map<string, [string, string]>) =>
  [...m.values()].sort((x, y) => (x.join() < y.join() ? -1 : 1));

// ---- Output
const features = [
  ...countries.map((c) => ({
    type: "Feature",
    properties: { id: c.id, playable: true, name: c.name.en },
    geometry: { type: "MultiPolygon", coordinates: groups.get(c.id)!.polys },
  })),
  ...neutralFeatures,
];
fs.mkdirSync(path.join(root, "public/data"), { recursive: true });
fs.writeFileSync(path.join(root, "public/data/world.geojson"), JSON.stringify({ type: "FeatureCollection", features }));
fs.writeFileSync(path.join(root, "src/data/countries.json"), JSON.stringify(countries, null, 1));
fs.writeFileSync(
  path.join(root, "src/data/connections/connections.json"),
  JSON.stringify({ land: sortPairs(land), sea: sortPairs(sea), strait: sortPairs(strait), dispute: sortPairs(dispute) }),
);
console.log(`countries=${countries.length} land=${land.size} sea=${sea.size} strait=${strait.size} dispute=${dispute.size} features=${features.length}`);
