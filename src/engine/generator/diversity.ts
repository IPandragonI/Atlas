import type { AtlasGraph } from "../graph/graph";
import type { GameMode } from "../types";

/** One previously served challenge, reduced to what diversity scoring needs. */
export interface HistoryEntry {
  mode: GameMode;
  start: string;
  destination: string;
  /** A representative optimal route (start ... destination). */
  route: string[];
}

export interface DiversityWeights {
  /** Number of most recent challenges considered. */
  window: number;
  start: number;
  destination: number;
  intermediate: number;
  continent: number;
  region: number;
  corridor: number;
  sequence: number;
  /** Appeal terms (positive). */
  alternatives: number;
  variety: number;
  islandCoastal: number;
  /** Random jitter amplitude so equal candidates do not always tie-break identically. */
  jitter: number;
}

export const DEFAULT_WEIGHTS: DiversityWeights = {
  window: 40,
  start: 3,
  destination: 3,
  intermediate: 2.5,
  continent: 0.8,
  region: 0.8,
  corridor: 5,
  sequence: 6,
  alternatives: 0.6,
  variety: 2.0,
  islandCoastal: 0.5,
  jitter: 0.4,
};

/** Linear recency: the latest challenge weighs 1, the oldest of the window ~0.1. */
function recency(i: number, n: number): number {
  return n <= 1 ? 1 : 0.1 + 0.9 * (i / (n - 1));
}

export interface Candidate {
  start: string;
  destination: string;
  route: string[];
  optimalRoutes: number;
}

export interface ScoreDetail {
  appeal: number;
  penalty: number;
  total: number;
}

/**
 * Candidate score = appeal - repetition penalty. Penalties use a sliding window with recency decay.
 * Intermediate (connector) penalties are square-root dampened and weakly weighted, so natural hubs
 * such as Germany are discouraged when overused but never excluded.
 */
export function scoreCandidate(graph: AtlasGraph, history: readonly HistoryEntry[], cand: Candidate, w: DiversityWeights, jitter = 0): ScoreDetail {
  const win = history.slice(-w.window);
  const n = win.length;
  const mid = cand.route.slice(1, -1);
  const countries = cand.route.map((id) => graph.country(id));

  // --- appeal
  const regions = new Set(countries.map((c) => c.region));
  const variety = cand.route.length > 1 ? (regions.size - 1) / (cand.route.length - 1) : 0;
  const flavoured = mid.length === 0 ? 0 : mid.filter((id) => graph.country(id).isIsland || !graph.country(id).isCoastal).length / mid.length;
  const appeal =
    w.alternatives * Math.log2(1 + cand.optimalRoutes) + w.variety * variety + w.islandCoastal * flavoured + jitter * w.jitter;

  // --- penalty
  let startF = 0, destF = 0, contF = 0, regF = 0, corrF = 0, seqF = 0;
  const interF = new Map<string, number>();
  const edges = new Set<string>();
  for (let i = 0; i + 1 < cand.route.length; i++) edges.add(pairKey(cand.route[i], cand.route[i + 1]));
  const triples = new Set<string>();
  for (let i = 0; i + 2 < cand.route.length; i++) triples.add(cand.route.slice(i, i + 3).join(">"));
  const cc = new Set([graph.country(cand.start).continent, graph.country(cand.destination).continent]);
  const rr = new Set([graph.country(cand.start).region, graph.country(cand.destination).region]);

  win.forEach((h, i) => {
    const r = recency(i, n);
    if (h.start === cand.start || h.destination === cand.start) startF += r;
    if (h.start === cand.destination || h.destination === cand.destination) destF += r;
    for (const id of h.route.slice(1, -1)) if (mid.includes(id)) interF.set(id, (interF.get(id) ?? 0) + r);
    const hc = [graph.country(h.start).continent, graph.country(h.destination).continent];
    const hr = [graph.country(h.start).region, graph.country(h.destination).region];
    if (hc.every((c) => cc.has(c)) && cc.size === new Set(hc).size) contF += r;
    if (hr.every((x) => rr.has(x)) && rr.size === new Set(hr).size) regF += r;
    let shared = 0;
    for (let k = 0; k + 1 < h.route.length; k++) if (edges.has(pairKey(h.route[k], h.route[k + 1]))) shared++;
    corrF += (shared / Math.max(1, edges.size)) * r;
    for (let k = 0; k + 2 < h.route.length; k++) if (triples.has(h.route.slice(k, k + 3).join(">"))) seqF += r;
  });
  const interAvg = mid.length ? [...interF.values()].reduce((s, v) => s + Math.sqrt(v), 0) / mid.length : 0;
  const penalty =
    w.start * startF + w.destination * destF + w.intermediate * interAvg + w.continent * contF + w.region * regF + w.corridor * corrF + w.sequence * seqF;
  return { appeal, penalty, total: appeal - penalty };
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
