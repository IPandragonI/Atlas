import type { AtlasGraph } from "./graph/graph";
import { solve } from "./pathfinding";
import { hashString } from "./rng";
import { resolveMove } from "./rules";
import { HINT_PENALTY } from "./scoring";
import type { Challenge, HintKind, HintPayload, HintRecord } from "./types";

export { HINT_PENALTY };

/** Hints must be used in this order; each can be used once per game. */
export const HINT_ORDER: readonly HintKind[] = ["letter", "borders", "reveal"];

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

export type HintStatus = "available" | "locked" | "used";

/** Availability of a hint given the hints already used in this game. */
export function hintStatus(used: readonly HintRecord[], kind: HintKind): HintStatus {
  if (used.some((h) => h.payload.kind === kind)) return "used";
  const idx = HINT_ORDER.indexOf(kind);
  for (const earlier of HINT_ORDER.slice(0, idx)) if (!used.some((h) => h.payload.kind === earlier)) return "locked";
  return "available";
}

/**
 * Countries a hint may point to. They come from the real solver and the real move rules, never from a separate model:
 *  - the best completions of a PREFIX of the active route (so each candidate belongs to a valid solution under every
 *    active constraint: forbidden, mandatory, region, intermediate budget...);
 *  - and only countries the player could enter RIGHT NOW (`resolveMove`), which includes changing direction.
 * The longest prefix is tried first (the usual case: continue from where you are). When the current branch can no longer
 * lead anywhere (or cannot be completed under the constraints), earlier prefixes are tried, which yields a country the
 * player reaches by changing direction. The destination is never a candidate. Empty when nothing can be determined.
 */
export function hintCandidates(graph: AtlasGraph, ch: Challenge, route: readonly string[]): string[] {
  for (let end = route.length; end >= 1; end--) {
    const prefix = route.slice(0, end);
    const sol = solve(graph, ch, prefix, { slack: 2, maxRoutes: 300 });
    if (!sol.feasible) continue;
    // routes are sorted by length: keep the continuations of the SHORTEST routes whose next country is a playable move
    let bestLength = Number.POSITIVE_INFINITY;
    const out = new Set<string>();
    for (const r of sol.routes) {
      if (r.length > bestLength) break;
      const next = r[prefix.length];
      if (next === undefined || next === ch.destination) continue;
      if (!resolveMove(graph, ch, route, next).valid) continue;
      bestLength = r.length;
      out.add(next);
    }
    if (out.size > 0) return [...out].sort();
  }
  return [];
}

/**
 * Deterministic hint: the same game state always yields the same country.
 * The three hints of a game describe the SAME country while it remains a valid candidate (letter, then its borders, then
 * its name); otherwise a candidate is picked deterministically.
 */
export function createHint(
  graph: AtlasGraph,
  ch: Challenge,
  route: readonly string[],
  kind: HintKind,
  previous: readonly HintRecord[] = [],
): HintPayload | null {
  const candidates = hintCandidates(graph, ch, route);
  if (candidates.length === 0) return null;
  const earlier = [...previous].reverse().find((h) => candidates.includes(h.payload.countryId));
  const pickId = earlier?.payload.countryId ?? candidates[hashString(`${ch.id}|${route.join(">")}|${kind}`) % candidates.length];
  if (kind === "borders" || kind === "reveal") return { kind, countryId: pickId };
  return { kind, countryId: pickId, letter: hintLetter(graph, pickId) };
}

/** First letter of a country name in each language (accents removed): what hint 1 shows on the map. */
export function hintLetter(graph: AtlasGraph, countryId: string): { fr: string; en: string } {
  const c = graph.country(countryId);
  return { fr: stripAccents(c.name.fr).charAt(0).toUpperCase(), en: stripAccents(c.name.en).charAt(0).toUpperCase() };
}

/**
 * Whether a hint still says something true about the CURRENT active route:
 *  - "live": the hinted country is still a move the player can make right now;
 *  - "followed": the player has entered it (it is on the active route or in the discovery history);
 *  - "outdated": the route changed (for example after a change of direction) and the country is no longer a valid move.
 * An outdated hint is never presented as guidance. Its penalty stays (it was paid for), and a hint is still once per game.
 */
export type HintLiveness = "live" | "followed" | "outdated";
export function hintLiveness(graph: AtlasGraph, ch: Challenge, route: readonly string[], visited: readonly string[], hint: HintRecord): HintLiveness {
  const id = hint.payload.countryId;
  if (route.includes(id) || visited.includes(id)) return "followed";
  return resolveMove(graph, ch, route, id).valid ? "live" : "outdated";
}
