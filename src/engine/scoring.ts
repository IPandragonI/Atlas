import type { GameResult, GameState, HintKind, ScoreBreakdown } from "./types";

export const SCORE = {
  victory: 500,
  optimal: 300,
  noMistakes: 100,
  noHints: 100,
  mistake: 25,
  max: 1000,
} as const;

export const HINT_PENALTY: Record<HintKind, number> = {
  letter: 75,
  borders: 150,
};

export interface ScoreInput {
  victory: boolean;
  optimal: boolean;
  mistakes: number;
  hints: readonly HintKind[];
}

/**
 * Deterministic score out of 1000. A defeat earns 0: every bonus is conditional on victory,
 * the breakdown is still returned so the result screen can explain it.
 */
export function computeScore(input: ScoreInput): ScoreBreakdown {
  const hintPenalty = input.hints.reduce((s, h) => s + HINT_PENALTY[h], 0);
  const mistakePenalty = input.mistakes * SCORE.mistake;
  if (!input.victory) {
    return { victory: 0, optimal: 0, noMistakes: 0, noHints: 0, mistakePenalty, hintPenalty, total: 0 };
  }
  const victory = SCORE.victory;
  const optimal = input.optimal ? SCORE.optimal : 0;
  const noMistakes = input.mistakes === 0 ? SCORE.noMistakes : 0;
  const noHints = input.hints.length === 0 ? SCORE.noHints : 0;
  const raw = victory + optimal + noMistakes + noHints - mistakePenalty - hintPenalty;
  return { victory, optimal, noMistakes, noHints, mistakePenalty, hintPenalty, total: Math.max(0, Math.min(SCORE.max, raw)) };
}

/** Builds the final result for a finished game. */
export function buildResult(state: GameState, minIntermediate: number): GameResult {
  if (state.status === "playing") throw new Error("Game still in progress");
  const won = state.status === "won";
  // The route holds start + entered countries only (the destination is never part of it).
  const intermediates = Math.max(0, state.route.length - 1);
  const optimal = won && intermediates === minIntermediate;
  const hintsUsed = state.hints.map((h) => h.payload.kind);
  return {
    challengeId: state.challengeId,
    status: won ? "won" : "lost",
    route: state.route,
    intermediates,
    minIntermediate,
    optimal,
    mistakes: state.mistakes.length,
    hintsUsed,
    score: computeScore({ victory: won, optimal, mistakes: state.mistakes.length, hints: hintsUsed }),
    durationMs: Math.max(0, (state.endedAt ?? state.startedAt) - state.startedAt),
  };
}
