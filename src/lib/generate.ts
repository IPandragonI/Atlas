import { DATASET_VERSION, RULES_VERSION } from "@/data/version";
import { REGION_DEFS } from "@/data/regions";
import { configureRegionSea, generateChallenge, scopeInfo, type GenContext, type GenRequest, type Generated, type ScopeInfo } from "@/engine/generator/generator";
import type { HistoryEntry } from "@/engine/generator/diversity";
import { solve } from "@/engine/pathfinding";
import type { Challenge } from "@/engine/types";
import { graph } from "./atlas";
import { genRequestFor, type GameConfig } from "./config";

configureRegionSea(REGION_DEFS);

export function makeContext(history: readonly HistoryEntry[] = []): GenContext {
  return {
    graph,
    history,
    datasetVersion: DATASET_VERSION,
    rulesVersion: RULES_VERSION,
    constraintRegions: REGION_DEFS.map((r) => r.id),
  };
}

export function generate(req: GenRequest, history: readonly HistoryEntry[] = []): Generated | null {
  return generateChallenge(makeContext(history), req);
}

export function historyEntry(ch: Challenge, route: string[]): HistoryEntry {
  return { mode: ch.mode, start: ch.start, destination: ch.destination, route };
}

/** Re-checks that a stored challenge is solvable and that its recorded minimum is still correct. */
export function validateChallenge(ch: Challenge): boolean {
  const sol = solve(graph, ch);
  return sol.feasible && sol.minIntermediate === ch.minIntermediate;
}

/** Free-play helper: retries with derived seeds so a rare unlucky draw never reaches the player. */
export function generateWithRetry(req: GenRequest, history: readonly HistoryEntry[] = [], attempts = 6): Generated | null {
  for (let i = 0; i < attempts; i++) {
    const g = generate({ ...req, seed: i === 0 ? req.seed : `${req.seed}#${i}` }, history);
    if (g) return g;
  }
  return null;
}

/** Generates a challenge for a game configuration (same settings, any seed). `exclude` = pair to avoid when possible. */
export function generateForConfig(
  cfg: GameConfig,
  seed: string,
  history: readonly HistoryEntry[] = [],
  exclude?: readonly [string, string],
  candidates = 300,
): Generated | null {
  const first = generateWithRetry(genRequestFor(cfg, seed, exclude, candidates), history);
  // A very small scope can have a single possible start/destination pair: rather than failing a replay,
  // fall back to allowing it again (the seed still differs, and so can the constraints).
  return first ?? (exclude ? generateWithRetry(genRequestFor(cfg, seed, undefined, candidates), history) : null);
}

/** Size facts about the scope of a configuration (used to validate custom settings). */
export function scopeFacts(cfg: Pick<GameConfig, "mode" | "scope" | "forbidden">): ScopeInfo {
  return scopeInfo(makeContext(), cfg);
}

// ------------------------------------------------------------------ worker protocol

export interface WorkerRequest {
  id: number;
  req: GenRequest;
  history: HistoryEntry[];
  attempts: number;
  relaxExclude: boolean;
}
export type WorkerResponse = { id: number; result: Generated | null } | { id: number; error: string };

/** Pure: the same code runs inside the Web Worker and, as a fallback, on the main thread. */
export function handleGenerate(msg: WorkerRequest): { id: number; result: Generated | null } {
  const first = generateWithRetry(msg.req, msg.history, msg.attempts);
  // A very small scope can have a single possible start/destination pair: rather than failing a replay, allow it again.
  const result = first ?? (msg.relaxExclude && msg.req.exclude ? generateWithRetry({ ...msg.req, exclude: undefined }, msg.history, msg.attempts) : null);
  return { id: msg.id, result };
}
