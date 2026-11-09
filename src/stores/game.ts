"use client";

import { create } from "zustand";
import { createGame, giveUp as engineGiveUp, submitGuess, useHint as engineHint } from "@/engine/game";
import { solve, type Solution } from "@/engine/pathfinding";
import { buildResult, computeScore } from "@/engine/scoring";
import type { Challenge, GameResult, GameState, HintKind, HintRecord, MoveOutcome } from "@/engine/types";
import { graph } from "@/lib/atlas";
import { clearInProgress, getDB, loadInProgress, saveInProgress, type GameRecord, type InProgressRecord } from "@/lib/db";
import { historyEntry, validateChallenge } from "@/lib/generate";
import type { GameConfig } from "@/lib/config";
import { useProgress } from "./progress";

export interface Feedback {
  outcome: MoveOutcome;
  country: string;
  n: number; // monotonic counter so identical consecutive outcomes still re-trigger animations
  /** Countries that left the active route because the player changed direction (empty for a plain move). */
  removed: string[];
  /** Set when the move was made FOR the player by the "name" hint (the country was entered automatically). */
  via?: "hint";
}

interface GameStore {
  challenge: Challenge | null;
  /** Configuration the current game was started with (null for restored dailies: derive it from the challenge). */
  config: GameConfig | null;
  /** Identity of the game (its URL parameters): a reload of the same URL resumes the same game. */
  key: string | null;
  state: GameState | null;
  result: GameResult | null;
  solution: Solution | null;
  /** Countries discovered for the first time during this game. */
  fresh: string[];
  newAchievements: string[];
  feedback: Feedback | null;
  lastHint: HintRecord | null;
  start: (ch: Challenge, config?: GameConfig, key?: string) => void;
  /** Re-displays a finished game (e.g. an already completed daily) without starting a new attempt. */
  restore: (ch: Challenge, rec: GameRecord) => void;
  /** Finds the saved in-progress game for this URL key, if it is still valid. */
  findSaved: (key: string) => Promise<InProgressRecord | null>;
  /** Continues a saved in-progress game exactly where it was left. */
  resume: (rec: InProgressRecord) => void;
  guess: (countryId: string, via?: "hint") => MoveOutcome;
  /** Returns true when a hint was given (and its penalty applied). */
  hint: (kind: HintKind) => boolean;
  giveUp: () => void;
  clear: () => void;
}

let counter = 0;
/** Discoveries being written to IndexedDB: a finished game waits for them before publishing its results. */
const pendingWrites = new Set<Promise<unknown>>();
/** Serialises saves of the in-progress game so an older snapshot can never overwrite a newer one (or a clear). */
let saveChain: Promise<unknown> = Promise.resolve();

/** A saved game is only resumed when it is still coherent with the current dataset and rules. */
export function isResumable(rec: InProgressRecord | null): rec is InProgressRecord {
  if (!rec || rec.version !== 1) return false;
  const { challenge: ch, state } = rec;
  if (!ch || !state || state.status !== "playing" || state.challengeId !== ch.id) return false;
  const ids = [ch.start, ch.destination, ...state.route, ...(state.visited ?? []), ...state.mistakes];
  if (!ids.every((id) => typeof id === "string" && graph.has(id))) return false;
  if (state.route[0] !== ch.start || !Array.isArray(state.visited) || !Array.isArray(state.hints)) return false;
  return validateChallenge(ch);
}

export const useGame = create<GameStore>((set, get) => {
  const persist = () => {
    const { challenge, config, key, state } = get();
    if (!challenge || !state || !key || state.status !== "playing") return;
    const rec: InProgressRecord = { version: 1, key, challenge, config, state, elapsedMs: Date.now() - state.startedAt, savedAt: Date.now() };
    saveChain = saveChain.then(() => saveInProgress(getDB(), rec)).catch(() => undefined);
  };

  /**
   * Finalises a finished game: result, alternative routes, persistence.
   * Everything is saved BEFORE the results are published, so the moment the player sees the results screen (and can
   * navigate away or reload) the completed game, its discoveries and any daily completion are already stored,
   * and the in-progress save is gone.
   */
  const finish = async (ch: Challenge, state: GameState) => {
    const result = buildResult(state, ch.minIntermediate);
    const solution = solve(graph, ch, undefined, { slack: 2, maxRoutes: 40 });
    const optimalRoute = solution.routes[0] ?? state.route;
    await Promise.allSettled([...pendingWrites]);
    let newAchievements: string[] = [];
    try {
      await saveChain; // let any in-flight snapshot land, then remove it
      await clearInProgress(getDB());
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
    key: null,
    state: null,
    result: null,
    solution: null,
    fresh: [],
    newAchievements: [],
    feedback: null,
    lastHint: null,

    start: (ch, config, key) => {
      set({ challenge: ch, config: config ?? null, key: key ?? null, state: createGame(ch, Date.now()), result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null });
      persist(); // a reload before the first move resumes the very same challenge
    },

    restore: (ch, rec) => {
      const won = rec.status === "won";
      const hintsUsed = (rec.hintKinds ?? []).filter((k): k is HintKind => k === "letter" || k === "borders" || k === "reveal");
      const state: GameState = {
        challengeId: ch.id, route: rec.route, visited: rec.route.slice(1), attemptsTotal: ch.attempts, attemptsLeft: Math.max(0, ch.attempts - rec.mistakes),
        mistakes: [], hints: [], status: rec.status, startedAt: rec.finishedAt - rec.durationMs, endedAt: rec.finishedAt,
      };
      const result: GameResult = {
        challengeId: ch.id, status: rec.status, route: rec.route, intermediates: rec.intermediates, minIntermediate: ch.minIntermediate,
        optimal: rec.optimal, mistakes: rec.mistakes, hintsUsed,
        score: { ...computeScore({ victory: won, optimal: rec.optimal, mistakes: rec.mistakes, hints: hintsUsed }), total: rec.score },
        durationMs: rec.durationMs,
      };
      set({ challenge: ch, config: null, key: null, state, result, solution: solve(graph, ch, undefined, { slack: 2, maxRoutes: 40 }), fresh: [], newAchievements: [], feedback: null, lastHint: null });
    },

    findSaved: async (key) => {
      try {
        const rec = await loadInProgress(getDB());
        if (!rec || rec.key !== key) return null;
        if (isResumable(rec)) return rec;
        await clearInProgress(getDB()); // stale or incoherent save: drop it
      } catch {
        /* storage unavailable */
      }
      return null;
    },

    resume: (rec) => {
      set({
        challenge: rec.challenge,
        config: rec.config,
        key: rec.key,
        state: { ...rec.state, startedAt: Date.now() - rec.elapsedMs }, // the clock continues from where it stopped
        result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null,
      });
    },

    guess: (countryId, via) => {
      const { challenge, state } = get();
      if (!challenge || !state) return "ignored";
      const { state: next, outcome, removed } = submitGuess(graph, challenge, state, countryId, Date.now());
      set({ state: next, feedback: { outcome, country: countryId, n: ++counter, removed: removed ?? [], ...(via ? { via } : {}) } });
      if (outcome === "accepted" || outcome === "won") {
        // Discovery is immediate and survives a later defeat (and an abandoned branch).
        const write = useProgress.getState().discover(countryId).then((isNew) => {
          if (isNew) set((s) => ({ fresh: [...s.fresh, countryId] }));
        });
        pendingWrites.add(write);
        void write.finally(() => pendingWrites.delete(write));
      }
      if (outcome === "won" || outcome === "lost") void finish(challenge, next);
      else if (outcome !== "ignored" && outcome !== "repeated") persist();
      return outcome;
    },

    hint: (kind) => {
      const { challenge, state } = get();
      if (!challenge || !state) return false;
      const res = engineHint(graph, challenge, state, kind);
      if (!res) return false;
      set({ state: res.state, lastHint: res.hint });
      persist();
      // The third hint (the name) does not just point at the country: it ENTERS it. The penalty is already applied above; the country is
      // a valid next move by construction, so it goes through the normal move rules (route, discovery, branching, victory).
      if (kind === "reveal") get().guess(res.hint.payload.countryId, "hint");
      return true;
    },

    giveUp: () => {
      const { challenge, state } = get();
      if (!challenge || !state || state.status !== "playing") return;
      const next = engineGiveUp(state, Date.now());
      set({ state: next });
      void finish(challenge, next);
    },

    /** Leaves the game screen. The in-progress save is intentionally kept: it is what "resume" reads. */
    clear: () => set({ challenge: null, config: null, key: null, state: null, result: null, solution: null, fresh: [], newAchievements: [], feedback: null, lastHint: null }),
  };
});
