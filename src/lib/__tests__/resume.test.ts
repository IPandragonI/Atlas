import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { attemptsFor } from "@/engine/difficulty";
import { solve } from "@/engine/pathfinding";
import type { Challenge } from "@/engine/types";
import { graph } from "@/lib/atlas";
import { clearInProgress, getDB, loadInProgress, loadSnapshot, saveInProgress, type InProgressRecord } from "@/lib/db";
import { isResumable, useGame } from "@/stores/game";

const challenge = (): Challenge => {
  const rules = { maritime: false, forbidden: [], mandatory: [] };
  const sol = solve(graph, { start: "FRA", destination: "PRT", rules });
  return {
    id: "resume-fra-prt", mode: "classic", difficulty: "normal", start: "FRA", destination: "PRT", rules,
    minIntermediate: sol.minIntermediate, attempts: attemptsFor(sol.minIntermediate, "normal"), rulesVersion: "2", datasetVersion: "t",
  };
};
const settle = () => new Promise((r) => setTimeout(r, 80));
const KEY = "mode=classic&difficulty=normal&seed=resume-1";

beforeEach(async () => {
  useGame.getState().clear();
  await clearInProgress(getDB());
});

function freshState(ch: Challenge) {
  useGame.getState().start(ch, undefined, KEY);
  const s = useGame.getState().state!;
  useGame.getState().clear();
  return s;
}

describe("resuming a game in progress", () => {
  it("is saved after the start and after every move, with the discovery history and the clock", async () => {
    const g = useGame.getState();
    g.start(challenge(), undefined, KEY);
    await settle();
    expect((await loadInProgress(getDB()))?.state.route).toEqual(["FRA"]); // a reload before the first move keeps the same challenge
    g.guess("BEL");
    g.guess("JPN"); // a mistake is saved too
    await settle();
    const rec = (await loadInProgress(getDB()))!;
    expect(rec.key).toBe(KEY);
    expect(rec.state.route).toEqual(["FRA", "BEL"]);
    expect(rec.state.visited).toEqual(["BEL"]);
    expect(rec.state.mistakes).toEqual(["JPN"]);
    expect(rec.state.attemptsLeft).toBe(rec.challenge.attempts - 1);
    expect(rec.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("restores exactly the same game: route, discovery history, mistakes, hints, attempts", async () => {
    const g = useGame.getState();
    g.start(challenge(), undefined, KEY);
    g.guess("BEL");
    g.guess("NLD");
    g.guess("JPN");
    expect(g.hint("letter")).toBe(true);
    await settle();
    const before = useGame.getState().state!;
    useGame.getState().clear(); // the player leaves the screen / reloads the page
    expect(useGame.getState().state).toBeNull();

    const saved = await useGame.getState().findSaved(KEY);
    expect(saved).not.toBeNull();
    useGame.getState().resume(saved!);
    const after = useGame.getState().state!;
    expect(after.route).toEqual(before.route);
    expect(after.visited).toEqual(["BEL", "NLD"]);
    expect(after.mistakes).toEqual(before.mistakes);
    expect(after.attemptsLeft).toBe(before.attemptsLeft);
    expect(after.hints).toEqual(before.hints);
    expect(useGame.getState().challenge?.id).toBe("resume-fra-prt");
    expect(useGame.getState().result).toBeNull();
  });

  it("a resumed game can still change direction and keeps the abandoned branch in the history", async () => {
    const g = useGame.getState();
    g.start(challenge(), undefined, KEY);
    g.guess("BEL");
    g.guess("NLD");
    await settle();
    useGame.getState().clear();
    useGame.getState().resume((await useGame.getState().findSaved(KEY))!);
    expect(useGame.getState().guess("ESP")).toBe("won"); // Spain connects to France (an earlier country) and borders Portugal
    await settle();
    expect(useGame.getState().state?.route).toEqual(["FRA", "ESP"]);
    expect(useGame.getState().state?.visited).toEqual(["BEL", "NLD", "ESP"]);
  });

  it("only resumes the game of the same URL", async () => {
    useGame.getState().start(challenge(), undefined, KEY);
    await settle();
    expect(await useGame.getState().findSaved("mode=classic&seed=other")).toBeNull();
    expect(await useGame.getState().findSaved(KEY)).not.toBeNull();
  });

  it("is removed when the game ends, and the finished game is stored first", async () => {
    const g = useGame.getState();
    g.start(challenge(), undefined, KEY);
    g.guess("ESP"); // Spain borders Portugal: victory
    for (let i = 0; i < 40 && !useGame.getState().result; i++) await settle();
    expect(useGame.getState().result?.status).toBe("won");
    expect(await loadInProgress(getDB())).toBeNull();
    expect((await loadSnapshot(getDB())).games.some((x) => x.challengeId === "resume-fra-prt")).toBe(true);
    expect(await useGame.getState().findSaved(KEY)).toBeNull();
  });

  it("giving up also ends and clears the saved game", async () => {
    const g = useGame.getState();
    g.start(challenge(), undefined, KEY);
    g.guess("BEL");
    g.giveUp();
    for (let i = 0; i < 40 && !useGame.getState().result; i++) await settle();
    expect(useGame.getState().result?.status).toBe("lost");
    expect(await loadInProgress(getDB())).toBeNull();
  });

  it("rejects incoherent saves instead of resuming them", () => {
    const ch = challenge();
    const state = freshState(ch);
    const base: InProgressRecord = { version: 1, key: KEY, challenge: ch, config: null, state, elapsedMs: 0, savedAt: 0 };
    expect(isResumable(base)).toBe(true);
    expect(isResumable(null)).toBe(false);
    expect(isResumable({ ...base, state: { ...state, status: "won" } })).toBe(false); // finished games are never resumed
    expect(isResumable({ ...base, state: { ...state, route: ["ZZZ"] } })).toBe(false); // unknown country
    expect(isResumable({ ...base, state: { ...state, challengeId: "other" } })).toBe(false); // state of another challenge
    expect(isResumable({ ...base, challenge: { ...ch, minIntermediate: 99 } })).toBe(false); // challenge no longer valid
    expect(isResumable({ ...base, version: 2 as unknown as 1 })).toBe(false);
  });
});

describe("saving never disturbs progression data", () => {
  it("a saved game is not part of exported data", async () => {
    const unique = { ...challenge(), id: "zz-only-in-progress" };
    await saveInProgress(getDB(), { version: 1, key: KEY, challenge: unique, config: null, state: freshState(unique), elapsedMs: 5, savedAt: 1 });
    expect(await loadInProgress(getDB())).not.toBeNull();
    const snap = await loadSnapshot(getDB());
    expect(JSON.stringify(snap)).not.toContain("zz-only-in-progress");
  });
});

describe("the name hint enters the country", () => {
  it("pays 300, then validates the suggested country like a normal move (route, discovery, victory)", async () => {
    const g = useGame.getState();
    g.start(challenge(), undefined, KEY);
    expect(g.hint("letter")).toBe(true);
    expect(g.hint("borders")).toBe(true);
    const before = useGame.getState().state!;
    expect(before.route).toEqual(["FRA"]); // the first two hints only point
    expect(g.hint("reveal")).toBe(true);
    const after = useGame.getState().state!;
    expect(after.hints.map((h) => h.penalty)).toEqual([75, 150, 300]);
    expect(after.route).toEqual(["FRA", "ESP"]); // the only way to Portugal in one step
    expect(after.visited).toEqual(["ESP"]);
    expect(after.mistakes).toEqual([]);
    expect(after.attemptsLeft).toBe(before.attemptsLeft); // no attempt consumed
    expect(after.status).toBe("won"); // Spain touches Portugal
    expect(useGame.getState().feedback?.via).toBe("hint");
    await settle();
  });
});
