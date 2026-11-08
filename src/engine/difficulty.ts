import type { Difficulty } from "./types";

/** Extra attempts granted on top of the minimum number of intermediate countries. */
export const DIFFICULTY_MARGIN: Record<Difficulty, number> = { easy: 5, normal: 3, hard: 1 };

/** Attempts = MinimumIntermediateCountries + DifficultyMargin. */
export function attemptsFor(minIntermediate: number, difficulty: Difficulty): number {
  if (minIntermediate < 0) throw new Error("Cannot compute attempts for an infeasible challenge");
  return minIntermediate + DIFFICULTY_MARGIN[difficulty];
}

/** Absolute intermediate-count bands used for world-scale (classic / constraints) challenges. */
export const WORLD_BANDS: Record<Difficulty, { min: number; max: number }> = {
  easy: { min: 2, max: 3 },
  normal: { min: 4, max: 6 },
  hard: { min: 7, max: 12 },
};

/** Bands for a region, scaled by its diameter (max intermediates between any two members). */
export function regionBands(diameter: number): Record<Difficulty, { min: number; max: number }> {
  const d = Math.max(1, diameter);
  const e = Math.max(1, Math.round(d * 0.34));
  const n = Math.max(e + 1, Math.round(d * 0.68));
  return {
    easy: { min: 1, max: e },
    normal: { min: Math.min(e + 1, d), max: Math.min(n, d) },
    hard: { min: Math.min(n + 1, d), max: d },
  };
}
