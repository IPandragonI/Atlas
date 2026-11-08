import type { AtlasGraph } from "./graph/graph";
import { createHint, hintStatus } from "./hints";
import { reachesDestination, validateMove } from "./rules";
import { HINT_PENALTY } from "./scoring";
import type { Challenge, GameState, HintKind, HintRecord, MoveOutcome } from "./types";

export function createGame(ch: Challenge, now: number): GameState {
  return {
    challengeId: ch.id,
    route: [ch.start],
    visited: [],
    attemptsTotal: ch.attempts,
    attemptsLeft: ch.attempts,
    mistakes: [],
    hints: [],
    status: "playing",
    startedAt: now,
  };
}

export interface MoveResult {
  state: GameState;
  outcome: MoveOutcome;
  /** Countries that left the active route because the player changed direction (still in the discovery history). */
  removed?: string[];
}

/**
 * Applies a guess. This is the only place where gameplay rules decide the outcome.
 * A rejected guess (for ANY reason) consumes exactly one attempt and carries no explanation, unless that same country was
 * already rejected earlier in this game (then it is "repeated" and free).
 */
export function submitGuess(graph: AtlasGraph, ch: Challenge, state: GameState, guess: string, now: number): MoveResult {
  if (state.status !== "playing") return { state, outcome: "ignored" };
  const { valid, from } = validateMove(graph, ch, state.route, guess);
  if (valid) {
    // A change of direction replaces the abandoned branch: the active route ends at the connection point + the new country.
    // The destination is never appended to the route; it only decides victory. No attempt is consumed and nothing is penalised.
    const route = [...state.route.slice(0, from + 1), guess];
    const removed = state.route.slice(from + 1);
    const visited = state.visited.includes(guess) ? state.visited : [...state.visited, guess];
    const base: GameState = { ...state, route, visited };
    if (reachesDestination(graph, ch, route)) return { state: { ...base, status: "won", endedAt: now }, outcome: "won", removed };
    return { state: base, outcome: "accepted", removed };
  }
  // The same wrong country submitted again is a slip, not a new mistake: no attempt, no penalty, nothing recorded.
  // (A country rejected earlier can become valid later, e.g. after a change of direction: that is checked above first.)
  if (state.mistakes.includes(guess)) return { state, outcome: "repeated" };
  const attemptsLeft = state.attemptsLeft - 1;
  const next: GameState = { ...state, attemptsLeft, mistakes: [...state.mistakes, guess] };
  if (attemptsLeft <= 0) return { state: { ...next, status: "lost", endedAt: now }, outcome: "lost" };
  return { state: next, outcome: "rejected" };
}

/**
 * Hints never consume attempts. They must be used in order (letter, borders, reveal), once each per game;
 * out-of-order, repeated or undeterminable hints return null and cost nothing.
 */
export function useHint(graph: AtlasGraph, ch: Challenge, state: GameState, kind: HintKind): { state: GameState; hint: HintRecord } | null {
  if (state.status !== "playing") return null;
  if (hintStatus(state.hints, kind) !== "available") return null;
  const payload = createHint(graph, ch, state.route, kind, state.hints);
  if (!payload) return null;
  const hint: HintRecord = { payload, penalty: HINT_PENALTY[kind], atMove: state.route.length - 1, routeKey: state.route.join(">") };
  return { state: { ...state, hints: [...state.hints, hint] }, hint };
}

export function giveUp(state: GameState, now: number): GameState {
  return state.status === "playing" ? { ...state, status: "lost", endedAt: now } : state;
}
