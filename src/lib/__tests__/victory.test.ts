import { describe, expect, it } from "vitest";
import { gameIdOf, isVictoryTransition, type GameSnapshot } from "../victory";

const snap = (gameId: string, status: GameSnapshot["status"]): GameSnapshot => ({ gameId, status });

describe("victory effects follow a genuine playing -> won transition of the SAME game", () => {
  it("fires when a game in progress is won", () => {
    expect(isVictoryTransition(snap("g1", "playing"), snap("g1", "won"))).toBe(true);
  });
  it("never fires when a game is first shown already won (restored completed daily, reload, results re-opened)", () => {
    expect(isVictoryTransition(null, snap("g1", "won"))).toBe(false);
  });
  it("never fires when a new game replaces a won one (restart, replay, new mode or configuration)", () => {
    expect(isVictoryTransition(snap("g1", "won"), snap("g2", "playing"))).toBe(false);
    expect(isVictoryTransition(snap("g1", "won"), snap("g2", "won"))).toBe(false); // even if the new game is shown as won (restored)
  });
  it("never fires when a different game is shown as won right after one in progress (a resumed or restored game)", () => {
    expect(isVictoryTransition(snap("g1", "playing"), snap("g2", "won"))).toBe(false);
  });
  it("never fires for a defeat, or while playing", () => {
    expect(isVictoryTransition(snap("g1", "playing"), snap("g1", "lost"))).toBe(false);
    expect(isVictoryTransition(snap("g1", "playing"), snap("g1", "playing"))).toBe(false);
  });
  it("never fires twice for the same victory (the state processed again)", () => {
    expect(isVictoryTransition(snap("g1", "won"), snap("g1", "won"))).toBe(false);
  });
  it("never fires when the game disappears", () => {
    expect(isVictoryTransition(snap("g1", "playing"), null)).toBe(false);
    expect(isVictoryTransition(null, null)).toBe(false);
  });
});

describe("game identity", () => {
  it("is unique per session of a challenge: a restart of the same challenge is a different game", () => {
    expect(gameIdOf("c1", 100)).not.toBe(gameIdOf("c1", 200));
    expect(gameIdOf("c1", 100)).not.toBe(gameIdOf("c2", 100));
    expect(gameIdOf("c1", 100)).toBe(gameIdOf("c1", 100));
  });
  it("is null when there is no game", () => {
    expect(gameIdOf(undefined, undefined)).toBeNull();
    expect(gameIdOf("c1", undefined)).toBeNull();
  });
});
