import type { Country } from "@/engine/types";
import type { DailyRecord, GameRecord } from "@/lib/db";

/** Pure progression logic: achievements, statistics and streaks. No storage, no UI. */

export interface ProgressContext {
  countries: readonly Country[];
  discovered: ReadonlySet<string>;
  optimalRoutes: number;
}

export interface AchievementDef {
  id: string;
  check: (ctx: ProgressContext) => boolean;
  /** Progress towards the goal as [current, target] for display. */
  progress: (ctx: ProgressContext) => [number, number];
}

const count = (ctx: ProgressContext, pred: (c: Country) => boolean) => ctx.countries.filter((c) => ctx.discovered.has(c.id) && pred(c)).length;
const total = (ctx: ProgressContext, pred: (c: Country) => boolean) => ctx.countries.filter(pred).length;

export function continentsExplored(countries: readonly Country[], discovered: ReadonlySet<string>): number {
  return new Set(countries.filter((c) => discovered.has(c.id)).map((c) => c.continent)).size;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-journey", check: (c) => c.discovered.size >= 5, progress: (c) => [Math.min(5, c.discovered.size), 5] },
  {
    id: "european-explorer",
    check: (c) => count(c, (x) => x.continent === "europe") === total(c, (x) => x.continent === "europe"),
    progress: (c) => [count(c, (x) => x.continent === "europe"), total(c, (x) => x.continent === "europe")],
  },
  { id: "island-hopper", check: (c) => count(c, (x) => x.isIsland) >= 10, progress: (c) => [Math.min(10, count(c, (x) => x.isIsland)), 10] },
  {
    id: "around-the-world",
    check: (c) => continentsExplored(c.countries, c.discovered) === 6,
    progress: (c) => [continentsExplored(c.countries, c.discovered), 6],
  },
  { id: "globe-trotter", check: (c) => c.discovered.size >= 50, progress: (c) => [Math.min(50, c.discovered.size), 50] },
  { id: "geographer", check: (c) => c.optimalRoutes >= 10, progress: (c) => [Math.min(10, c.optimalRoutes), 10] },
];

/** Ids of achievements newly unlocked (not already in `already`). */
export function newlyUnlocked(ctx: ProgressContext, already: ReadonlySet<string>): string[] {
  return ACHIEVEMENTS.filter((a) => !already.has(a.id) && a.check(ctx)).map((a) => a.id);
}

export interface Stats {
  played: number;
  wins: number;
  losses: number;
  optimal: number;
  discovered: number;
  traversed: number;
  continents: number;
  islands: number;
  avgScore: number;
  avgTimeMs: number;
  hintsUsed: number;
  errors: number;
  streak: number;
  bestStreak: number;
}

export function computeStats(
  games: readonly GameRecord[],
  discovered: ReadonlySet<string>,
  visits: number,
  countries: readonly Country[],
  daily: readonly DailyRecord[],
  today: string,
): Stats {
  const wins = games.filter((g) => g.status === "won");
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const { current, best } = dailyStreak(daily, today);
  return {
    played: games.length,
    wins: wins.length,
    losses: games.length - wins.length,
    optimal: games.filter((g) => g.optimal).length,
    discovered: discovered.size,
    traversed: visits,
    continents: continentsExplored(countries, discovered),
    islands: countries.filter((c) => c.isIsland && discovered.has(c.id)).length,
    avgScore: mean(games.map((g) => g.score)),
    avgTimeMs: mean(games.map((g) => g.durationMs)),
    hintsUsed: games.reduce((s, g) => s + g.hints, 0),
    errors: games.reduce((s, g) => s + g.mistakes, 0),
    streak: current,
    bestStreak: best,
  };
}

const DAY = 86400000;
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);

/**
 * A day counts when at least one daily challenge was WON that day.
 * The current streak survives until the end of the day after the last win (UTC).
 */
export function dailyStreak(daily: readonly DailyRecord[], today: string): { current: number; best: number } {
  const days = [...new Set(daily.filter((d) => d.status === "won").map((d) => dayNum(d.date)))].sort((a, b) => a - b);
  let best = 0, run = 0, prev = -Infinity;
  for (const d of days) {
    run = d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  const t = dayNum(today);
  const last = days[days.length - 1];
  const current = last !== undefined && (last === t || last === t - 1) ? run : 0;
  return { current, best };
}
