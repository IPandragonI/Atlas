"use client";

import { create } from "zustand";
import type { HistoryEntry } from "@/engine/generator/diversity";
import { COUNTRIES } from "@/lib/atlas";
import {
  exportData, getDB, importSnapshot, loadSnapshot, recordGame, resetAll, touchCountry, unlockAchievements, validateImport,
  type AchievementRecord, type DailyRecord, type DiscoveredRecord, type GameRecord, type RecentRecord,
} from "@/lib/db";
import { newlyUnlocked } from "@/lib/progress";
import { useSettings } from "./settings";

const KNOWN = new Set(COUNTRIES.map((c) => c.id));

interface ProgressStore {
  loaded: boolean;
  discovered: Record<string, DiscoveredRecord>;
  games: GameRecord[];
  daily: DailyRecord[];
  achievements: AchievementRecord[];
  recents: RecentRecord[];
  hydrate: () => Promise<void>;
  discover: (id: string) => Promise<boolean>;
  finishGame: (game: GameRecord, recent?: HistoryEntry) => Promise<string[]>;
  exportJson: () => Promise<string>;
  importJson: (text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  reset: () => Promise<void>;
}

export const useProgress = create<ProgressStore>((set, get) => ({
  loaded: false,
  discovered: {},
  games: [],
  daily: [],
  achievements: [],
  recents: [],

  hydrate: async () => {
    try {
      const snap = await loadSnapshot(getDB());
      set({
        loaded: true,
        discovered: Object.fromEntries(snap.discovered.map((d) => [d.id, d])),
        games: snap.games,
        daily: snap.daily,
        achievements: snap.achievements,
        recents: snap.recents,
      });
      if (Object.keys(snap.settings).length) useSettings.getState().replace(snap.settings);
    } catch {
      set({ loaded: true }); // storage unavailable: the game remains playable, progress is just not saved
    }
  },

  /** Immediate discovery: called the moment a country is correctly entered. */
  discover: async (id) => {
    const now = Date.now();
    const prev = get().discovered[id];
    set((s) => ({ discovered: { ...s.discovered, [id]: { id, firstAt: prev?.firstAt ?? now, visits: (prev?.visits ?? 0) + 1 } } }));
    try {
      return (await touchCountry(getDB(), id, now)).isNew;
    } catch {
      return !prev;
    }
  },

  finishGame: async (game, recent) => {
    let saved: GameRecord = game;
    try {
      await recordGame(getDB(), game, recent);
    } catch {
      /* keep in memory only */
    }
    const state = get();
    const games = [...state.games, saved];
    const daily =
      game.daily && !state.daily.some((d) => d.challengeId === game.challengeId)
        ? [...state.daily, { challengeId: game.challengeId, date: game.daily, mode: game.mode, status: game.status, score: game.score, finishedAt: game.finishedAt }]
        : state.daily;
    const recents = recent ? [...state.recents, { entry: recent, at: game.finishedAt }].slice(-120) : state.recents;
    const have = new Set(state.achievements.map((a) => a.id));
    const fresh = newlyUnlocked(
      { countries: COUNTRIES, discovered: new Set(Object.keys(state.discovered)), optimalRoutes: games.filter((g) => g.optimal).length },
      have,
    );
    if (fresh.length) {
      try {
        await unlockAchievements(getDB(), fresh, game.finishedAt);
      } catch {
        /* ignore */
      }
    }
    saved = game;
    set({ games, daily, recents, achievements: [...state.achievements, ...fresh.map((id) => ({ id, unlockedAt: game.finishedAt }))] });
    return fresh;
  },

  exportJson: async () => JSON.stringify(await exportData(getDB()), null, 2),

  importJson: async (text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, reason: "JSON" };
    }
    const res = validateImport(parsed, KNOWN);
    if (!res.ok) return res;
    await importSnapshot(getDB(), res.data);
    await get().hydrate();
    return { ok: true };
  },

  reset: async () => {
    await resetAll(getDB());
    set({ discovered: {}, games: [], daily: [], achievements: [], recents: [] });
  },
}));
