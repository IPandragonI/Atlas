import type { AtlasGraph, GraphView } from "./graph";

/** BFS hop distances from `source` (unweighted shortest paths) in the given traversal view. */
export function bfsDistances(graph: AtlasGraph, source: string, view: GraphView): Map<string, number> {
  const dist = new Map<string, number>([[source, 0]]);
  const queue = [source];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const d = dist.get(cur)!;
    for (const n of graph.neighbors(cur, view)) {
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
  }
  return dist;
}
