import Dexie, { type EntityTable } from "dexie";
import type { HistoryEntry } from "@/engine/generator/diversity";
import type { Challenge, ChallengeDifficulty, GameMode, GameState } from "@/engine/types";
import type { GameConfig } from "@/lib/config";

/** Bump when the IndexedDB structure changes, and add a `.version(n)` block with an upgrade. */
export const DB_VERSION = 1;
/** Version of the export file format (independent from the DB version). */
export const EXPORT_SCHEMA_VERSION = 1;

export interface GameRecord {
  id?: number;
  challengeId: string;
  mode: GameMode;
  difficulty: ChallengeDifficulty;
  daily?: string;
  status: "won" | "lost";
  score: number;
  intermediates: number;
  minIntermediate: number;
  optimal: boolean;
  mistakes: number;
  hints: number;
  durationMs: number;
  route: string[];
  finishedAt: number;
  /** Added with RULES_VERSION 2 (the destination is no longer part of the route). Optional for older data. */
  destination?: string;
  /** "letter" | "borders" (older saves may contain the former "geographic" | "connectivity" | "discovery"). */
  hintKinds?: string[];
}
export interface DiscoveredRecord {
  id: string;
  firstAt: number;
  visits: number;
}
export interface DailyRecord {
  challengeId: string;
  date: string;
  mode: GameMode;
  status: "won" | "lost";
  score: number;
  finishedAt: number;
}
export interface AchievementRecord {
  id: string;
  unlockedAt: number;
}
export interface RecentRecord {
  id?: number;
  entry: HistoryEntry;
  at: number;
}
export interface KVRecord {
  key: string;
  value: unknown;
}

export class AtlasDB extends Dexie {
  kv!: EntityTable<KVRecord, "key">;
  discovered!: EntityTable<DiscoveredRecord, "id">;
  games!: EntityTable<GameRecord, "id">;
  daily!: EntityTable<DailyRecord, "challengeId">;
  achievements!: EntityTable<AchievementRecord, "id">;
  recents!: EntityTable<RecentRecord, "id">;

  constructor(name = "atlas") {
    super(name);
    this.version(1).stores({
      kv: "key",
      discovered: "id, firstAt",
      games: "++id, challengeId, finishedAt, daily",
      daily: "challengeId, date",
      achievements: "id",
      recents: "++id, at",
    });
  }
}

let shared: AtlasDB | null = null;
export function getDB(): AtlasDB {
  if (!shared) shared = new AtlasDB();
  return shared;
}

// ------------------------------------------------------------------ repository

export interface Snapshot {
  settings: Record<string, unknown>;
  discovered: DiscoveredRecord[];
  games: GameRecord[];
  daily: DailyRecord[];
  achievements: AchievementRecord[];
  recents: RecentRecord[];
}

export async function loadSnapshot(db: AtlasDB): Promise<Snapshot> {
  const [settings, discovered, games, daily, achievements, recents] = await Promise.all([
    db.kv.get("settings"),
    db.discovered.toArray(),
    db.games.orderBy("finishedAt").toArray(),
    db.daily.toArray(),
    db.achievements.toArray(),
    db.recents.orderBy("at").toArray(),
  ]);
  return {
    settings: (settings?.value as Record<string, unknown>) ?? {},
    discovered,
    games,
    daily,
    achievements,
    recents,
  };
}

export async function saveSettings(db: AtlasDB, settings: Record<string, unknown>): Promise<void> {
  await db.kv.put({ key: "settings", value: settings });
}

/** Discovery is immediate: called as soon as the player correctly enters a country. */
export async function touchCountry(db: AtlasDB, id: string, now: number): Promise<{ isNew: boolean }> {
  return db.transaction("rw", db.discovered, async () => {
    const cur = await db.discovered.get(id);
    if (cur) {
      await db.discovered.update(id, { visits: cur.visits + 1 });
      return { isNew: false };
    }
    await db.discovered.add({ id, firstAt: now, visits: 1 });
    return { isNew: true };
  });
}

export async function recordGame(db: AtlasDB, game: GameRecord, recent?: HistoryEntry): Promise<void> {
  await db.transaction("rw", db.games, db.daily, db.recents, async () => {
    await db.games.add(game);
    if (game.daily) {
      const existing = await db.daily.get(game.challengeId);
      // The first completed attempt of a daily challenge is the one that counts.
      if (!existing) {
        await db.daily.put({ challengeId: game.challengeId, date: game.daily, mode: game.mode, status: game.status, score: game.score, finishedAt: game.finishedAt });
      }
    }
    if (recent) {
      await db.recents.add({ entry: recent, at: game.finishedAt });
      const count = await db.recents.count();
      if (count > 120) {
        const oldest = await db.recents.orderBy("at").limit(count - 120).primaryKeys();
        await db.recents.bulkDelete(oldest);
      }
    }
  });
}

export async function unlockAchievements(db: AtlasDB, ids: string[], now: number): Promise<void> {
  await db.achievements.bulkPut(ids.map((id) => ({ id, unlockedAt: now })));
}

export async function resetAll(db: AtlasDB): Promise<void> {
  await db.transaction("rw", [db.kv, db.discovered, db.games, db.daily, db.achievements, db.recents], async () => {
    await Promise.all([db.kv.clear(), db.discovered.clear(), db.games.clear(), db.daily.clear(), db.achievements.clear(), db.recents.clear()]);
  });
}

// ------------------------------------------------------------------ export / import

export interface ExportFile {
  app: "atlas";
  schemaVersion: number;
  exportedAt: string;
  data: Snapshot;
}

export async function exportData(db: AtlasDB, now = new Date()): Promise<ExportFile> {
  return { app: "atlas", schemaVersion: EXPORT_SCHEMA_VERSION, exportedAt: now.toISOString(), data: await loadSnapshot(db) };
}

export type ImportResult = { ok: true; data: Snapshot } | { ok: false; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Migrates older export versions to the current shape. Add a case per past version. */
export function migrateExport(file: Record<string, unknown>): Record<string, unknown> {
  const v = file.schemaVersion;
  if (!isNum(v)) throw new Error("missing schemaVersion");
  if (v > EXPORT_SCHEMA_VERSION) throw new Error(`file from a newer version (${v})`);
  // v1 is current; future migrations: if (v < 2) { ...transform file.data...; }
  return file;
}

/** Strict validation: nothing from an imported file reaches the database without passing here. */
export function validateImport(raw: unknown, knownCountries?: ReadonlySet<string>): ImportResult {
  try {
    if (!isObj(raw)) return { ok: false, reason: "not an object" };
    if (raw.app !== "atlas") return { ok: false, reason: "not an Atlas export" };
    const file = migrateExport(raw);
    const d = file.data;
    if (!isObj(d)) return { ok: false, reason: "missing data" };
    const okCountry = (id: unknown): id is string => isStr(id) && /^[A-Z]{3}$/.test(id) && (!knownCountries || knownCountries.has(id));

    const discovered: DiscoveredRecord[] = [];
    for (const r of arr(d.discovered)) {
      if (!isObj(r) || !okCountry(r.id) || !isNum(r.firstAt) || !isNum(r.visits) || r.visits < 0) return { ok: false, reason: "invalid discovered entry" };
      discovered.push({ id: r.id, firstAt: r.firstAt, visits: Math.floor(r.visits) });
    }
    const games: GameRecord[] = [];
    for (const r of arr(d.games)) {
      if (!isObj(r) || !isStr(r.challengeId) || !isNum(r.finishedAt) || !isNum(r.score)) return { ok: false, reason: "invalid game entry" };
      if (r.status !== "won" && r.status !== "lost") return { ok: false, reason: "invalid game status" };
      if (!["classic", "constraints", "regional"].includes(r.mode as string)) return { ok: false, reason: "invalid game mode" };
      if (!["easy", "normal", "hard", "custom"].includes(r.difficulty as string)) return { ok: false, reason: "invalid difficulty" };
      if (!Array.isArray(r.route) || !r.route.every(okCountry)) return { ok: false, reason: "invalid route" };
      games.push({
        challengeId: r.challengeId, mode: r.mode as GameMode, difficulty: r.difficulty as ChallengeDifficulty,
        daily: isStr(r.daily) ? r.daily : undefined, status: r.status, score: r.score,
        intermediates: isNum(r.intermediates) ? r.intermediates : 0, minIntermediate: isNum(r.minIntermediate) ? r.minIntermediate : 0,
        optimal: r.optimal === true, mistakes: isNum(r.mistakes) ? r.mistakes : 0, hints: isNum(r.hints) ? r.hints : 0,
        durationMs: isNum(r.durationMs) ? r.durationMs : 0, route: r.route as string[], finishedAt: r.finishedAt,
        destination: okCountry(r.destination) ? r.destination : undefined,
        hintKinds: Array.isArray(r.hintKinds) ? r.hintKinds.filter((k): k is string => typeof k === "string" && ["letter", "borders", "geographic", "connectivity", "discovery"].includes(k)) : undefined,
      });
    }
    const daily: DailyRecord[] = [];
    for (const r of arr(d.daily)) {
      if (!isObj(r) || !isStr(r.challengeId) || !isStr(r.date) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !isNum(r.score) || !isNum(r.finishedAt))
        return { ok: false, reason: "invalid daily entry" };
      if ((r.status !== "won" && r.status !== "lost") || !["classic", "constraints", "regional"].includes(r.mode as string)) return { ok: false, reason: "invalid daily entry" };
      daily.push({ challengeId: r.challengeId, date: r.date, mode: r.mode as GameMode, status: r.status, score: r.score, finishedAt: r.finishedAt });
    }
    const achievements: AchievementRecord[] = [];
    for (const r of arr(d.achievements)) {
      if (!isObj(r) || !isStr(r.id) || !isNum(r.unlockedAt)) return { ok: false, reason: "invalid achievement" };
      achievements.push({ id: r.id, unlockedAt: r.unlockedAt });
    }
    const recents: RecentRecord[] = [];
    for (const r of arr(d.recents)) {
      if (!isObj(r) || !isNum(r.at) || !isObj(r.entry)) return { ok: false, reason: "invalid recent entry" };
      const e = r.entry;
      if (!okCountry(e.start) || !okCountry(e.destination) || !Array.isArray(e.route) || !e.route.every(okCountry)) return { ok: false, reason: "invalid recent entry" };
      recents.push({ at: r.at, entry: { mode: e.mode as GameMode, start: e.start, destination: e.destination, route: e.route as string[] } });
    }
    const settings = isObj(d.settings) ? d.settings : {};
    return { ok: true, data: { settings, discovered, games, daily, achievements, recents } };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "unknown error" };
  }
}

/** Replaces the whole database with validated data (atomic). */
export async function importSnapshot(db: AtlasDB, data: Snapshot): Promise<void> {
  await db.transaction("rw", [db.kv, db.discovered, db.games, db.daily, db.achievements, db.recents], async () => {
    await Promise.all([db.kv.clear(), db.discovered.clear(), db.games.clear(), db.daily.clear(), db.achievements.clear(), db.recents.clear()]);
    await db.kv.put({ key: "settings", value: data.settings });
    await db.discovered.bulkPut(data.discovered);
    await db.games.bulkAdd(data.games);
    await db.daily.bulkPut(data.daily);
    await db.achievements.bulkPut(data.achievements);
    await db.recents.bulkAdd(data.recents);
  });
}

// ------------------------------------------------------------------ in-progress game (resume)

/**
 * The single game currently being played, saved after every move so a reload, a crash or a phone call never loses it.
 * Stored in the existing `kv` table (no schema change). It is NOT part of exports and is removed when the game ends.
 */
export interface InProgressRecord {
  version: 1;
  /** Identity of the game = its URL parameters; opening the same URL resumes this game. */
  key: string;
  challenge: Challenge;
  config: GameConfig | null;
  state: GameState;
  /** Time already played, so the clock resumes instead of counting the time away. */
  elapsedMs: number;
  savedAt: number;
}

const IN_PROGRESS_KEY = "inprogress";

export async function saveInProgress(db: AtlasDB, rec: InProgressRecord): Promise<void> {
  await db.kv.put({ key: IN_PROGRESS_KEY, value: rec });
}
export async function loadInProgress(db: AtlasDB): Promise<InProgressRecord | null> {
  const row = await db.kv.get(IN_PROGRESS_KEY);
  const v = row?.value as InProgressRecord | undefined;
  return v && typeof v === "object" && v.version === 1 && typeof v.key === "string" ? v : null;
}
export async function clearInProgress(db: AtlasDB): Promise<void> {
  await db.kv.delete(IN_PROGRESS_KEY);
}
