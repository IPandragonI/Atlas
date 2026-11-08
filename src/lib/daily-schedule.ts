import type { Difficulty, GameMode } from "@/engine/types";

export const DAILY_MODES: GameMode[] = ["classic", "constraints", "regional"];

/** Fixed difficulty per mode and UTC weekday (0 = Sunday). The same for every player. */
export const DAILY_DIFFICULTY: Record<GameMode, Difficulty[]> = {
  classic: ["normal", "easy", "easy", "normal", "normal", "hard", "normal"],
  constraints: ["hard", "easy", "normal", "normal", "normal", "hard", "normal"],
  regional: ["normal", "easy", "easy", "normal", "normal", "hard", "normal"],
};

/** Deterministic region rotation (stride 4 is coprime with the 15 playable regions). */
export function dailyRegionFor(date: string, regionIds: readonly string[]): string {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  return regionIds[(day * 4) % regionIds.length];
}

export function utcDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}
