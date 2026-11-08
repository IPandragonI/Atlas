import type { AtlasGraph } from "./graph/graph";
import { createHint, hintStatus } from "./hints";
import { reachesDestination, validateMove } from "./rules";
import { HINT_PENALTY } from "./scoring";
import type { Challenge, GameState, HintKind, HintRecord, MoveOutcome } from "./types";

export function createGame(ch: Challenge, now: number): GameState {
  return {
    challengeId: ch.id,
    route: [ch.start],
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
}

/**
 * Applies a guess. This is the only place where gameplay rules decide the outcome.
 * A rejected guess (for ANY reason) consumes exactly one attempt and carries no explanation.
 */
export function submitGuess(graph: AtlasGraph, ch: Challenge, state: GameState, guess: string, now: number): MoveResult {
  if (state.status !== "playing") return { state, outcome: "ignored" };
  const { valid } = validateMove(graph, ch, state.route, guess);
  if (valid) {
    // The destination is never appended to the route; it only decides victory.
    const route = [...state.route, guess];
    if (reachesDestination(graph, ch, route)) return { state: { ...state, route, status: "won", endedAt: now }, outcome: "won" };
    return { state: { ...state, route }, outcome: "accepted" };
  }
  const attemptsLeft = state.attemptsLeft - 1;
  const next: GameState = { ...state, attemptsLeft, mistakes: [...state.mistakes, guess] };
  if (attemptsLeft <= 0) return { state: { ...next, status: "lost", endedAt: now }, outcome: "lost" };
  return { state: next, outcome: "rejected" };
}

/**
 * Hints never consume attempts. They must be used in order (letter, then borders), once each per game;
 * out-of-order, repeated or undeterminable hints return null and cost nothing.
 */
export function useHint(graph: AtlasGraph, ch: Challenge, state: GameState, kind: HintKind): { state: GameState; hint: HintRecord } | null {
  if (state.status !== "playing") return null;
  if (hintStatus(state.hints, kind) !== "available") return null;
  const payload = createHint(graph, ch, state.route, kind, state.hints);
  if (!payload) return null;
  const hint: HintRecord = { payload, penalty: HINT_PENALTY[kind], atMove: state.route.length - 1 };
  return { state: { ...state, hints: [...state.hints, hint] }, hint };
}

export function giveUp(state: GameState, now: number): GameState {
  return state.status === "playing" ? { ...state, status: "lost", endedAt: now } : state;
}
