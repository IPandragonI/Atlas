import type { AtlasGraph, GraphView } from "./graph/graph";
import { bfsDistances } from "./graph/bfs";
import { routeSatisfies } from "./rules";

export { bfsDistances };
import type { Challenge } from "./types";

/** Number of distinct shortest routes between two countries (no route-level constraints). */
export function countShortestRoutes(graph: AtlasGraph, start: string, goal: string, view: GraphView): number {
  const dist = new Map<string, number>([[start, 0]]);
  const count = new Map<string, number>([[start, 1]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const d = dist.get(cur)!;
    for (const n of graph.neighbors(cur, view)) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        count.set(n, 0);
        queue.push(n);
      }
      if (dist.get(n) === d + 1) count.set(n, count.get(n)! + count.get(cur)!);
    }
  }
  return count.get(goal) ?? 0;
}

export interface SolveOptions {
  /** Extra hops beyond the optimum to include when listing alternatives. */
  slack?: number;
  maxRoutes?: number;
  /** Hard cap on route length in hops. */
  maxHops?: number;
  /** DFS expansion budget. */
  budget?: number;
}

export interface Solution {
  feasible: boolean;
  /** Minimum number of intermediate countries (hops - 1). -1 if infeasible. */
  minIntermediate: number;
  /** Complete routes, sorted by length then lexicographically. Optimal ones come first. */
  routes: string[][];
  optimalCount: number;
  truncated: boolean;
}

type SolveTarget = Pick<Challenge, "start" | "destination" | "rules">;

/**
 * Finds the shortest valid routes (and near-optimal alternatives) under every rule.
 * It is an iterative-deepening enumeration of loopless paths pruned by the exact BFS
 * distance-to-goal, i.e. a k-shortest-loopless-paths search ordered by length. It handles
 * route-level constraints (mandatory countries, coastal minimums...) that plain BFS or Yen's
 * algorithm cannot express, and supports a fixed `prefix` for mid-game queries.
 */
export function solve(graph: AtlasGraph, ch: SolveTarget, prefix?: readonly string[], opts: SolveOptions = {}): Solution {
  const { slack = 2, maxRoutes = 80, maxHops = 18, budget = 400_000 } = opts;
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  const toGoal = bfsDistances(graph, ch.destination, view);
  const base = prefix && prefix.length > 0 ? [...prefix] : [ch.start];
  const last = base[base.length - 1];
  const empty: Solution = { feasible: false, minIntermediate: -1, routes: [], optimalCount: 0, truncated: false };
  const d0 = toGoal.get(last);
  if (d0 === undefined) return empty;

  const baseEdges = base.length - 1;
  const routes: string[][] = [];
  let minHops = -1;
  let optimalCount = 0;
  let truncated = false;
  let spent = 0;

  for (let L = baseEdges + d0; L <= maxHops; L++) {
    if (minHops !== -1 && L > minHops + slack) break;
    const found: string[][] = [];
    const visited = new Set(base);
    const path = [...base];

    const dfs = (node: string): void => {
      if (found.length + routes.length >= maxRoutes || spent > budget) {
        truncated = true;
        return;
      }
      spent++;
      const edges = path.length - 1;
      if (node === ch.destination) {
        if (edges === L && routeSatisfies(graph, path, ch.rules)) found.push([...path]);
        return;
      }
      for (const n of graph.neighbors(node, view)) {
        if (visited.has(n)) continue;
        const dn = toGoal.get(n);
        if (dn === undefined || edges + 1 + dn > L) continue;
        visited.add(n);
        path.push(n);
        dfs(n);
        path.pop();
        visited.delete(n);
      }
    };
    if (last === ch.destination) {
      if (baseEdges === L && routeSatisfies(graph, base, ch.rules)) found.push([...base]);
    } else dfs(last);

    if (found.length > 0) {
      found.sort((a, b) => a.join().localeCompare(b.join()));
      if (minHops === -1) {
        minHops = L;
        optimalCount = found.length;
      }
      routes.push(...found);
    }
    if (truncated) break;
  }
  if (minHops === -1) return { ...empty, truncated };
  return { feasible: true, minIntermediate: minHops - 1, routes, optimalCount, truncated };
}

/** Next countries lying on an optimal completion of the current partial route. */
export function optimalContinuations(graph: AtlasGraph, ch: SolveTarget, route: readonly string[]): string[] {
  const sol = solve(graph, ch, route, { slack: 0, maxRoutes: 200 });
  const out = new Set<string>();
  for (const r of sol.routes.slice(0, sol.optimalCount)) if (r.length > route.length) out.add(r[route.length]);
  return [...out].sort();
}
