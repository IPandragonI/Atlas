import { describe, expect, it } from "vitest";
import { COUNTRIES, graph, searchIndex } from "@/lib/atlas";
import { PRESET_MAP } from "@/lib/config";
import { validateImport } from "@/lib/db";
import { computeVisibility } from "@/lib/visibility";
import { attemptsFor } from "../difficulty";
import { createGame, submitGuess } from "../game";
import { solve } from "../pathfinding";
import { reachesDestination } from "../rules";
import { buildResult } from "../scoring";
import { normalizeText, resolveCountry, searchCountries } from "../search";
import type { Challenge, ChallengeRules, Difficulty } from "../types";

const baseRules: ChallengeRules = { maritime: false, forbidden: [], mandatory: [] };
function mk(start: string, destination: string, rules: Partial<ChallengeRules> = {}, difficulty: Difficulty = "normal"): Challenge {
  const r = { ...baseRules, ...rules };
  const sol = solve(graph, { start, destination, rules: r });
  return {
    id: `t-${start}-${destination}`, mode: "classic", difficulty, start, destination, rules: r,
    minIntermediate: sol.minIntermediate, attempts: attemptsFor(Math.max(0, sol.minIntermediate), difficulty), rulesVersion: "2", datasetVersion: "t",
  };
}
const play = (ch: Challenge, guesses: string[]) => {
  let st = createGame(ch, 0);
  const outcomes: string[] = [];
  for (const g of guesses) {
    const r = submitGuess(graph, ch, st, g, 1);
    st = r.state;
    outcomes.push(r.outcome);
  }
  return { st, outcomes };
};

describe("victory: reaching a country connected to the destination", () => {
  it("France -> Germany: entering Belgium wins immediately", () => {
    const ch = mk("FRA", "DEU");
    const { st, outcomes } = play(ch, ["BEL"]);
    expect(outcomes).toEqual(["won"]);
    expect(st.status).toBe("won");
  });
  it("the destination is never added to the player's route", () => {
    const { st } = play(mk("FRA", "POL"), ["CHE", "DEU"]);
    expect(st.route).toEqual(["FRA", "CHE", "DEU"]);
    expect(buildResult(st, 1).intermediates).toBe(2);
  });
  it("typing the destination is rejected like any other wrong answer", () => {
    const ch = mk("FRA", "POL");
    const { st, outcomes } = play(ch, ["POL"]);
    expect(outcomes).toEqual(["rejected"]);
    expect(st.attemptsLeft).toBe(ch.attempts - 1);
    expect(st.route).toEqual(["FRA"]);
  });
  it("a country that does not border the destination does not win", () => {
    const { st, outcomes } = play(mk("FRA", "POL"), ["CHE"]);
    expect(outcomes).toEqual(["accepted"]);
    expect(st.status).toBe("playing");
  });
  it("does NOT win while a mandatory country is missing (and says nothing about it)", () => {
    const ch = mk("FRA", "POL", { mandatory: ["CHE"] });
    const first = play(ch, ["DEU"]);
    expect(first.outcomes).toEqual(["accepted"]);
    expect(first.st.status).toBe("playing");
    expect(first.st.attemptsLeft).toBe(ch.attempts); // no attempt consumed, no explanation
    expect(play(ch, ["CHE", "DEU"]).outcomes).toEqual(["accepted", "won"]);
  });
  it("does NOT win while a coastal minimum is unmet", () => {
    const ch = mk("FRA", "POL", { minCoastal: 3 });
    expect(reachesDestination(graph, ch, ["FRA", "DEU"])).toBe(false);
    const sol = solve(graph, ch);
    const route = sol.routes[0].slice(1, -1);
    expect(play(ch, route).st.status).toBe("won");
  });
  it("respects maxIntermediate when judging victory", () => {
    const ch = mk("FRA", "POL", { maxIntermediate: 1 });
    expect(play(ch, ["DEU"]).st.status).toBe("won");
  });
  it("requires the sea link to be enabled to win across the sea", () => {
    const sea = mk("FRA", "IRL", { maritime: true });
    expect(play(sea, ["GBR"]).st.status).toBe("won");
    const land = { ...sea, rules: baseRules };
    expect(reachesDestination(graph, land, ["FRA", "BEL"])).toBe(false);
  });
  it("applies regional and forbidden restrictions", () => {
    const ch = mk("SVN", "BGR", { allowedRegion: "balkans" });
    expect(play(ch, ["HRV", "SRB"]).st.status).toBe("won"); // Serbia borders Bulgaria
    const f = mk("FRA", "POL", { forbidden: ["DEU"] });
    expect(play(f, ["DEU"]).outcomes).toEqual(["rejected"]);
  });
  it("optimal route earns the optimal bonus (all optimal routes)", () => {
    const ch = mk("FRA", "AUT");
    for (const via of ["CHE", "DEU", "ITA"]) {
      const { st } = play(ch, [via]);
      expect(buildResult(st, ch.minIntermediate).score.total, via).toBe(1000);
    }
  });
});

describe("map visibility is a visual rule only", () => {
  const v = (d: Difficulty, finished: boolean, route: string[]) =>
    computeVisibility({ appearance: PRESET_MAP[d], finished, entered: route.slice(1), start: "FRA", destination: "POL" });

  it("normal and hard hide everything except arrival, departure and entered countries", () => {
    for (const d of ["normal", "hard"] as const) {
      expect(v(d, false, ["FRA"])).toEqual({ masked: true, shown: ["POL", "FRA"] });
      expect(v(d, false, ["FRA", "BEL", "DEU"])).toEqual({ masked: true, shown: ["POL", "FRA", "BEL", "DEU"] });
    }
  });
  it("always displays departure and arrival by default, from the very first move", () => {
    const shown = v("hard", false, ["FRA"]).shown;
    expect(shown).toContain("FRA");
    expect(shown).toContain("POL");
  });
  it("custom appearance: the starting country can be hidden, the full map can be shown", () => {
    const hiddenStart = computeVisibility({ appearance: { start: false, borders: true, names: true, full: false }, finished: false, entered: ["BEL"], start: "FRA", destination: "POL" });
    expect(hiddenStart.shown).toEqual(["POL", "BEL"]);
    const full = computeVisibility({ appearance: { start: true, borders: false, names: false, full: true }, finished: false, entered: [], start: "FRA", destination: "POL" });
    expect(full.masked).toBe(false);
  });
  it("wrong answers cannot reveal anything: they never enter the route", () => {
    const ch = mk("FRA", "POL");
    const { st } = play(ch, ["JPN", "BRA"]);
    expect(v("hard", false, st.route).shown).toEqual(["POL", "FRA"]);
  });
  it("easy keeps the full map, and any finished game reveals it (whatever the appearance)", () => {
    expect(v("easy", false, ["FRA"]).masked).toBe(false);
    expect(v("hard", true, ["FRA", "BEL"]).masked).toBe(false);
    expect(computeVisibility({ appearance: { start: false, borders: false, names: false, full: false }, finished: true, entered: [], start: "FRA", destination: "POL" }).masked).toBe(false);
  });
  it("does not affect validation or the graph", () => {
    const ch = mk("FRA", "POL", {}, "hard");
    const before = graph.edges().length;
    v("hard", false, ["FRA"]);
    expect(graph.edges().length).toBe(before);
    expect(play(ch, ["CHE", "DEU"]).st.status).toBe("won");
    expect(play({ ...ch, difficulty: "easy" }, ["CHE", "DEU"]).st.status).toBe("won");
  });
});

describe("autocomplete is a pure name search", () => {
  const names = (q: string, locale: "fr" | "en" = "fr") => searchCountries(searchIndex, q, null, locale, 500).map((c) => c.id);

  it("returns every matching country, whatever the current position", () => {
    const g = names("g");
    expect(g.length).toBeGreaterThan(20);
    const neighbours = new Set(graph.neighbors("FRA", { maritime: true, blocked: new Set() }));
    expect(g.some((id) => !neighbours.has(id) && id !== "FRA")).toBe(true); // not filtered by adjacency
    expect(g).toContain("DEU"); // Germany matches via its English name
    expect(g).toContain("GEO");
  });
  it("covers (nearly) all 195 countries across common letters", () => {
    const union = new Set(["a", "e", "i", "o", "u"].flatMap((v) => names(v)));
    expect(union.size).toBeGreaterThan(180);
  });
  it("is independent of any game state (text-only signature)", () => {
    expect(names("be")).toEqual(names("be"));
  });
  it("handles French and English names", () => {
    expect(names("allemagne")[0]).toBe("DEU");
    expect(names("germany", "en")[0]).toBe("DEU");
    expect(names("allemagne", "en")[0]).toBe("DEU"); // language-independent
    expect(names("japon")[0]).toBe("JPN");
    expect(names("japan")[0]).toBe("JPN");
  });
  it("ignores accents and capitalisation", () => {
    expect(normalizeText("CÔTE D’Ivoire")).toBe("cote divoire");
    expect(names("COTE D IVOIRE")[0]).toBe("CIV");
    expect(names("États-Unis")[0]).toBe("USA");
    expect(names("etats unis")[0]).toBe("USA");
    expect(names("ÉGYPTE")[0]).toBe("EGY");
  });
  it("supports aliases", () => {
    expect(names("rdc")[0]).toBe("COD");
    expect(names("uk", "en")[0]).toBe("GBR");
    expect(names("ivory coast", "en")[0]).toBe("CIV");
  });
  it("resolves any country, including ones that are not valid moves", () => {
    expect(resolveCountry(searchIndex, "Japon", null, "fr")?.id).toBe("JPN");
    expect(resolveCountry(searchIndex, "zzzz", null, "fr")).toBeNull();
    expect(COUNTRIES).toHaveLength(195);
  });
});

describe("stored records", () => {
  it("keep destination and hint kinds through export validation", () => {
    const res = validateImport({
      app: "atlas", schemaVersion: 1,
      data: { games: [{ challengeId: "c", mode: "classic", difficulty: "hard", status: "won", score: 700, finishedAt: 1, route: ["FRA", "DEU"], destination: "POL", hintKinds: ["discovery", "bogus"] }] },
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.games[0].destination).toBe("POL");
      expect(res.data.games[0].hintKinds).toEqual(["discovery"]);
    }
  });
});
