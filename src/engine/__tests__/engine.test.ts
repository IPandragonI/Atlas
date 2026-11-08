import { describe, expect, it } from "vitest";
import { graph } from "@/lib/atlas";
import { attemptsFor, DIFFICULTY_MARGIN } from "../difficulty";
import { createGame, submitGuess, useHint } from "../game";
import { createHint, hintCandidates, HINT_PENALTY, hintStatus } from "../hints";
import { optimalContinuations, solve } from "../pathfinding";
import { isValidRoute, nextMoves, reachesDestination, validateMove } from "../rules";
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
  it("never accepts the destination as a typed move (it only decides victory)", () => {
    expect(validateMove(graph, ch, ["FRA", "DEU", "CZE"], "POL").valid).toBe(false);
    expect(nextMoves(graph, ch, ["FRA", "DEU", "CZE"])).not.toContain("POL");
  });
  it("does not reach the destination while a mandatory country is missing, then does", () => {
    const m = mk("FRA", "POL", { mandatory: ["CHE"] });
    expect(reachesDestination(graph, m, ["FRA", "DEU"])).toBe(false);
    expect(reachesDestination(graph, m, ["FRA", "CHE", "DEU"])).toBe(true);
  });
  it("blocks sea moves unless maritime", () => {
    const sea = mk("FRA", "IRL", { maritime: true });
    const landOnly = { ...sea, rules: baseRules };
    expect(validateMove(graph, landOnly, ["FRA"], "GBR").valid).toBe(false);
    expect(validateMove(graph, sea, ["FRA"], "GBR").valid).toBe(true);
  });
  it("enforces regional restriction in suggestions", () => {
    const r = mk("SVN", "BGR", { allowedRegion: "balkans" });
    const moves = nextMoves(graph, r, ["SVN"]);
    expect(moves).not.toContain("ITA");
    expect(moves).not.toContain("AUT");
    expect(moves).toContain("HRV");
  });
  it("valid moves never contain used, start or destination countries", () => {
    const moves = nextMoves(graph, ch, ["FRA", "CHE", "DEU"]);
    for (const c of ["FRA", "CHE", "DEU", "POL"]) expect(moves).not.toContain(c);
    expect(moves).toContain("CZE");
  });
  it("enforces maxIntermediate", () => {
    const c = mk("FRA", "POL", { maxIntermediate: 1 });
    expect(nextMoves(graph, c, ["FRA"])).toContain("CHE");
    expect(nextMoves(graph, c, ["FRA", "CHE"])).toEqual([]); // budget of 1 intermediate already used
  });
});

describe("game flow", () => {
  it("keeps playing on non-bordering countries, wins on a country bordering the destination", () => {
    const ch = mk("FRA", "POL");
    let st = createGame(ch, 0);
    let r = submitGuess(graph, ch, st, "CHE", 1);
    expect(r.outcome).toBe("accepted");
    st = r.state;
    r = submitGuess(graph, ch, st, "DEU", 2); // Germany borders Poland: the destination is never typed
    expect(r.outcome).toBe("won");
    expect(r.state.status).toBe("won");
    expect(r.state.attemptsLeft).toBe(ch.attempts);
    expect(r.state.route).toEqual(["FRA", "CHE", "DEU"]);
    expect(r.state.route).not.toContain("POL");
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
  const ch = mk("FRA", "AUT"); // optimal first steps: CHE, DEU or ITA
  const letters = { fr: ["S", "A", "I"], en: ["S", "G", "I"] }; // Suisse/Switzerland, Allemagne/Germany, Italie/Italy

  it("hint 1 reveals the first letter of a valid next country that is on an optimal route", () => {
    const h = createHint(graph, ch, ["FRA"], "letter")!;
    expect(h.kind).toBe("letter");
    if (h.kind !== "letter") return;
    expect(["CHE", "DEU", "ITA"]).toContain(h.countryId);
    expect(h.letter.en).toBe(graph.country(h.countryId).name.en[0]);
    expect(letters.fr).toContain(h.letter.fr);
    expect(letters.en).toContain(h.letter.en);
    expect(nextMoves(graph, ch, ["FRA"])).toContain(h.countryId);
  });
  it("hint 2 reveals the borders of the SAME country, never its name", () => {
    let st = createGame(ch, 0);
    st = useHint(graph, ch, st, "letter")!.state;
    const second = useHint(graph, ch, st, "borders")!;
    expect(second.hint.payload.kind).toBe("borders");
    expect(second.hint.payload.countryId).toBe(st.hints[0].payload.countryId);
    expect(Object.keys(second.hint.payload).sort()).toEqual(["countryId", "kind"]);
  });
  it("must be used in order: borders is locked until the letter hint was used", () => {
    const st = createGame(ch, 0);
    expect(hintStatus(st.hints, "letter")).toBe("available");
    expect(hintStatus(st.hints, "borders")).toBe("locked");
    expect(useHint(graph, ch, st, "borders")).toBeNull();
    const afterLetter = useHint(graph, ch, st, "letter")!.state;
    expect(hintStatus(afterLetter.hints, "letter")).toBe("used");
    expect(hintStatus(afterLetter.hints, "borders")).toBe("available");
  });
  it("each hint can only be used once per game", () => {
    let st = createGame(ch, 0);
    st = useHint(graph, ch, st, "letter")!.state;
    expect(useHint(graph, ch, st, "letter")).toBeNull();
    st = useHint(graph, ch, st, "borders")!.state;
    expect(useHint(graph, ch, st, "borders")).toBeNull();
    expect(st.hints).toHaveLength(2);
  });
  it("applies the penalties (-75 then -150) and never consumes attempts", () => {
    let st = createGame(ch, 0);
    st = useHint(graph, ch, st, "letter")!.state;
    st = useHint(graph, ch, st, "borders")!.state;
    expect(st.hints.map((h) => h.penalty)).toEqual([75, 150]);
    expect(st.attemptsLeft).toBe(ch.attempts);
    expect(HINT_PENALTY).toEqual({ letter: 75, borders: 150 });
  });
  it("is deterministic: the same state always gives the same hint", () => {
    const x = createHint(graph, ch, ["FRA"], "letter");
    const y = createHint(graph, ch, ["FRA"], "letter");
    expect(x).toEqual(y);
  });
  it("respects route constraints (mandatory country)", () => {
    const m = mk("FRA", "POL", { mandatory: ["CHE"] });
    const h = createHint(graph, m, ["FRA"], "letter")!;
    expect(h.kind === "letter" && h.countryId).toBe("CHE"); // the only way to satisfy the constraint optimally
    expect(hintCandidates(graph, m, ["FRA"])).toEqual(["CHE"]);
  });
  it("never points at a forbidden country or an invalid one", () => {
    const f = mk("FRA", "POL", { forbidden: ["DEU"] });
    for (const route of [["FRA"], ["FRA", "CHE"]]) {
      for (const id of hintCandidates(graph, f, route)) {
        expect(id).not.toBe("DEU");
        expect(nextMoves(graph, f, route)).toContain(id);
      }
    }
  });
  it("candidates always belong to an actual optimal solution (solver-based)", () => {
    for (const id of hintCandidates(graph, ch, ["FRA"])) {
      const sol = solve(graph, ch, ["FRA", id], { slack: 0 });
      expect(sol.feasible).toBe(true);
      expect(sol.minIntermediate).toBe(ch.minIntermediate);
    }
  });
  it("is handled gracefully when nothing can be determined: no hint, no penalty", () => {
    const tight = mk("FRA", "POL", { maxIntermediate: 1 });
    const stuck = { ...createGame(tight, 0), route: ["FRA", "CHE"] }; // budget used up, destination not reached
    expect(createHint(graph, tight, stuck.route, "letter")).toBeNull();
    expect(useHint(graph, tight, stuck, "letter")).toBeNull();
    expect(stuck.hints).toHaveLength(0);
  });
  it("is not available once the game is over", () => {
    const won = { ...createGame(ch, 0), status: "won" as const };
    expect(useHint(graph, ch, won, "letter")).toBeNull();
  });
});

describe("scoring", () => {
  it("perfect game = 1000", () => expect(computeScore({ victory: true, optimal: true, mistakes: 0, hints: [] }).total).toBe(1000));
  it("victory only = 500", () => expect(computeScore({ victory: true, optimal: false, mistakes: 1, hints: ["letter"] }).total).toBe(500 - 25 - 75));
  it("optimal bonus, no hint bonus lost when no hints", () =>
    expect(computeScore({ victory: true, optimal: true, mistakes: 2, hints: [] }).total).toBe(500 + 300 + 100 - 50));
  it("accumulates hint penalties", () =>
    expect(computeScore({ victory: true, optimal: true, mistakes: 0, hints: ["letter", "borders"] }).total).toBe(500 + 300 + 100 - 225));
  it("clamps at 0", () => expect(computeScore({ victory: true, optimal: false, mistakes: 30, hints: [] }).total).toBe(0));
  it("defeat earns nothing but keeps the penalty breakdown", () => {
    const s = computeScore({ victory: false, optimal: false, mistakes: 4, hints: ["borders"] });
    expect(s.total).toBe(0);
    expect(s.victory + s.optimal + s.noMistakes + s.noHints).toBe(0);
    expect(s.mistakePenalty).toBe(100);
    expect(s.hintPenalty).toBe(150);
  });
  it("all optimal routes get the optimal bonus", () => {
    const ch = mk("FRA", "AUT");
    for (const via of ["CHE", "DEU", "ITA"]) {
      let st = createGame(ch, 0);
      const r = submitGuess(graph, ch, st, via, 1);
      expect(r.outcome, via).toBe("won");
      st = r.state;
      const res = buildResult(st, ch.minIntermediate);
      expect(res.optimal, via).toBe(true);
      expect(res.score.total).toBe(1000);
    }
  });
  it("a longer valid route is not optimal", () => {
    const ch = mk("FRA", "POL");
    let st = createGame(ch, 0);
    for (const g of ["CHE", "DEU"]) st = submitGuess(graph, ch, st, g, 1).state;
    const res = buildResult(st, ch.minIntermediate);
    expect(res.status).toBe("won");
    expect(res.optimal).toBe(false);
    expect(res.score.total).toBe(500 + 100 + 100);
  });
});
