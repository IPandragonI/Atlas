import { describe, expect, it } from "vitest";
import { graph } from "@/lib/atlas";
import { attemptsFor, DIFFICULTY_MARGIN } from "../difficulty";
import { createGame, submitGuess, useHint } from "../game";
import { createHint, hintCandidates } from "../hints";
import { optimalContinuations, solve } from "../pathfinding";
import { isValidRoute, nextMoves, validateMove } from "../rules";
import { buildResult, computeScore } from "../scoring";
import type { Challenge, ChallengeRules, Difficulty } from "../types";

const baseRules: ChallengeRules = { maritime: false, forbidden: [], mandatory: [] };

function mk(start: string, destination: string, rules: Partial<ChallengeRules> = {}, difficulty: Difficulty = "normal"): Challenge {
  const r = { ...baseRules, ...rules };
  const sol = solve(graph, { start, destination, rules: r });
  return {
    id: `test-${start}-${destination}`,
    mode: "classic",
    difficulty,
    start,
    destination,
    rules: r,
    minIntermediate: sol.minIntermediate,
    attempts: attemptsFor(sol.minIntermediate, difficulty),
    rulesVersion: "1",
    datasetVersion: "t",
  };
}

describe("pathfinding", () => {
  it("finds the shortest route (France -> Poland via Germany)", () => {
    const s = solve(graph, { start: "FRA", destination: "POL", rules: baseRules });
    expect(s.minIntermediate).toBe(1);
    expect(s.routes[0]).toEqual(["FRA", "DEU", "POL"]);
    expect(s.optimalCount).toBe(1);
  });
  it("lists multiple optimal routes", () => {
    const s = solve(graph, { start: "FRA", destination: "AUT", rules: baseRules });
    // FRA-CHE-AUT, FRA-DEU-AUT, FRA-ITA-AUT
    expect(s.optimalCount).toBe(3);
    expect(s.routes.slice(0, 3).map((r) => r[1]).sort()).toEqual(["CHE", "DEU", "ITA"]);
  });
  it("reports disconnected components as infeasible", () => {
    expect(solve(graph, { start: "FRA", destination: "BRA", rules: baseRules }).feasible).toBe(false);
    expect(solve(graph, { start: "FRA", destination: "JPN", rules: baseRules }).feasible).toBe(false);
  });
  it("routes over sea only when maritime is enabled", () => {
    const s = solve(graph, { start: "FRA", destination: "GBR", rules: { ...baseRules, maritime: true } });
    expect(s.minIntermediate).toBe(0);
    expect(s.routes[0]).toEqual(["FRA", "GBR"]);
  });
  it("handles forbidden nodes by detouring", () => {
    const direct = solve(graph, { start: "FRA", destination: "POL", rules: baseRules });
    const s = solve(graph, { start: "FRA", destination: "POL", rules: { ...baseRules, forbidden: ["DEU"] } });
    expect(s.minIntermediate).toBeGreaterThan(direct.minIntermediate);
    expect(s.routes.every((r) => !r.includes("DEU"))).toBe(true);
  });
  it("respects mandatory countries", () => {
    const s = solve(graph, { start: "FRA", destination: "POL", rules: { ...baseRules, mandatory: ["CHE"] } });
    expect(s.feasible).toBe(true);
    expect(s.routes.every((r) => r.includes("CHE"))).toBe(true);
  });
  it("respects region restriction", () => {
    const s = solve(graph, { start: "SVN", destination: "BGR", rules: { ...baseRules, allowedRegion: "balkans" } });
    expect(s.feasible).toBe(true);
    const members = graph.regionMembers("balkans");
    expect(s.routes.every((r) => r.every((c) => members.has(c)))).toBe(true);
  });
  it("enforces coastal minimum on intermediates", () => {
    const s = solve(graph, { start: "FRA", destination: "POL", rules: { ...baseRules, minCoastal: 3 } });
    expect(s.feasible).toBe(true);
    for (const r of s.routes) expect(r.slice(1, -1).filter((c) => graph.country(c).isCoastal).length).toBeGreaterThanOrEqual(3);
  });
  it("lists alternatives longer than the optimum", () => {
    const s = solve(graph, { start: "FRA", destination: "POL", rules: baseRules }, undefined, { slack: 2 });
    expect(s.routes.length).toBeGreaterThan(s.optimalCount);
    expect(s.routes.every((r) => isValidRoute(graph, { start: "FRA", destination: "POL", rules: baseRules }, r))).toBe(true);
  });
  it("optimal continuations are valid next moves", () => {
    const ch = mk("FRA", "AUT");
    const cont = optimalContinuations(graph, ch, ["FRA"]);
    expect(cont.sort()).toEqual(["CHE", "DEU", "ITA"]);
  });
});

describe("move validation", () => {
  const ch = mk("FRA", "POL");
  it("accepts an adjacent country", () => expect(validateMove(graph, ch, ["FRA"], "DEU").valid).toBe(true));
  it("rejects a non-adjacent country", () => expect(validateMove(graph, ch, ["FRA"], "POL").valid).toBe(false));
  it("rejects a previously traversed country", () => expect(validateMove(graph, ch, ["FRA", "DEU"], "FRA").valid).toBe(false));
  it("rejects forbidden countries and hides them from suggestions", () => {
    const f = mk("FRA", "POL", { forbidden: ["DEU"] });
    expect(validateMove(graph, f, ["FRA"], "DEU").valid).toBe(false);
    expect(nextMoves(graph, f, ["FRA"])).not.toContain("DEU");
  });
  it("accepts the destination when adjacent, even on a non-optimal route", () => {
    expect(validateMove(graph, ch, ["FRA", "DEU", "CZE"], "POL")).toEqual({ valid: true, isDestination: true });
  });
  it("rejects the destination if a mandatory country was missed", () => {
    const m = mk("FRA", "POL", { mandatory: ["CHE"] });
    expect(validateMove(graph, m, ["FRA", "DEU"], "POL").valid).toBe(false);
    expect(validateMove(graph, m, ["FRA", "CHE", "DEU"], "POL").valid).toBe(true);
  });
  it("blocks sea moves unless maritime", () => {
    const landOnly = { ...mk("FRA", "GBR", { maritime: true }), rules: baseRules };
    expect(validateMove(graph, landOnly, ["FRA"], "GBR").valid).toBe(false);
    expect(validateMove(graph, mk("FRA", "GBR", { maritime: true }), ["FRA"], "GBR").valid).toBe(true);
  });
  it("enforces regional restriction in suggestions", () => {
    const r = mk("SVN", "BGR", { allowedRegion: "balkans" });
    const moves = nextMoves(graph, r, ["SVN"]);
    expect(moves).not.toContain("ITA");
    expect(moves).not.toContain("AUT");
    expect(moves).toContain("HRV");
  });
  it("suggestions never contain used or start countries", () => {
    const moves = nextMoves(graph, ch, ["FRA", "DEU"]);
    expect(moves).not.toContain("FRA");
    expect(moves).not.toContain("DEU");
    expect(moves).toContain("POL");
  });
  it("enforces maxIntermediate", () => {
    const c = mk("FRA", "POL", { maxIntermediate: 1 });
    expect(nextMoves(graph, c, ["FRA", "DEU"])).toContain("POL");
    expect(nextMoves(graph, c, ["FRA", "DEU"])).not.toContain("CZE");
  });
});

describe("game flow", () => {
  it("wins and consumes no attempt on valid moves", () => {
    const ch = mk("FRA", "POL");
    let st = createGame(ch, 0);
    let r = submitGuess(graph, ch, st, "DEU", 1);
    expect(r.outcome).toBe("accepted");
    st = r.state;
    r = submitGuess(graph, ch, st, "POL", 2);
    expect(r.outcome).toBe("won");
    expect(r.state.attemptsLeft).toBe(ch.attempts);
    expect(r.state.route).toEqual(["FRA", "DEU", "POL"]);
  });
  it("every invalid guess costs exactly one attempt, and the last one loses", () => {
    const ch = { ...mk("FRA", "POL"), attempts: 2 };
    let st = createGame(ch, 0);
    let r = submitGuess(graph, ch, st, "JPN", 1);
    expect(r.outcome).toBe("rejected");
    expect(r.state.attemptsLeft).toBe(1);
    r = submitGuess(graph, ch, r.state, "FRA", 2); // already used
    expect(r.outcome).toBe("lost");
    expect(r.state.status).toBe("lost");
    st = r.state;
    expect(submitGuess(graph, ch, st, "DEU", 3).outcome).toBe("ignored");
  });
});

describe("difficulty", () => {
  it("applies +5 / +3 / +1 margins", () => {
    expect(DIFFICULTY_MARGIN).toEqual({ easy: 5, normal: 3, hard: 1 });
    expect(attemptsFor(4, "easy")).toBe(9);
    expect(attemptsFor(4, "normal")).toBe(7);
    expect(attemptsFor(4, "hard")).toBe(5);
    expect(attemptsFor(0, "hard")).toBe(1);
  });
  it("rejects infeasible challenges", () => expect(() => attemptsFor(-1, "easy")).toThrow());
});

describe("hints", () => {
  const ch = mk("FRA", "AUT");
  it("never consume attempts but add cumulative penalties", () => {
    let st = createGame(ch, 0);
    const a = useHint(graph, ch, st, "geographic")!;
    st = a.state;
    const b = useHint(graph, ch, st, "discovery")!;
    expect(b.state.attemptsLeft).toBe(ch.attempts);
    expect(b.state.hints.map((h) => h.penalty)).toEqual([50, 125]);
  });
  it("are derived from several valid continuations, not one secret answer", () => {
    expect(hintCandidates(graph, ch, ["FRA"]).sort()).toEqual(["CHE", "DEU", "ITA"]);
  });
  it("geographic hint matches one valid continuation", () => {
    const h = createHint(graph, ch, ["FRA"], "geographic");
    expect(h?.kind).toBe("geographic");
    const regions = ["CHE", "DEU", "ITA"].map((c) => graph.country(c).region);
    expect(regions).toContain((h as { region: string }).region);
  });
  it("connectivity hint reports a plausible border count", () => {
    const h = createHint(graph, ch, ["FRA"], "connectivity") as { borders: number };
    expect([5, 9, 6].includes(h.borders) || h.borders > 0).toBe(true);
  });
  it("discovery hint reveals the first letter of a valid continuation", () => {
    const h = createHint(graph, ch, ["FRA"], "discovery") as { letter: { en: string } };
    expect(["S", "G", "I"]).toContain(h.letter.en);
  });
});

describe("scoring", () => {
  it("perfect game = 1000", () => expect(computeScore({ victory: true, optimal: true, mistakes: 0, hints: [] }).total).toBe(1000));
  it("victory only = 500", () => expect(computeScore({ victory: true, optimal: false, mistakes: 1, hints: ["geographic"] }).total).toBe(500 - 25 - 50));
  it("optimal bonus, no hint bonus lost when no hints", () =>
    expect(computeScore({ victory: true, optimal: true, mistakes: 2, hints: [] }).total).toBe(500 + 300 + 100 - 50));
  it("accumulates hint penalties", () =>
    expect(computeScore({ victory: true, optimal: true, mistakes: 0, hints: ["geographic", "connectivity", "discovery"] }).total).toBe(500 + 300 + 100 - 250));
  it("clamps at 0", () => expect(computeScore({ victory: true, optimal: false, mistakes: 30, hints: [] }).total).toBe(0));
  it("defeat earns nothing but keeps the penalty breakdown", () => {
    const s = computeScore({ victory: false, optimal: false, mistakes: 4, hints: ["discovery"] });
    expect(s.total).toBe(0);
    expect(s.victory + s.optimal + s.noMistakes + s.noHints).toBe(0);
    expect(s.mistakePenalty).toBe(100);
    expect(s.hintPenalty).toBe(125);
  });
  it("all optimal routes get the optimal bonus", () => {
    const ch = mk("FRA", "AUT");
    for (const via of ["CHE", "DEU", "ITA"]) {
      let st = createGame(ch, 0);
      st = submitGuess(graph, ch, st, via, 1).state;
      st = submitGuess(graph, ch, st, "AUT", 2).state;
      const res = buildResult(st, ch.minIntermediate);
      expect(res.optimal, via).toBe(true);
      expect(res.score.total).toBe(1000);
    }
  });
  it("a longer valid route is not optimal", () => {
    const ch = mk("FRA", "POL");
    let st = createGame(ch, 0);
    for (const g of ["DEU", "CZE", "POL"]) st = submitGuess(graph, ch, st, g, 1).state;
    const res = buildResult(st, ch.minIntermediate);
    expect(res.status).toBe("won");
    expect(res.optimal).toBe(false);
    expect(res.score.total).toBe(500 + 100 + 100);
  });
});
