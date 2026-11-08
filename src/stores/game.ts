"use client";

import { create } from "zustand";
import { createGame, giveUp as engineGiveUp, submitGuess, useHint as engineHint } from "@/engine/game";
import { solve, type Solution } from "@/engine/pathfinding";
import { buildResult } from "@/engine/scoring";
import type { Challenge, GameResult, GameState, HintKind, HintRecord, MoveOutcome } from "@/engine/types";
import { graph } from "@/lib/atlas";
import { historyEntry } from "@/lib/generate";
import { useProgress } from "./progress";

export interface Feedback {
  outcome: MoveOutcome;
  country: string;
  n: number; // monotonic counter so identical consecutive outcomes still re-trigger animations
}

interface GameStore {
  challenge: Challenge | null;
  state: GameState | null;
  result: GameResult | null;
  solution: Solution | null;
  /** Countries discovered for the first time during this game. */
  fresh: string[];
  newAchievements: string[];
  feedback: Feedback | null;
  lastHint: HintRecord | null;
  start: (ch: Challenge) => void;
  guess: (countryId: string) => MoveOutcome;
  hint: (kind: HintKind) => void;
  giveUp: () => void;
  clear: () => void;
}

let counter = 0;

export const useGame = create<GameStore>((set, get) => {
  /** Finalises a finished game: result, alternative routes, persistence. */
  const finish = (ch: Challenge, state: GameState) => {
    const result = buildResult(state, ch.minIntermediate);
    const solution = solve(graph, ch, undefined, { slack: 2, maxRoutes: 40 });
    set({ result, solution });
    const optimalRoute = solution.routes[0] ?? state.route;
    void useProgress
      .getState()
      .finishGame(
        {
          challengeId: ch.id, mode: ch.mode, difficulty: ch.difficulty, daily: ch.date, status: result.status, score: result.score.total,
          intermediates: result.intermediates, minIntermediate: result.minIntermediate, optimal: result.optimal, mistakes: result.mistakes,
          hints: result.hintsUsed.length, durationMs: result.durationMs, route: state.route, finishedAt: state.endedAt ?? Date.now(),
        },
        historyEntry(ch, optimalRoute),
      )
      .then((ids) => set({ newAchievements: ids }));
  };

  return {
    challenge: null,
    state: null,
    result: null,
    solution: null,
    fresh: [],
    newAchievements: [],
    feedback: null,
    lastHint: null,

    start: (ch) =>
      set({ challenge: ch, state: createGame(ch, Date.now()), result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null }),

    guess: (countryId) => {
      const { challenge, state } = get();
      if (!challenge || !state) return "ignored";
      const { state: next, outcome } = submitGuess(graph, challenge, state, countryId, Date.now());
      set({ state: next, feedback: { outcome, country: countryId, n: ++counter } });
      if (outcome === "accepted" || outcome === "won") {
        // Discovery is immediate and survives a later defeat.
        void useProgress.getState().discover(countryId).then((isNew) => {
          if (isNew) set((s) => ({ fresh: [...s.fresh, countryId] }));
        });
      }
      if (outcome === "won" || outcome === "lost") finish(challenge, next);
      return outcome;
    },

    hint: (kind) => {
      const { challenge, state } = get();
      if (!challenge || !state) return;
      const res = engineHint(graph, challenge, state, kind);
      if (res) set({ state: res.state, lastHint: res.hint });
    },

    giveUp: () => {
      const { challenge, state } = get();
      if (!challenge || !state || state.status !== "playing") return;
      const next = engineGiveUp(state, Date.now());
      set({ state: next });
      finish(challenge, next);
    },

    clear: () => set({ challenge: null, state: null, result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null }),
  };
});
