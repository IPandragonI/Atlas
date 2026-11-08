import { describe, expect, it } from "vitest";
import { COUNTRIES, CONNECTIONS, graph } from "@/lib/atlas";
import { bfsDistances } from "../pathfinding";

const land = { maritime: false, blocked: new Set<string>() };
const sea = { maritime: true, blocked: new Set<string>() };

describe("country list", () => {
  it("contains exactly 195 sovereign states", () => {
    expect(COUNTRIES).toHaveLength(195);
    expect(new Set(COUNTRIES.map((c) => c.id)).size).toBe(195);
  });
  it("includes Vatican City and Palestine, excludes Kosovo, Taiwan and dependencies", () => {
    for (const id of ["VAT", "PSE"]) expect(graph.has(id)).toBe(true);
    for (const id of ["XKX", "UNK", "KOS", "TWN", "GRL", "PRI", "GUF", "HKG"]) expect(graph.has(id)).toBe(false);
  });
  it("has complete metadata for every country", () => {
    for (const c of COUNTRIES) {
      expect(c.id).toMatch(/^[A-Z]{3}$/);
      expect(c.name.fr && c.name.en && c.capital.en && c.continent && c.region).toBeTruthy();
      expect(c.area).toBeGreaterThan(0);
      expect(c.center).toHaveLength(2);
    }
  });
});

describe("land adjacency", () => {
  it("France borders Spain and Germany", () => {
    expect(graph.connection("FRA", "ESP")).toBe("land");
    expect(graph.connection("DEU", "FRA")).toBe("land");
  });
  it("France and the United Kingdom are not land neighbours", () => {
    expect(graph.neighbors("FRA", land)).not.toContain("GBR");
    expect(graph.connection("FRA", "GBR")).toBe("sea");
  });
  it("France and Brazil are not neighbours despite French Guiana", () => {
    expect(graph.connection("FRA", "BRA")).toBeUndefined();
    expect(graph.connection("FRA", "SUR")).toBeUndefined();
    expect(graph.neighbors("FRA", sea)).not.toContain("BRA");
    expect(bfsDistances(graph, "FRA", land).get("BRA")).toBeUndefined();
  });
  it("France has no connection to the Netherlands (Saint-Martin excluded)", () => {
    expect(graph.connection("FRA", "NLD")).toBeUndefined();
  });
  it("Sri Lanka is not land-linked to India", () => {
    expect(graph.connection("LKA", "IND")).toBe("sea");
  });
  it("documented exceptions: fixed links and shared islands", () => {
    expect(graph.connection("DNK", "SWE")).toBe("land");
    expect(graph.connection("GBR", "IRL")).toBe("land");
    expect(graph.connection("DOM", "HTI")).toBe("land");
    expect(graph.connection("ESP", "MAR")).toBe("land"); // Ceuta / Melilla
    expect(graph.connection("PRT", "ESP")).toBe("land");
    expect(graph.connection("VAT", "ITA")).toBe("land");
    expect(graph.connection("PSE", "ISR")).toBe("land");
  });
  it("Luxembourg is surrounded by France, Belgium and Germany", () => {
    expect(graph.neighbors("LUX", land)).toEqual(["BEL", "DEU", "FRA"]);
  });
});

describe("maritime connections", () => {
  it("are unavailable when maritime rules are disabled", () => {
    expect(graph.neighbors("JPN", land)).toEqual([]);
    expect(bfsDistances(graph, "FRA", land).has("GBR")).toBe(false);
    expect(graph.neighbors("FRA", land)).not.toContain("GBR");
  });
  it("work when explicitly enabled", () => {
    expect(graph.neighbors("JPN", sea)).toContain("KOR");
    expect(graph.neighbors("MDG", sea)).toContain("MOZ");
    expect(graph.neighbors("FRA", sea)).toContain("GBR");
  });
  it("are not created between arbitrary coastal neighbours", () => {
    expect(graph.connection("FRA", "JPN")).toBeUndefined();
    expect(graph.connection("ESP", "BRA")).toBeUndefined();
  });
  it("connect every country when sea links are enabled", () => {
    const dist = bfsDistances(graph, "FRA", sea);
    const unreachable = COUNTRIES.filter((c) => !dist.has(c.id)).map((c) => c.id);
    expect(unreachable).toEqual([]);
  });
});

describe("graph integrity", () => {
  it("edges are bidirectional", () => {
    for (const c of graph.ids()) {
      for (const n of graph.neighbors(c, sea)) expect(graph.neighbors(n, sea)).toContain(c);
    }
  });
  it("has no duplicate land edges or self edges", () => {
    const seen = new Set<string>();
    for (const e of CONNECTIONS) {
      expect(e.from).not.toBe(e.to);
      const k = [e.from, e.to].sort().join("|");
      if (e.type === "land") expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });
  it("forbidden countries are removed from traversal", () => {
    const view = { maritime: false, blocked: new Set(["DEU"]) };
    expect(graph.neighbors("FRA", view)).not.toContain("DEU");
    expect(graph.neighbors("DEU", view)).toEqual([]);
  });
  it("regional restriction limits neighbours", () => {
    const view = graph.viewFor({ maritime: false, forbidden: [], mandatory: [], allowedRegion: "balkans" });
    expect(graph.neighbors("SRB", view).every((n) => graph.regionMembers("balkans").has(n))).toBe(true);
  });
  it("main land component covers Europe, Africa and Asia mainland", () => {
    const d = bfsDistances(graph, "FRA", land);
    for (const id of ["PRT", "ZAF", "VNM", "KOR", "PRK", "SGP"]) expect(d.has(id), id).toBe(true);
    expect(d.has("AUS")).toBe(false);
  });
});
