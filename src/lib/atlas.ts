import countriesJson from "@/data/countries.json";
import connectionsJson from "@/data/connections/connections.json";
import { REGION_DEFS } from "@/data/regions";
import { AtlasGraph } from "@/engine/graph/graph";
import { buildSearchIndex } from "@/engine/search";
import type { Country, CountryConnection } from "@/engine/types";

/** Typed dataset + the single shared graph instance (engine-level, no UI dependencies). */
export const COUNTRIES = countriesJson as unknown as Country[];

const raw = connectionsJson as unknown as { land: [string, string][]; sea: [string, string][] };
export const CONNECTIONS: CountryConnection[] = [
  ...raw.land.map(([from, to]) => ({ from, to, type: "land" as const })),
  ...raw.sea.map(([from, to]) => ({ from, to, type: "sea" as const })),
];

export const graph = new AtlasGraph(COUNTRIES, CONNECTIONS, REGION_DEFS);
export const searchIndex = buildSearchIndex(COUNTRIES);
export const countryById = (id: string): Country => graph.country(id);
