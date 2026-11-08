import { describe, expect, it } from "vitest";
import { graph } from "@/lib/atlas";
import { attemptsFor } from "../difficulty";
import { createGame, submitGuess, useHint as takeHint } from "../game";
import { createHint, hintCandidates, hintLiveness, hintStatus, HINT_ORDER, HINT_PENALTY } from "../hints";
import { solve } from "../pathfinding";
import { resolveMove } from "../rules";
import { buildResult, computeScore } from "../scoring";
import type { Challenge, ChallengeRules, GameState } from "../types";

const baseRules: ChallengeRules = { maritime: false, forbidden: [], mandatory: [] };
function mk(start: string, destination: string, rules: Partial<ChallengeRules> = {}): Challenge {
  const r = { ...baseRules, ...rules };
  const sol = solve(graph, { start, destination, rules: r });
  return {
    id: `h3-${start}-${destination}`, mode: "classic", difficulty: "normal", start, destination, rules: r, minIntermediate: sol.minIntermediate,
    attempts: attemptsFor(Math.max(0, sol.minIntermediate), "normal"), rulesVersion: "2", datasetVersion: "t",
  };
}
const allHints = (ch: Challenge, st: GameState): GameState => {
  for (const k of HINT_ORDER) st = takeHint(graph, ch, st, k)?.state ?? st;
  return st;
};

describe("hint 3 — reveal a valid next country", () => {
  const ch = mk("FRA", "AUT");

  it("is the third hint, costs 300, and is locked until hints 1 and 2 are used", () => {
    expect(HINT_ORDER).toEqual(["letter", "borders", "reveal"]);
    expect(HINT_PENALTY).toEqual({ letter: 75, borders: 150, reveal: 300 });
    let st = createGame(ch, 0);
    expect(hintStatus(st.hints, "reveal")).toBe("locked");
    expect(takeHint(graph, ch, st, "reveal")).toBeNull();
    st = takeHint(graph, ch, st, "letter")!.state;
    expect(hintStatus(st.hints, "reveal")).toBe("locked"); // still needs hint 2
    expect(takeHint(graph, ch, st, "reveal")).toBeNull();
    st = takeHint(graph, ch, st, "borders")!.state;
    expect(hintStatus(st.hints, "reveal")).toBe("available");
  });
  it("reveals a country that is a valid move AND belongs to a valid solution, never the destination", () => {
    let st = createGame(ch, 0);
    st = allHints(ch, st);
    const reveal = st.hints[2].payload;
    expect(reveal.kind).toBe("reveal");
    expect(reveal.countryId).not.toBe(ch.destination);
    expect(resolveMove(graph, ch, st.route, reveal.countryId).valid).toBe(true);
    const sol = solve(graph, ch, [...st.route, reveal.countryId], { slack: 0 });
    expect(sol.feasible).toBe(true);
    expect(sol.minIntermediate).toBe(ch.minIntermediate);
  });
  it("describes the SAME country as hints 1 and 2, and costs 75 + 150 + 300 in total", () => {
    const st = allHints(ch, createGame(ch, 0));
    expect(new Set(st.hints.map((h) => h.payload.countryId)).size).toBe(1);
    expect(st.hints.map((h) => h.penalty)).toEqual([75, 150, 300]);
    expect(buildResult({ ...st, status: "won", endedAt: 1 }, ch.minIntermediate).score.hintPenalty).toBe(525);
    expect(computeScore({ victory: true, optimal: true, mistakes: 0, hints: ["letter", "borders", "reveal"] }).total).toBe(500 + 300 + 100 - 525);
  });
  it("only gives the answer, it never plays it: the route, the history and the attempts are untouched", () => {
    const st = createGame(ch, 0);
    const after = allHints(ch, st);
    expect(after.route).toEqual(st.route);
    expect(after.visited).toEqual([]);
    expect(after.attemptsLeft).toBe(st.attemptsLeft);
    expect(after.mistakes).toEqual([]);
    expect(after.status).toBe("playing");
  });
  it("can be used once per game", () => {
    const st = allHints(ch, createGame(ch, 0));
    expect(takeHint(graph, ch, st, "reveal")).toBeNull();
    expect(st.hints).toHaveLength(3);
  });
  it("respects forbidden countries, mandatory countries and the intermediate budget", () => {
    const f = mk("FRA", "POL", { forbidden: ["DEU"] });
    expect(hintCandidates(graph, f, ["FRA"])).not.toContain("DEU");
    const m = mk("FRA", "POL", { mandatory: ["CHE"] });
    expect(hintCandidates(graph, m, ["FRA"])).toEqual(["CHE"]);
    const b = mk("FRA", "POL", { maxIntermediate: 2 });
    const route = ["FRA", "BEL"];
    for (const id of hintCandidates(graph, b, route)) {
      expect(resolveMove(graph, b, route, id).valid).toBe(true);
      expect(solve(graph, b, [...route, id], { slack: 0 }).feasible).toBe(true);
    }
  });
  it("is deterministic for a given state", () => {
    const a = allHints(ch, createGame(ch, 0)).hints[2];
    const b = allHints(ch, createGame(ch, 0)).hints[2];
    expect(a.payload).toEqual(b.payload);
  });
});

describe("hints when the start already touches the destination", () => {
  it("still point at a real intermediate country (never the destination itself)", () => {
    const adj = mk("FRA", "DEU");
    const cands = hintCandidates(graph, adj, ["FRA"]);
    expect(cands.length).toBeGreaterThan(0);
    expect(cands).not.toContain("DEU");
    for (const id of cands) expect(resolveMove(graph, adj, ["FRA"], id).valid).toBe(true);
    const st = allHints(adj, createGame(adj, 0));
    expect(st.hints).toHaveLength(3);
  });
});

describe("hints and route branching", () => {
  const ch = mk("FRA", "PRT");

  it("a hint about a country that stays a valid move is live", () => {
    let st = createGame(ch, 0);
    st = takeHint(graph, ch, st, "letter")!.state;
    expect(hintLiveness(graph, ch, st.route, st.visited, st.hints[0])).toBe("live");
  });
  it("after a change of direction, a hint that no longer matches the active route is OUTDATED, not misleading", () => {
    // the hinted country is Belgium (we construct the record directly); the player then leaves that branch for Spain
    const rec = { payload: { kind: "reveal" as const, countryId: "DEU" }, penalty: 300, atMove: 1, routeKey: "FRA>BEL" };
    let st = createGame(ch, 0);
    for (const g of ["BEL", "NLD"]) st = submitGuess(graph, ch, st, g, 1).state;
    expect(hintLiveness(graph, ch, st.route, st.visited, rec)).toBe("live"); // Germany still touches the Netherlands
    const back = submitGuess(graph, ch, st, "ESP", 2); // Spain touches France and is closer to Portugal: change of direction
    expect(back.state.route).toEqual(["FRA", "ESP"]);
    expect(hintLiveness(graph, ch, back.state.route, back.state.visited, rec)).toBe("outdated");
  });
  it("a hinted country the player has entered is reported as followed", () => {
    let st = createGame(ch, 0);
    st = takeHint(graph, ch, st, "letter")!.state;
    const id = st.hints[0].payload.countryId;
    st = submitGuess(graph, ch, st, id, 1).state;
    expect(["followed"]).toContain(hintLiveness(graph, ch, st.route, st.visited, st.hints[0]));
  });
  it("hints computed after a change of direction describe the NEW route (and stay valid moves)", () => {
    let st = createGame(ch, 0);
    for (const g of ["BEL", "NLD", "ESP"]) st = submitGuess(graph, ch, st, g, 1).state;
    // Spain touches Portugal: that was a win; use a longer destination to keep playing
    const far = mk("FRA", "GRC");
    let g2 = createGame(far, 0);
    for (const g of ["ESP", "PRT", "ITA"]) g2 = submitGuess(graph, far, g2, g, 1).state;
    expect(g2.route).toEqual(["FRA", "ITA"]);
    const cands = hintCandidates(graph, far, g2.route);
    expect(cands.length).toBeGreaterThan(0);
    for (const id of cands) {
      expect(resolveMove(graph, far, g2.route, id).valid).toBe(true);
      expect(g2.route).not.toContain(id);
    }
    const h = createHint(graph, far, g2.route, "reveal", [])!;
    expect(cands).toContain(h.countryId);
  });
  it("when the current branch is a dead end, hints propose a way out through a change of direction", () => {
    // FRA > ESP > PRT: Portugal only touches Spain, so continuing is impossible for Greece — the hint must be a branch move
    const far = mk("FRA", "GRC");
    const route = ["FRA", "ESP", "PRT"];
    const cands = hintCandidates(graph, far, route);
    expect(cands.length).toBeGreaterThan(0);
    for (const id of cands) {
      const m = resolveMove(graph, far, route, id);
      expect(m.valid).toBe(true);
      expect(m.from).toBeLessThan(route.length - 1); // a change of direction, not an extension
    }
  });
});
