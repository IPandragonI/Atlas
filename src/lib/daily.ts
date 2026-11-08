import { REGION_DEFS } from "@/data/regions";
import { dailyId } from "@/engine/generator/generator";
import type { HistoryEntry } from "@/engine/generator/diversity";
import type { Challenge, GameMode } from "@/engine/types";
import { DAILY_DIFFICULTY, dailyRegionFor } from "./daily-schedule";
import { generateAsync } from "./generate-client";
import { validateChallenge } from "./generate";

export interface DailyLoad {
  challenge: Challenge;
  /** True when the static file was missing/invalid and the challenge was generated locally. */
  fallback: boolean;
}

/**
 * Loads a published daily challenge. Published files are never regenerated; when one is missing
 * (e.g. a date beyond the bundled range) the same deterministic generator is used offline,
 * seeded by the date so every player still gets the same challenge.
 */
export async function loadDailyChallenge(date: string, mode: GameMode, history: readonly HistoryEntry[] = []): Promise<DailyLoad | null> {
  try {
    const res = await fetch(`/daily/${date}.json`, { cache: "force-cache" });
    if (res.ok) {
      const file = (await res.json()) as { challenges?: Challenge[] };
      const ch = file.challenges?.find((c) => c.mode === mode);
      if (ch && validateChallenge(ch)) return { challenge: ch, fallback: false };
    }
  } catch {
    /* offline and not cached: fall through */
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const difficulty = DAILY_DIFFICULTY[mode][weekday];
  const region = mode === "regional" ? dailyRegionFor(date, REGION_DEFS.map((r) => r.id)) : undefined;
  const g = await generateAsync({ mode, difficulty, region, seed: `${date}|${mode}`, id: dailyId(date, mode), date, candidates: 600 }, history, { attempts: 12 });
  return g ? { challenge: g.challenge, fallback: true } : null;
}

/** Daily difficulty/region for a date without loading anything (used by the home cards). */
export function dailyMeta(date: string, mode: GameMode) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return {
    difficulty: DAILY_DIFFICULTY[mode][weekday],
    region: mode === "regional" ? dailyRegionFor(date, REGION_DEFS.map((r) => r.id)) : undefined,
  };
}
