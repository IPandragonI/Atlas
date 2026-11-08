import { describe, expect, it } from "vitest";
import { graph } from "@/lib/atlas";
import { attemptsFor } from "../difficulty";
import { createGame, submitGuess } from "../game";
import { solve } from "../pathfinding";
import { reachesDestination, resolveMove, startTouchesDestination } from "../rules";
import { buildResult } from "../scoring";
import type { Challenge, ChallengeRules } from "../types";

const baseRules: ChallengeRules = { maritime: false, forbidden: [], mandatory: [] };
function mk(start: string, destination: string, rules: Partial<ChallengeRules> = {}): Challenge {
  const r = { ...baseRules, ...rules };
  const sol = solve(graph, { start, destination, rules: r });
  return {
    id: `b-${start}-${destination}`, mode: "classic", difficulty: "normal", start, destination, rules: r,
    minIntermediate: sol.minIntermediate, attempts: attemptsFor(Math.max(0, sol.minIntermediate), "normal"), rulesVersion: "2", datasetVersion: "t",
  };
}
const play = (ch: Challenge, guesses: string[]) => {
  let st = createGame(ch, 0);
  const log: { outcome: string; removed?: string[] }[] = [];
  for (const g of guesses) {
    const r = submitGuess(graph, ch, st, g, 1);
    st = r.state;
    log.push({ outcome: r.outcome, removed: r.removed });
  }
  return { st, log };
};

describe("changing direction during a game", () => {
  // France -> Portugal: Spain borders France and is closer to Portugal than France is
  const ch = mk("FRA", "PRT");

  it("accepts a country adjacent to an earlier country of the route when it is closer to the destination", () => {
    const { st, log } = play(ch, ["BEL", "NLD", "ESP"]);
    expect(log.map((l) => l.outcome)).toEqual(["accepted", "accepted", "won"]); // Spain borders Portugal: victory
    expect(log[2].removed).toEqual(["BEL", "NLD"]);
    expect(st.route).toEqual(["FRA", "ESP"]); // the abandoned branch left the ACTIVE route
  });
  it("keeps the discovery history separate from the active route", () => {
    const { st } = play(ch, ["BEL", "NLD", "ESP"]);
    expect(st.visited).toEqual(["BEL", "NLD", "ESP"]); // everything correctly entered stays discovered
    expect(st.route).not.toContain("BEL");
    expect(buildResult(st, ch.minIntermediate).intermediates).toBe(1); // scoring only sees the active branch
    expect(buildResult(st, ch.minIntermediate).optimal).toBe(true);
  });
  it("is never a penalty: no attempt is consumed and no mistake is recorded", () => {
    const { st } = play(ch, ["BEL", "NLD", "ESP"]);
    expect(st.attemptsLeft).toBe(ch.attempts);
    expect(st.mistakes).toEqual([]);
    expect(buildResult(st, ch.minIntermediate).score.total).toBe(1000);
  });
  it("replaces the route at the connection point and the game continues from the new end", () => {
    const far = mk("FRA", "GRC");
    // FRA -> ESP -> PRT (a dead end, away from Greece), then Italy borders FRA and is closer to Greece than FRA is
    const { st, log } = play(far, ["ESP", "PRT", "ITA"]);
    expect(log[2].outcome).not.toBe("rejected");
    expect(st.route).toEqual(["FRA", "ITA"]);
    expect(st.visited).toEqual(["ESP", "PRT", "ITA"]);
  });
  it("uses the latest valid connection point", () => {
    const c = mk("FRA", "POL");
    // Czechia touches the last country of the route (Austria): a plain extension, nothing is removed
    expect(resolveMove(graph, c, ["FRA", "CHE", "AUT"], "CZE")).toEqual({ valid: true, from: 2 });
    // Germany touches France only (not Spain/Portugal) and is closer to Poland than France: branch from the start
    expect(resolveMove(graph, c, ["FRA", "ESP", "PRT"], "DEU")).toEqual({ valid: true, from: 0 });
  });
  it("rejects a country adjacent to an earlier country but NOT closer to the destination", () => {
    const c = mk("FRA", "POL");
    expect(resolveMove(graph, c, ["FRA", "BEL", "NLD"], "ESP").valid).toBe(false); // Spain touches France but is farther from Poland
    const { st, log } = play(c, ["BEL", "NLD", "ESP"]);
    expect(log[2].outcome).toBe("rejected"); // costs an attempt like any wrong answer
    expect(st.attemptsLeft).toBe(c.attempts - 1);
    expect(st.route).toEqual(["FRA", "BEL", "NLD"]); // the route is unchanged
  });
  it("still rejects a country adjacent to nothing in the route", () => {
    expect(resolveMove(graph, ch, ["FRA", "BEL"], "JPN").valid).toBe(false);
    expect(resolveMove(graph, ch, ["FRA", "BEL"], "BRA").valid).toBe(false);
  });
  it("never accepts countries already in the route, the start, or the destination", () => {
    expect(resolveMove(graph, ch, ["FRA", "BEL", "NLD"], "BEL").valid).toBe(false);
    expect(resolveMove(graph, ch, ["FRA", "BEL", "NLD"], "FRA").valid).toBe(false);
    expect(resolveMove(graph, ch, ["FRA", "BEL"], "PRT").valid).toBe(false);
  });
  it("respects forbidden countries", () => {
    const f = mk("FRA", "PRT", { forbidden: ["ESP"] });
    const { st, log } = play(f, ["BEL", "NLD", "ESP"]);
    expect(log[2].outcome).toBe("rejected");
    expect(st.route).toEqual(["FRA", "BEL", "NLD"]);
  });
  it("respects the playing area", () => {
    const r = mk("FRA", "DEU", { allowedRegion: "europe" });
    expect(resolveMove(graph, r, ["FRA", "ESP", "PRT"], "MAR").valid).toBe(false); // outside Europe
  });
  it("cannot be used to bypass a mandatory country: a branch that would drop it is an ordinary wrong answer", () => {
    const m = mk("FRA", "PRT", { mandatory: ["CHE"] });
    // FRA -> CHE -> ITA, then Spain (borders FRA, closer to Portugal): it would drop Switzerland from the route
    const { st, log } = play(m, ["CHE", "ITA", "ESP"]);
    expect(log[2].outcome).toBe("rejected");
    expect(st.route).toEqual(["FRA", "CHE", "ITA"]); // the route is untouched ...
    expect(st.attemptsLeft).toBe(m.attempts - 1); // ... and it costs an attempt like any wrong answer
    expect(st.mistakes).toEqual(["ESP"]);
    // a branch that keeps the mandatory country on the route is fine: FRA > CHE > ITA > SVN, then Germany (touches CHE, nearer Poland)
    const kept = mk("FRA", "POL", { mandatory: ["CHE"] });
    expect(resolveMove(graph, kept, ["FRA", "CHE", "ITA", "SVN"], "DEU").valid).toBe(true); // touches CHE (index 1): CHE stays
    expect(resolveMove(graph, kept, ["FRA", "CHE", "ITA", "SVN"], "DEU").from).toBe(1);
  });
  it("respects maxIntermediate for the new route", () => {
    const c = mk("FRA", "PRT", { maxIntermediate: 1 });
    expect(resolveMove(graph, c, ["FRA", "BEL"], "ESP").valid).toBe(true); // branch from FRA: the new route has 1 intermediate
    expect(resolveMove(graph, c, ["FRA", "BEL"], "NLD").valid).toBe(false); // extension: would be a 2nd intermediate
  });
  it("sea links only count when maritime rules are active", () => {
    const sea = mk("ESP", "IRL", { maritime: true });
    expect(resolveMove(graph, sea, ["ESP", "PRT"], "FRA").valid).toBe(true);
    const land = { ...sea, rules: baseRules };
    expect(resolveMove(graph, land, ["ESP", "PRT"], "GBR").valid).toBe(false);
  });
});

describe("a start that already touches the destination", () => {
  it("is detected, for land and (only when enabled) sea links", () => {
    expect(startTouchesDestination(graph, mk("FRA", "DEU"))).toBe(true);
    expect(startTouchesDestination(graph, mk("FRA", "POL"))).toBe(false);
    expect(startTouchesDestination(graph, { start: "FRA", destination: "GBR", rules: baseRules })).toBe(false);
    expect(startTouchesDestination(graph, { start: "FRA", destination: "GBR", rules: { ...baseRules, maritime: true } })).toBe(true);
  });
  it("never wins by itself: at least one country must be entered, and the warning costs nothing", () => {
    const ch = mk("FRA", "DEU");
    const st = createGame(ch, 0);
    expect(reachesDestination(graph, ch, st.route)).toBe(false);
    expect(st.status).toBe("playing");
    expect(st.attemptsLeft).toBe(ch.attempts);
    expect(st.mistakes).toEqual([]);
    // the destination cannot be typed to shortcut the game
    expect(submitGuess(graph, ch, st, "DEU", 1).outcome).toBe("rejected");
    // entering another bordering country is a normal game and wins as usual
    expect(play(ch, ["BEL"]).st.status).toBe("won");
  });
  it("a route can never be 'optimal' with zero entered countries", () => {
    const ch = mk("FRA", "DEU");
    expect(ch.minIntermediate).toBe(0);
    const { st } = play(ch, ["BEL"]);
    const res = buildResult(st, ch.minIntermediate);
    expect(res.intermediates).toBe(1);
    expect(res.optimal).toBe(true); // one entered country is the minimum possible
    expect(res.score.total).toBe(1000);
  });
});

describe("submitting the same wrong country again", () => {
  const ch = mk("FRA", "POL");

  it("is not counted as a new mistake: no attempt, no penalty, nothing recorded", () => {
    let st = createGame(ch, 0);
    const first = submitGuess(graph, ch, st, "JPN", 1);
    expect(first.outcome).toBe("rejected");
    st = first.state;
    expect(st.attemptsLeft).toBe(ch.attempts - 1);
    const again = submitGuess(graph, ch, st, "JPN", 2);
    expect(again.outcome).toBe("repeated");
    expect(again.state).toBe(st); // the very same state: nothing changed
    expect(again.state.attemptsLeft).toBe(ch.attempts - 1);
    expect(again.state.mistakes).toEqual(["JPN"]);
    expect(buildResult({ ...again.state, status: "won", endedAt: 3 }, ch.minIntermediate).mistakes).toBe(1);
  });
  it("never ends the game, however many times it is repeated", () => {
    let st = createGame(ch, 0);
    st = submitGuess(graph, ch, st, "JPN", 1).state;
    for (let i = 0; i < 20; i++) expect(submitGuess(graph, ch, st, "JPN", 2).outcome).toBe("repeated");
    expect(st.status).toBe("playing");
  });
  it("a different wrong country is still a mistake", () => {
    let st = createGame(ch, 0);
    st = submitGuess(graph, ch, st, "JPN", 1).state;
    const other = submitGuess(graph, ch, st, "BRA", 2);
    expect(other.outcome).toBe("rejected");
    expect(other.state.attemptsLeft).toBe(ch.attempts - 2);
  });
  it("a country rejected earlier is accepted normally once it has become valid", () => {
    const c = mk("FRA", "BGR");
    let st = createGame(c, 0);
    st = submitGuess(graph, c, st, "AUT", 1).state; // Austria does not touch France: rejected
    expect(st.mistakes).toEqual(["AUT"]);
    expect(submitGuess(graph, c, st, "AUT", 2).outcome).toBe("repeated"); // still wrong: free
    st = submitGuess(graph, c, st, "DEU", 3).state;
    const later = submitGuess(graph, c, st, "AUT", 4); // adjacent to Germany now: a normal move
    expect(later.outcome).toBe("accepted");
    expect(later.state.route).toEqual(["FRA", "DEU", "AUT"]);
    expect(later.state.attemptsLeft).toBe(c.attempts - 1); // only the first wrong submission ever cost anything
  });
  it("does nothing once the game is over", () => {
    const st = { ...createGame(ch, 0), status: "lost" as const };
    expect(submitGuess(graph, ch, st, "JPN", 1).outcome).toBe("ignored");
  });
});
