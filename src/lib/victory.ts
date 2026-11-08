import type { GameStatus } from "@/engine/types";

/** What the game screen currently shows: which game it is, and where that game stands. */
export interface GameSnapshot {
  /** Unique per game session (challenge id + the moment it started). A restart or a new game always changes it. */
  gameId: string;
  status: GameStatus;
}

/**
 * The ONE rule for victory effects (sparkles and sound): they fire when, and only when, the SAME game goes from
 * "playing" to "won". Any other situation (first render, restoring a finished game, a saved game being resumed,
 * a restart, a new game, a defeat, the same victory seen twice) is not a victory transition.
 */
export function isVictoryTransition(prev: GameSnapshot | null, next: GameSnapshot | null): boolean {
  return !!prev && !!next && prev.gameId === next.gameId && prev.status === "playing" && next.status === "won";
}

/** Stable id of a game session, or null when there is no game on screen. */
export function gameIdOf(challengeId: string | undefined, startedAt: number | undefined): string | null {
  return challengeId !== undefined && startedAt !== undefined ? `${challengeId}@${startedAt}` : null;
}
