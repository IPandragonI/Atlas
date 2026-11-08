import { DATASET_VERSION, RULES_VERSION } from "@/data/version";
import { REGION_DEFS } from "@/data/regions";
import { configureRegionSea, generateChallenge, type GenContext, type GenRequest, type Generated } from "@/engine/generator/generator";
import type { HistoryEntry } from "@/engine/generator/diversity";
import { solve } from "@/engine/pathfinding";
import type { Challenge } from "@/engine/types";
import { graph } from "./atlas";

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
