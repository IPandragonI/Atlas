import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { COUNTRIES } from "@/lib/atlas";
import {
  AtlasDB, exportData, importSnapshot, loadSnapshot, recordGame, resetAll, saveSettings, touchCountry, unlockAchievements, validateImport,
  type GameRecord,
} from "../db";
import { ACHIEVEMENTS, computeStats, dailyStreak, newlyUnlocked } from "../progress";

let db: AtlasDB;
let n = 0;
beforeEach(() => {
  db = new AtlasDB(`test-${n++}`);
});

const game = (over: Partial<GameRecord> = {}): GameRecord => ({
  challengeId: "c1", mode: "classic", difficulty: "normal", status: "won", score: 900, intermediates: 2, minIntermediate: 2,
  optimal: true, mistakes: 0, hints: 0, durationMs: 30000, route: ["FRA", "DEU", "POL"], finishedAt: 1000, ...over,
});
const known = new Set(COUNTRIES.map((c) => c.id));

describe("persistence", () => {
  it("saves and reloads settings, discoveries and games", async () => {
    await saveSettings(db, { theme: "dark" });
    expect((await touchCountry(db, "DEU", 5)).isNew).toBe(true);
    expect((await touchCountry(db, "DEU", 9)).isNew).toBe(false);
    await recordGame(db, game(), { mode: "classic", start: "FRA", destination: "POL", route: ["FRA", "DEU", "POL"] });
    const reopened = new AtlasDB(db.name);
    const snap = await loadSnapshot(reopened);
    expect(snap.settings).toEqual({ theme: "dark" });
    expect(snap.discovered).toEqual([{ id: "DEU", firstAt: 5, visits: 2 }]);
    expect(snap.games).toHaveLength(1);
    expect(snap.recents).toHaveLength(1);
  });

  it("keeps only the first completion of a daily challenge", async () => {
    await recordGame(db, game({ challengeId: "daily-1", daily: "2026-11-01", status: "lost", score: 0 }));
    await recordGame(db, game({ challengeId: "daily-1", daily: "2026-11-01", status: "won", finishedAt: 2000 }));
    const snap = await loadSnapshot(db);
    expect(snap.daily).toHaveLength(1);
    expect(snap.daily[0].status).toBe("lost");
  });

  it("round-trips export -> validate -> import", async () => {
    await touchCountry(db, "FRA", 1);
    await recordGame(db, game({ challengeId: "daily-2", daily: "2026-11-02" }));
    await unlockAchievements(db, ["first-journey"], 3);
    const file = JSON.parse(JSON.stringify(await exportData(db)));
    const res = validateImport(file, known);
    expect(res.ok).toBe(true);
    const other = new AtlasDB("test-import");
    if (res.ok) await importSnapshot(other, res.data);
    const snap = await loadSnapshot(other);
    expect(snap.discovered.map((d) => d.id)).toEqual(["FRA"]);
    expect(snap.achievements.map((a) => a.id)).toEqual(["first-journey"]);
    expect(snap.daily).toHaveLength(1);
  });

  it("rejects invalid imports", () => {
    expect(validateImport(null).ok).toBe(false);
    expect(validateImport({ app: "other" }).ok).toBe(false);
    expect(validateImport({ app: "atlas", schemaVersion: 99, data: {} }).ok).toBe(false);
    expect(validateImport({ app: "atlas", schemaVersion: 1, data: { discovered: [{ id: "XXX1", firstAt: 1, visits: 1 }] } }).ok).toBe(false);
    expect(validateImport({ app: "atlas", schemaVersion: 1, data: { discovered: [{ id: "ZZZ", firstAt: 1, visits: 1 }] } }, known).ok).toBe(false);
    expect(validateImport({ app: "atlas", schemaVersion: 1, data: { games: [{ challengeId: "x", finishedAt: 1, score: 1, status: "draw" }] } }).ok).toBe(false);
    expect(validateImport({ app: "atlas", schemaVersion: 1, data: {} }).ok).toBe(true);
  });

  it("reset wipes every table", async () => {
    await touchCountry(db, "FRA", 1);
    await recordGame(db, game());
    await saveSettings(db, { a: 1 });
    await resetAll(db);
    const snap = await loadSnapshot(db);
    expect(snap.discovered).toHaveLength(0);
    expect(snap.games).toHaveLength(0);
    expect(snap.settings).toEqual({});
  });

  it("reopening the database keeps data and schema version", async () => {
    await touchCountry(db, "ESP", 1);
    db.close();
    const again = new AtlasDB(db.name);
    expect((await again.discovered.toArray()).map((d) => d.id)).toEqual(["ESP"]);
    expect(again.verno).toBe(1);
  });
});

describe("progression", () => {
  const ctx = (ids: string[], optimalRoutes = 0) => ({ countries: COUNTRIES, discovered: new Set(ids), optimalRoutes });
  it("unlocks achievements by rule", () => {
    expect(newlyUnlocked(ctx(["FRA", "DEU", "ESP", "ITA"]), new Set())).toEqual([]);
    expect(newlyUnlocked(ctx(["FRA", "DEU", "ESP", "ITA", "BEL"]), new Set())).toEqual(["first-journey"]);
    expect(newlyUnlocked(ctx(["FRA", "DEU", "ESP", "ITA", "BEL"]), new Set(["first-journey"]))).toEqual([]);
    const europe = COUNTRIES.filter((c) => c.continent === "europe").map((c) => c.id);
    expect(newlyUnlocked(ctx(europe), new Set()).includes("european-explorer")).toBe(true);
    expect(ACHIEVEMENTS.find((a) => a.id === "geographer")!.check(ctx([], 10))).toBe(true);
    const oneEach = ["europe", "africa", "asia", "north-america", "south-america", "oceania"].map((k) => COUNTRIES.find((c) => c.continent === k)!.id);
    expect(newlyUnlocked(ctx(oneEach), new Set()).includes("around-the-world")).toBe(true);
  });
  it("computes the daily streak in UTC", () => {
    const d = (date: string, status: "won" | "lost" = "won") => ({ challengeId: date + status, date, mode: "classic" as const, status, score: 1, finishedAt: 0 });
    expect(dailyStreak([d("2026-11-05"), d("2026-11-06"), d("2026-11-07")], "2026-11-07")).toEqual({ current: 3, best: 3 });
    expect(dailyStreak([d("2026-11-05"), d("2026-11-06")], "2026-11-07").current).toBe(2);
    expect(dailyStreak([d("2026-11-05"), d("2026-11-06")], "2026-11-08").current).toBe(0);
    expect(dailyStreak([d("2026-11-05"), d("2026-11-07")], "2026-11-07")).toEqual({ current: 1, best: 1 });
    expect(dailyStreak([d("2026-11-05", "lost")], "2026-11-05").current).toBe(0);
  });
  it("computes statistics", () => {
    const s = computeStats([game(), game({ status: "lost", score: 0, optimal: false, mistakes: 3, hints: 1 })], new Set(["FRA"]), 4, COUNTRIES, [], "2026-11-01");
    expect(s).toMatchObject({ played: 2, wins: 1, losses: 1, optimal: 1, avgScore: 450, errors: 3, hintsUsed: 1, discovered: 1, traversed: 4 });
  });
});
