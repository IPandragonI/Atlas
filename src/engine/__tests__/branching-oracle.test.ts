import { describe, expect, it } from "vitest";
import { graph } from "@/lib/atlas";
import { attemptsFor } from "../difficulty";
import { createGame, submitGuess } from "../game";
import { solve } from "../pathfinding";
import { resolveMove } from "../rules";
import { createRng } from "../rng";
import type { Challenge, ChallengeRules } from "../types";

/**
 * An INDEPENDENT statement of the route-branching rules (written from the specification, sharing no code with
 * rules.ts / bfs.ts: its own adjacency, its own shortest paths). The engine must agree with it on every guess of
 * thousands of random in-game situations, including constraints.
 */
const oracleCache = new WeakMap<Challenge, { dist: Map<string, number>; playable: (id: string) => boolean; linked: (a: string, b: string) => boolean }>();
function oracleWorld(ch: Challenge) {
  const hit = oracleCache.get(ch);
  if (hit) return hit;
  const r = ch.rules;
  const ids = graph.ids();
  const region = r.allowedRegion ? graph.regionMembers(r.allowedRegion) : null;
  const avoid = r.avoidRegion ? graph.regionMembers(r.avoidRegion) : null;
  const playable = (id: string) =>
    id === ch.start || id === ch.destination || (!r.forbidden.includes(id) && !(avoid && avoid.has(id)) && (!region || region.has(id)));
  const linked = (a: string, b: string) => {
    const types = graph.connectionTypes(a, b);
    return types.includes("land") || (r.maritime && types.includes("sea")) || (r.straits === true && types.includes("strait")) || (r.disputes === true && types.includes("dispute"));
  };
  // shortest distance to the destination over playable countries (plain breadth-first search)
  const dist = new Map<string, number>([[ch.destination, 0]]);
  for (let frontier = [ch.destination]; frontier.length; ) {
    const next: string[] = [];
    for (const a of frontier) for (const b of ids) if (!dist.has(b) && playable(b) && linked(a, b)) { dist.set(b, dist.get(a)! + 1); next.push(b); }
    frontier = next;
  }
  const world = { dist, playable, linked };
  oracleCache.set(ch, world);
  return world;
}

function oracle(ch: Challenge, route: string[], guess: string): { valid: boolean; from: number } {
  const r = ch.rules;
  const ids = graph.ids();
  const { dist, playable, linked } = oracleWorld(ch);
  const no = { valid: false, from: -1 };
  if (!ids.includes(guess) || route.includes(guess) || guess === ch.destination || !playable(guess)) return no;
  const max = r.maxIntermediate;
  const fits = (intermediates: number) => max === undefined || intermediates <= max;
  const last = route.length - 1;
  // 1. a plain extension of the route
  if (linked(route[last], guess) && fits(route.length)) return { valid: true, from: last };
  // 2. a change of direction: linked to an earlier country, strictly closer to the destination than that country
  for (let i = last - 1; i >= 0; i--) {
    if (!linked(route[i], guess)) continue;
    const dg = dist.get(guess);
    const dh = dist.get(route[i]);
    if (dg === undefined || dh === undefined || dg >= dh) continue;
    if (!fits(i + 1)) continue;
    if (route.slice(i + 1).some((id) => r.mandatory.includes(id))) continue; // may not drop a mandatory country
    return { valid: true, from: i };
  }
  return no;
}

function challengeFor(start: string, destination: string, rules: ChallengeRules): Challenge {
  const sol = solve(graph, { start, destination, rules });
  return {
    id: `o-${start}-${destination}`, mode: "classic", difficulty: "normal", start, destination, rules, minIntermediate: sol.minIntermediate,
    attempts: attemptsFor(Math.max(0, sol.minIntermediate), "normal"), rulesVersion: "2", datasetVersion: "t",
  };
}

describe("route branching agrees with an independent statement of the rules", () => {
  const rng = createRng("branching-oracle");
  const ids = graph.ids();
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rng() * a.length)];

  function randomRules(): ChallengeRules {
    const rules: ChallengeRules = { maritime: rng() < 0.3, forbidden: [], mandatory: [] };
    if (rng() < 0.35) rules.straits = true;
    if (rng() < 0.35) rules.disputes = true;
    if (rng() < 0.4) rules.forbidden = Array.from({ length: 1 + Math.floor(rng() * 3) }, () => pick(ids));
    if (rng() < 0.3) rules.maxIntermediate = 2 + Math.floor(rng() * 4);
    if (rng() < 0.15) rules.allowedRegion = pick(["europe", "africa", "asia"]);
    if (rng() < 0.25) rules.mandatory = [pick(ids)];
    return rules;
  }

  it("accepts and rejects exactly the same guesses, with the same connection point (2,500+ situations)", () => {
    let checked = 0;
    let branches = 0;
    for (let g = 0; g < 70; g++) {
      const rules = randomRules();
      const pool = rules.allowedRegion ? [...graph.regionMembers(rules.allowedRegion)] : ids;
      const start = pick(pool);
      const destination = pick(pool);
      if (start === destination || rules.forbidden.includes(start) || rules.forbidden.includes(destination)) continue;
      const ch = challengeFor(start, destination, rules);
      // a random in-game route: a random walk of valid extensions (dead ends included)
      let route = [start];
      for (let step = 0; step < 6; step++) {
        const candidates = ids.filter((id) => resolveMove(graph, ch, route, id).valid && oracle(ch, route, id).from === route.length - 1);
        if (candidates.length === 0) break;
        route = [...route, pick(candidates)];
        for (const guess of ids) {
          const want = oracle(ch, route, guess);
          const got = resolveMove(graph, ch, route, guess);
          expect(got, `${ch.id} route ${route.join(">")} guess ${guess} rules ${JSON.stringify(rules)}`).toEqual(want);
          checked++;
          if (want.valid && want.from < route.length - 1) branches++;
        }
      }
    }
    expect(checked).toBeGreaterThan(2500);
    expect(branches).toBeGreaterThan(15); // the scenario under test really happens in the sample
  }, 120_000);

  it("when the plain extension is not possible (intermediate budget) a change of direction is still found", () => {
    const ch = challengeFor("FRA", "PRT", { maritime: false, forbidden: [], mandatory: [], maxIntermediate: 2 });
    const c2 = challengeFor("FRA", "AUT", { maritime: false, forbidden: [], mandatory: [], maxIntermediate: 2 });
    // Spain touches France (index 0) and is closer to Portugal; the route is full, so only a branch can work
    expect(resolveMove(graph, ch, ["FRA", "BEL", "NLD"], "ESP")).toEqual({ valid: true, from: 0 });
    // Switzerland touches both Italy (last) and France (first): the extension would be a 3rd intermediate, the branch is the 1st
    expect(resolveMove(graph, c2, ["FRA", "ESP", "ITA"], "CHE")).toEqual({ valid: true, from: 0 });
  });
});

describe("whole games through the engine (same code path as the UI store)", () => {
  it("France > Belgium > Netherlands > Germany, then Spain towards Morocco: the route is replaced, nothing is penalised", () => {
    const ch = challengeFor("FRA", "MAR", { maritime: false, forbidden: [], mandatory: [] });
    let st = createGame(ch, 0);
    for (const g of ["BEL", "NLD", "DEU"]) st = submitGuess(graph, ch, st, g, 1).state;
    expect(st.route).toEqual(["FRA", "BEL", "NLD", "DEU"]);
    const r = submitGuess(graph, ch, st, "ESP", 2);
    expect(r.outcome).toBe("won"); // Spain borders Morocco (Ceuta/Melilla)
    expect(r.state.route).toEqual(["FRA", "ESP"]);
    expect(r.removed).toEqual(["BEL", "NLD", "DEU"]);
    expect(r.state.visited).toEqual(["BEL", "NLD", "DEU", "ESP"]);
    expect(r.state.attemptsLeft).toBe(ch.attempts);
    expect(r.state.mistakes).toEqual([]);
  });
  it("a country linked to several earlier countries uses the latest connection point, which keeps the most progress", () => {
    const ch = challengeFor("ESP", "DEU", { maritime: false, forbidden: [], mandatory: [] });
    expect(resolveMove(graph, ch, ["ESP", "FRA", "ITA", "SVN"], "CHE")).toEqual({ valid: true, from: 2 });
    // adjacent to France but exactly as far from Germany as France is: not "strictly closer", so it is an ordinary mistake
    expect(resolveMove(graph, ch, ["ESP", "FRA", "BEL"], "CHE")).toEqual({ valid: false, from: -1 });
  });
});
