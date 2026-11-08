import type { AtlasGraph } from "./graph/graph";
import { optimalContinuations } from "./pathfinding";
import { hashString } from "./rng";
import { nextMoves } from "./rules";
import { HINT_PENALTY } from "./scoring";
import type { Challenge, HintKind, HintPayload } from "./types";

export { HINT_PENALTY };

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Hints are derived from the CURRENTLY valid continuations (all optimal ones when they exist,
 * otherwise every valid next move), never from a single hidden "answer". The choice among several
 * candidates is deterministic for a given challenge, route and hint kind.
 */
export function hintCandidates(graph: AtlasGraph, ch: Challenge, route: readonly string[]): string[] {
  const valid = new Set(nextMoves(graph, ch, route));
  const optimal = optimalContinuations(graph, ch, route).filter((id) => valid.has(id));
  const list = optimal.length > 0 ? optimal : [...valid];
  return list.sort();
}

export function createHint(graph: AtlasGraph, ch: Challenge, route: readonly string[], kind: HintKind): HintPayload | null {
  const candidates = hintCandidates(graph, ch, route);
  if (candidates.length === 0) return null;
  const idx = hashString(`${ch.id}|${route.join(">")}|${kind}`) % candidates.length;
  const c = graph.country(candidates[idx]);
  switch (kind) {
    case "geographic":
      return { kind, region: c.region, continent: c.continent };
    case "connectivity":
      return { kind, borders: graph.landDegree(c.id) };
    case "discovery":
      return {
        kind,
        letter: {
          fr: stripAccents(c.name.fr).charAt(0).toUpperCase(),
          en: stripAccents(c.name.en).charAt(0).toUpperCase(),
        },
      };
  }
}
