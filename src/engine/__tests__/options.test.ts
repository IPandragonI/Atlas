import { describe, expect, it } from "vitest";
import connections from "@/data/connections/connections.json";
import { DISPUTED_BASELINE_LAND, DISPUTED_CONNECTIONS, SEA_CONNECTIONS, STRAIT_CONNECTIONS } from "@/data/connections/overrides";
import { graph } from "@/lib/atlas";
import { configFromChallenge, configToParams, defaultConfig, genRequestFor, parseConfig } from "@/lib/config";
import { generate, generateForConfig, validateChallenge } from "@/lib/generate";
import { attemptsFor } from "../difficulty";
import { createGame, submitGuess } from "../game";
import { createHint, hintCandidates } from "../hints";
import { bfsDistances, solve } from "../pathfinding";
import { isValidRoute, reachesDestination, resolveMove } from "../rules";
import type { Challenge, ChallengeRules } from "../types";

const base: ChallengeRules = { maritime: false, forbidden: [], mandatory: [] };
const key = (a: string, b: string) => [a, b].sort().join("-");
const json = connections as unknown as { land: [string, string][]; sea: [string, string][]; strait: [string, string][]; dispute: [string, string][] };

function mk(start: string, destination: string, rules: Partial<ChallengeRules> = {}): Challenge {
  const r = { ...base, ...rules };
  const sol = solve(graph, { start, destination, rules: r });
  return {
    id: `opt-${start}-${destination}`, mode: "classic", difficulty: "normal", start, destination, rules: r, minIntermediate: sol.minIntermediate,
    attempts: attemptsFor(Math.max(0, sol.minIntermediate), "normal"), rulesVersion: "2", datasetVersion: "t",
  };
}
const dist = (rules: Partial<ChallengeRules>, a: string, b: string) => bfsDistances(graph, b, graph.viewFor({ ...base, ...rules }, [a, b])).get(a);

describe("the explicit lists", () => {
  it("are stored in connections.json exactly as written in overrides.ts (no drift)", () => {
    const norm = (ps: readonly (readonly string[])[]) => ps.map((p) => key(p[0], p[1])).sort();
    expect(norm(json.strait)).toEqual(norm(STRAIT_CONNECTIONS));
    expect(norm(json.dispute)).toEqual(norm(DISPUTED_CONNECTIONS));
  });
  it("only use real countries, have no duplicate, never repeat an ordinary land link, and give a reason", () => {
    const land = new Set(json.land.map(([a, b]) => key(a, b)));
    for (const [name, list] of [["strait", STRAIT_CONNECTIONS], ["dispute", DISPUTED_CONNECTIONS]] as const) {
      const seen = new Set<string>();
      for (const [a, b, why] of list) {
        expect(graph.has(a) && graph.has(b), `${name} ${a}-${b}`).toBe(true);
        expect(land.has(key(a, b)), `${name} ${a}-${b} is already a land link`).toBe(false);
        expect(seen.has(key(a, b)), `${name} ${a}-${b} listed twice`).toBe(false);
        seen.add(key(a, b));
        expect(why.length, `${name} ${a}-${b} needs a reason`).toBeGreaterThan(15);
      }
    }
  });
  it("a strait is also a curated sea link (so the maritime option still covers it), never the other way round", () => {
    const sea = new Set(SEA_CONNECTIONS.map(([a, b]) => key(a, b)));
    for (const [a, b] of STRAIT_CONNECTIONS) expect(sea.has(key(a, b)), `${a}-${b}`).toBe(true);
    expect(SEA_CONNECTIONS.length).toBeGreaterThan(STRAIT_CONNECTIONS.length * 3);
  });
  it("the documented baseline links on disputed land are real land links (they stay valid in every game)", () => {
    for (const [a, b] of DISPUTED_BASELINE_LAND) expect(graph.connection(a, b), `${a}-${b}`).toBe("land");
  });
});

describe("the graph and the options", () => {
  it("a pair can have several types; land still supersedes sea; the main type keeps its historical priority", () => {
    expect(graph.connectionTypes("GBR", "FRA")).toEqual(["sea", "strait"]);
    expect(graph.connection("GBR", "FRA")).toBe("sea");
    expect(graph.connectionTypes("MAR", "MRT")).toEqual(["dispute"]);
    expect(graph.connectionTypes("FRA", "DEU")).toEqual(["land"]);
  });
  it("by default nothing changes: no strait and no dispute is traversable", () => {
    const v = graph.viewFor(base);
    expect(graph.neighbors("GBR", v)).not.toContain("FRA");
    expect(graph.neighbors("ESP", v)).not.toContain("GBR");
    expect(graph.neighbors("MAR", v)).not.toContain("MRT");
  });
  it("straits enable exactly the strait list, NOT the other sea links", () => {
    const v = graph.viewFor({ ...base, straits: true });
    expect(graph.neighbors("GBR", v)).toContain("FRA"); // Dover
    expect(graph.neighbors("GBR", v)).not.toContain("BEL"); // North Sea ferry: maritime only
    expect(graph.neighbors("GBR", v)).not.toContain("ISL");
    const straitPairs = new Set(STRAIT_CONNECTIONS.map(([a, b]) => key(a, b)));
    const landView = graph.viewFor(base);
    for (const id of graph.ids()) {
      const extra = graph.neighbors(id, v).filter((n) => !graph.neighbors(id, landView).includes(n));
      for (const n of extra) expect(straitPairs.has(key(id, n)), `${id}-${n}`).toBe(true);
    }
  });
  it("disputes enable exactly the disputed list; straits and maritime are independent of it", () => {
    const v = graph.viewFor({ ...base, disputes: true });
    expect(graph.neighbors("MAR", v)).toContain("MRT");
    expect(graph.neighbors("ESP", v)).toContain("GBR");
    expect(graph.neighbors("GBR", v)).not.toContain("FRA"); // a strait, not a dispute
    const disputed = new Set(DISPUTED_CONNECTIONS.map(([a, b]) => key(a, b)));
    const landView = graph.viewFor(base);
    for (const id of graph.ids()) for (const n of graph.neighbors(id, v)) if (!graph.neighbors(id, landView).includes(n)) expect(disputed.has(key(id, n)), `${id}-${n}`).toBe(true);
  });
  it("maritime still enables sea links (including the strait pairs), with or without the strait option", () => {
    for (const rules of [{ maritime: true }, { maritime: true, straits: true }] as const) {
      expect(graph.neighbors("GBR", graph.viewFor({ ...base, ...rules }))).toEqual(expect.arrayContaining(["FRA", "BEL", "NLD"]));
    }
  });
  it("shortest paths follow the options", () => {
    expect(dist({}, "ESP", "GBR")).toBeUndefined(); // the British Isles are cut off by land
    expect(dist({ disputes: true }, "ESP", "GBR")).toBe(1); // Gibraltar
    expect(dist({}, "FRA", "GBR")).toBeUndefined();
    expect(dist({ straits: true }, "FRA", "GBR")).toBe(1); // Dover
    expect(dist({ straits: true }, "FRA", "IRL")).toBe(2); // Dover, then the Irish land border
    expect(dist({ disputes: true }, "FRA", "GBR")).toBe(2); // France > Spain > Britain (Gibraltar)
    expect(dist({ straits: true, disputes: true }, "FRA", "GBR")).toBe(1);
    expect(dist({ disputes: true }, "MAR", "SEN")).toBeLessThanOrEqual(dist({}, "MAR", "SEN") ?? Infinity); // an option never lengthens a path
  });
});

describe("route validation, victory and branching", () => {
  it("a route using a strait or a disputed link is valid only when its own option is on", () => {
    const ch = (r: Partial<ChallengeRules>) => ({ start: "FRA", destination: "IRL", rules: { ...base, ...r } });
    const route = ["FRA", "GBR", "IRL"];
    expect(isValidRoute(graph, ch({}), route)).toBe(false);
    expect(isValidRoute(graph, ch({ straits: true }), route)).toBe(true);
    expect(isValidRoute(graph, ch({ disputes: true }), route)).toBe(false); // the wrong option
    expect(isValidRoute(graph, ch({ maritime: true }), route)).toBe(true); // the sea link covers Dover too
    const spain = (r: Partial<ChallengeRules>) => ({ start: "PRT", destination: "IRL", rules: { ...base, ...r } });
    expect(isValidRoute(graph, spain({ disputes: true }), ["PRT", "ESP", "GBR", "IRL"])).toBe(true);
    expect(isValidRoute(graph, spain({}), ["PRT", "ESP", "GBR", "IRL"])).toBe(false);
  });
  it("a move across a strait is accepted only with the option; otherwise it is an ordinary wrong answer", () => {
    const on = mk("FRA", "IRL", { straits: true });
    expect(mk("FRA", "IRL").minIntermediate).toBe(-1); // unreachable by land
    expect(on.minIntermediate).toBe(1);
    const won = submitGuess(graph, on, createGame(on, 0), "GBR", 1);
    expect(won.outcome).toBe("won"); // Britain touches Ireland by land: the strait made the route possible
    expect(won.state.route).toEqual(["FRA", "GBR"]);
    const off = { ...on, rules: base };
    expect(submitGuess(graph, off, createGame(off, 0), "GBR", 1).outcome).toBe("rejected");
  });
  it("victory: the destination is reached through a disputed link only when enabled", () => {
    const on = mk("PRT", "GBR", { disputes: true });
    expect(reachesDestination(graph, on, ["PRT", "ESP"])).toBe(true); // Spain touches Britain at Gibraltar
    expect(reachesDestination(graph, { ...on, rules: base }, ["PRT", "ESP"])).toBe(false);
  });
  it("route branching uses the option-aware distances and links", () => {
    const ch = mk("PRT", "IRL", { straits: true });
    // Britain touches France through a strait and is nearer Ireland: a change of direction from France (index 2)
    expect(resolveMove(graph, ch, ["PRT", "ESP", "FRA", "BEL"], "GBR")).toEqual({ valid: true, from: 2 });
    expect(resolveMove(graph, { ...ch, rules: base }, ["PRT", "ESP", "FRA", "BEL"], "GBR").valid).toBe(false);
  });
});

describe("hints use the same graph as the game", () => {
  it("never point across a strait or a disputed link that is switched off, and use it when it is on", () => {
    expect(mk("PRT", "GBR").minIntermediate).toBe(-1);
    const on = mk("PRT", "GBR", { disputes: true });
    expect(hintCandidates(graph, on, ["PRT"])).toEqual(["ESP"]);
    expect(createHint(graph, on, ["PRT"], "reveal", [])?.countryId).toBe("ESP");
    const ire = mk("FRA", "IRL", { straits: true });
    expect(hintCandidates(graph, ire, ["FRA"])).toEqual(["GBR"]);
    expect(hintCandidates(graph, { ...ire, rules: base }, ["FRA"])).toEqual([]);
  });
});

describe("generation", () => {
  it("games without the options are generated exactly as before (no option field in the rules)", () => {
    const g = generate({ mode: "classic", difficulty: "normal", seed: "options-default" })!;
    expect(g.challenge.rules.straits).toBeUndefined();
    expect(g.challenge.rules.disputes).toBeUndefined();
    expect(Object.keys(g.challenge.rules).sort()).toEqual(["forbidden", "mandatory", "maritime"]);
  });
  it("the options are written into the challenge rules and give solvable challenges", () => {
    for (let i = 0; i < 8; i++) {
      const cfg = { ...defaultConfig("classic"), difficulty: "hard" as const, straits: true, disputes: i % 2 === 0 };
      const g = generateForConfig(cfg, `opt${i}`, [])!;
      expect(g).toBeTruthy();
      expect(g.challenge.rules.straits).toBe(true);
      expect(g.challenge.rules.disputes === true).toBe(i % 2 === 0);
      expect(validateChallenge(g.challenge)).toBe(true);
      expect(isValidRoute(graph, g.challenge, g.route)).toBe(true);
    }
  });
  it("works in every mode, with a region, and with forbidden countries", () => {
    for (const mode of ["classic", "constraints", "regional"] as const) {
      const cfg = { ...defaultConfig(mode), difficulty: "normal" as const, straits: true, disputes: true };
      const g = generateForConfig(cfg, `mode-${mode}`, [])!;
      expect(g, mode).toBeTruthy();
      expect(g.challenge.rules.straits).toBe(true);
      expect(g.challenge.rules.disputes).toBe(true);
      expect(validateChallenge(g.challenge)).toBe(true);
    }
    const forb = generateForConfig({ ...defaultConfig("classic"), straits: true, forbidden: ["FRA"] }, "forb", [])!;
    expect(forb.challenge.rules.forbidden).toContain("FRA");
    expect(validateChallenge(forb.challenge)).toBe(true);
  });
  it("custom games honour the options too", () => {
    const cfg = { ...defaultConfig("classic"), difficulty: "custom" as const, minIntermediate: 3, attempts: 8, straits: true };
    const g = generateForConfig(cfg, "custom-opt", [])!;
    expect(g.challenge.rules.straits).toBe(true);
    expect(g.challenge.minIntermediate).toBeGreaterThanOrEqual(3);
  });
});

describe("configuration, URLs and daily challenges", () => {
  it("both options default to off, and are written to the game URL only when on", () => {
    const d = defaultConfig("classic");
    expect([d.straits, d.disputes]).toEqual([false, false]);
    const url = configToParams(d, "s").toString();
    expect(url).not.toContain("straits");
    expect(url).not.toContain("disputes");
    const on = configToParams({ ...d, straits: true, disputes: true }, "s");
    expect(on.get("straits")).toBe("1");
    expect(on.get("disputes")).toBe("1");
  });
  it("round-trips through the URL", () => {
    const cfg = { ...defaultConfig("regional"), straits: true, disputes: false };
    const parsed = parseConfig(configToParams(cfg, "abc")).config;
    expect(parsed.straits).toBe(true);
    expect(parsed.disputes).toBe(false);
    expect(genRequestFor(parsed, "abc").straits).toBe(true);
    expect(genRequestFor(parsed, "abc").disputes).toBeUndefined();
  });
  it("the same URL without the options gives the same game as before they existed", () => {
    const a = generateForConfig(parseConfig(new URLSearchParams("mode=classic&difficulty=normal&scope=world&seed=legacy")).config, "legacy", [])!;
    const b = generateForConfig({ ...defaultConfig("classic"), difficulty: "normal" }, "legacy", [])!;
    expect(a.challenge).toEqual(b.challenge);
  });
  it("a challenge defines its own options: a replay copies them from the challenge, never from preferences", () => {
    const g = generateForConfig({ ...defaultConfig("classic"), straits: true }, "defines", [])!;
    expect(configFromChallenge(g.challenge).straits).toBe(true);
    expect(configFromChallenge(g.challenge).disputes).toBe(false);
    const daily = generate({ mode: "classic", difficulty: "normal", seed: "daily-x", date: "2099-01-01" })!;
    expect(configFromChallenge(daily.challenge).straits).toBe(false);
  });
});
