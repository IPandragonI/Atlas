"use client";

import { create } from "zustand";
import { createGame, giveUp as engineGiveUp, submitGuess, useHint as engineHint } from "@/engine/game";
import { solve, type Solution } from "@/engine/pathfinding";
import { buildResult, computeScore } from "@/engine/scoring";
import type { Challenge, GameResult, GameState, HintKind, HintRecord, MoveOutcome } from "@/engine/types";
import { graph } from "@/lib/atlas";
import { historyEntry } from "@/lib/generate";
import type { GameConfig } from "@/lib/config";
import type { GameRecord } from "@/lib/db";
import { useProgress } from "./progress";

export interface Feedback {
  outcome: MoveOutcome;
  country: string;
  n: number; // monotonic counter so identical consecutive outcomes still re-trigger animations
}

interface GameStore {
  challenge: Challenge | null;
  /** Configuration the current game was started with (null for restored dailies: derive it from the challenge). */
  config: GameConfig | null;
  state: GameState | null;
  result: GameResult | null;
  solution: Solution | null;
  /** Countries discovered for the first time during this game. */
  fresh: string[];
  newAchievements: string[];
  feedback: Feedback | null;
  lastHint: HintRecord | null;
  start: (ch: Challenge, config?: GameConfig) => void;
  /** Re-displays a finished game (e.g. an already completed daily) without starting a new attempt. */
  restore: (ch: Challenge, rec: GameRecord) => void;
  guess: (countryId: string) => MoveOutcome;
  /** Returns true when a hint was given (and its penalty applied). */
  hint: (kind: HintKind) => boolean;
  giveUp: () => void;
  clear: () => void;
}

let counter = 0;
/** Discoveries being written to IndexedDB: a finished game waits for them before publishing its results. */
const pendingWrites = new Set<Promise<unknown>>();

export const useGame = create<GameStore>((set, get) => {
  /**
   * Finalises a finished game: result, alternative routes, persistence.
   * Everything is saved BEFORE the results are published, so the moment the player sees the results screen (and can
   * navigate away or reload) the completed game, its discoveries and any daily completion are already stored.
   */
  const finish = async (ch: Challenge, state: GameState) => {
    const result = buildResult(state, ch.minIntermediate);
    const solution = solve(graph, ch, undefined, { slack: 2, maxRoutes: 40 });
    const optimalRoute = solution.routes[0] ?? state.route;
    await Promise.allSettled([...pendingWrites]);
    let newAchievements: string[] = [];
    try {
      newAchievements = await useProgress.getState().finishGame(
        {
          challengeId: ch.id, mode: ch.mode, difficulty: ch.difficulty, daily: ch.date, status: result.status, score: result.score.total,
          intermediates: result.intermediates, minIntermediate: result.minIntermediate, optimal: result.optimal, mistakes: result.mistakes,
          hints: result.hintsUsed.length, hintKinds: result.hintsUsed, destination: ch.destination, durationMs: result.durationMs, route: state.route, finishedAt: state.endedAt ?? Date.now(),
        },
        historyEntry(ch, optimalRoute),
      );
    } catch {
      /* storage unavailable: the game is still playable and the results are shown */
    }
    set({ result, solution, newAchievements });
  };

  return {
    challenge: null,
    config: null,
    state: null,
    result: null,
    solution: null,
    fresh: [],
    newAchievements: [],
    feedback: null,
    lastHint: null,

    start: (ch, config) =>
      set({ challenge: ch, config: config ?? null, state: createGame(ch, Date.now()), result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null }),

    restore: (ch, rec) => {
      const won = rec.status === "won";
      const hintsUsed = (rec.hintKinds ?? []).filter((k): k is HintKind => k === "letter" || k === "borders");
      const state: GameState = {
        challengeId: ch.id, route: rec.route, attemptsTotal: ch.attempts, attemptsLeft: Math.max(0, ch.attempts - rec.mistakes),
        mistakes: [], hints: [], status: rec.status, startedAt: rec.finishedAt - rec.durationMs, endedAt: rec.finishedAt,
      };
      const result: GameResult = {
        challengeId: ch.id, status: rec.status, route: rec.route, intermediates: rec.intermediates, minIntermediate: ch.minIntermediate,
        optimal: rec.optimal, mistakes: rec.mistakes, hintsUsed,
        score: { ...computeScore({ victory: won, optimal: rec.optimal, mistakes: rec.mistakes, hints: hintsUsed }), total: rec.score },
        durationMs: rec.durationMs,
      };
      set({ challenge: ch, config: null, state, result, solution: solve(graph, ch, undefined, { slack: 2, maxRoutes: 40 }), fresh: [], newAchievements: [], feedback: null, lastHint: null });
    },

    guess: (countryId) => {
      const { challenge, state } = get();
      if (!challenge || !state) return "ignored";
      const { state: next, outcome } = submitGuess(graph, challenge, state, countryId, Date.now());
      set({ state: next, feedback: { outcome, country: countryId, n: ++counter } });
      if (outcome === "accepted" || outcome === "won") {
        // Discovery is immediate and survives a later defeat.
        const write = useProgress.getState().discover(countryId).then((isNew) => {
          if (isNew) set((s) => ({ fresh: [...s.fresh, countryId] }));
        });
        pendingWrites.add(write);
        void write.finally(() => pendingWrites.delete(write));
      }
      if (outcome === "won" || outcome === "lost") void finish(challenge, next);
      return outcome;
    },

    hint: (kind) => {
      const { challenge, state } = get();
      if (!challenge || !state) return false;
      const res = engineHint(graph, challenge, state, kind);
      if (!res) return false;
      set({ state: res.state, lastHint: res.hint });
      return true;
    },

    giveUp: () => {
      const { challenge, state } = get();
      if (!challenge || !state || state.status !== "playing") return;
      const next = engineGiveUp(state, Date.now());
      set({ state: next });
      void finish(challenge, next);
    },

    clear: () => set({ challenge: null, config: null, state: null, result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null }),
  };
});
