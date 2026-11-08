import { DAILY_MODES } from "./daily-schedule";
import type { GameMode } from "@/engine/types";

export type NextSuggestion = { kind: "daily"; mode: GameMode } | { kind: "classic" };

export const dailyChallengeId = (date: string, mode: GameMode) => `daily-${date}-${mode}`;

/** Today's daily modes not completed yet, excluding the one just played. Order: classic, constraints, regional. */
export function remainingDailies(date: string, completedChallengeIds: readonly string[], current: GameMode): GameMode[] {
  const done = new Set(completedChallengeIds);
  done.add(dailyChallengeId(date, current)); // the game that was just finished counts as completed
  return DAILY_MODES.filter((m) => m !== current && !done.has(dailyChallengeId(date, m)));
}

/**
 * What to suggest after a finished DAILY challenge: another daily that is still to play (constraints / regional first
 * when classic is done); once the three dailies are completed, a new Classic game.
 */
export function suggestAfterDaily(date: string, completedChallengeIds: readonly string[], current: GameMode): NextSuggestion {
  const left = remainingDailies(date, completedChallengeIds, current);
  return left.length > 0 ? { kind: "daily", mode: left[0] } : { kind: "classic" };
}
