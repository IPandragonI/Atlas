import type { RegionDef } from "@/engine/types";

/** Playable regions. Continents derive their members from Country.continent. */
export const REGION_DEFS: RegionDef[] = [
  { id: "europe", kind: "continent", seaMode: "optional" },
  { id: "africa", kind: "continent", seaMode: "optional" },
  { id: "asia", kind: "continent", seaMode: "optional" },
  { id: "north-america", kind: "continent", seaMode: "optional" },
  { id: "south-america", kind: "continent", seaMode: "never" },
  { id: "oceania", kind: "continent", seaMode: "always" },
  {
    id: "balkans",
    kind: "subregion",
    seaMode: "never",
    countries: ["ALB", "BIH", "BGR", "HRV", "GRC", "MKD", "MNE", "ROU", "SRB", "SVN"],
  },
  { id: "scandinavia", kind: "subregion", seaMode: "optional", countries: ["NOR", "SWE", "DNK", "FIN", "ISL"] },
  { id: "caucasus", kind: "subregion", seaMode: "never", countries: ["ARM", "AZE", "GEO", "RUS", "TUR", "IRN"] },
  { id: "central-asia", kind: "subregion", seaMode: "never", countries: ["KAZ", "KGZ", "TJK", "TKM", "UZB", "AFG"] },
  {
    id: "southeast-asia",
    kind: "subregion",
    seaMode: "optional",
    countries: ["BRN", "KHM", "IDN", "LAO", "MYS", "MMR", "PHL", "SGP", "THA", "TLS", "VNM"],
  },
  {
    id: "south-asia",
    kind: "subregion",
    seaMode: "optional",
    countries: ["AFG", "BGD", "BTN", "IND", "MDV", "NPL", "PAK", "LKA"],
  },
  {
    id: "central-america",
    kind: "subregion",
    seaMode: "never",
    countries: ["BLZ", "CRI", "SLV", "GTM", "HND", "NIC", "PAN", "MEX"],
  },
  {
    id: "caribbean",
    kind: "subregion",
    seaMode: "always",
    countries: ["ATG", "BHS", "BRB", "CUB", "DMA", "DOM", "GRD", "HTI", "JAM", "KNA", "LCA", "VCT", "TTO"],
  },
  {
    id: "middle-east",
    kind: "subregion",
    seaMode: "never",
    countries: ["BHR", "CYP", "EGY", "IRN", "IRQ", "ISR", "JOR", "KWT", "LBN", "OMN", "PSE", "QAT", "SAU", "SYR", "TUR", "ARE", "YEM"],
  },
];

export const CONTINENT_IDS = ["europe", "africa", "asia", "north-america", "south-america", "oceania"] as const;
export const SUBREGION_IDS = REGION_DEFS.filter((r) => r.kind === "subregion").map((r) => r.id);
