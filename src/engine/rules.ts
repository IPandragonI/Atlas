import type { AtlasGraph } from "./graph/graph";
import type { Challenge, ChallengeRules } from "./types";

/** True when the rules contain constraints that depend on the whole route. */
export function hasRouteConstraints(r: ChallengeRules): boolean {
  return (
    r.mandatory.length > 0 ||
    r.minCoastal !== undefined ||
    r.minIsland !== undefined ||
    r.maxIntermediate !== undefined ||
    r.requireRegion !== undefined
  );
}

/**
 * Checks route-level constraints on a COMPLETE route (start ... destination).
 * Node-level rules (forbidden, avoided/allowed region, connection type) are enforced
 * by the graph view, not here.
 */
export function routeSatisfies(graph: AtlasGraph, route: readonly string[], rules: ChallengeRules): boolean {
  const mid = route.slice(1, -1);
  if (rules.maxIntermediate !== undefined && mid.length > rules.maxIntermediate) return false;
  for (const m of rules.mandatory) if (!route.includes(m)) return false;
  if (rules.minCoastal !== undefined && mid.filter((id) => graph.country(id).isCoastal).length < rules.minCoastal) return false;
  if (rules.minIsland !== undefined && mid.filter((id) => graph.country(id).isIsland).length < rules.minIsland) return false;
  if (rules.requireRegion) {
    const members = graph.regionMembers(rules.requireRegion);
    if (!mid.some((id) => members.has(id))) return false;
  }
  return true;
}

/** Complete validation of a finished route against a challenge (used by tests and replays). */
export function isValidRoute(graph: AtlasGraph, ch: Pick<Challenge, "start" | "destination" | "rules">, route: readonly string[]): boolean {
  if (route.length < 2 || route[0] !== ch.start || route[route.length - 1] !== ch.destination) return false;
  if (new Set(route).size !== route.length) return false;
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  for (let i = 0; i < route.length; i++) {
    const id = route[i];
    if (!graph.has(id) || view.blocked.has(id) || (view.allowed && !view.allowed.has(id))) return false;
    if (i > 0) {
      const t = graph.connection(route[i - 1], id);
      if (!t || (t === "sea" && !ch.rules.maritime)) return false;
    }
  }
  return routeSatisfies(graph, route, ch.rules);
}

/**
 * Countries the player may type right now (also drives autocomplete):
 * adjacent under the active connection rules, unused, not forbidden, inside the region.
 * The destination is listed whenever it is adjacent; whether finishing is allowed also depends
 * on route-level constraints, which are intentionally not revealed here.
 */
export function nextMoves(graph: AtlasGraph, ch: Challenge, route: readonly string[]): string[] {
  const current = route[route.length - 1];
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  const used = new Set(route);
  const moves = graph.neighbors(current, view).filter((id) => !used.has(id) && id !== ch.start);
  const intermediates = route.length - 1;
  const max = ch.rules.maxIntermediate;
  return moves.filter((id) => id === ch.destination || max === undefined || intermediates + 1 <= max);
}

export interface MoveValidation {
  valid: boolean;
  isDestination: boolean;
}

/** Single source of truth for accepting a guess. The reason for rejection is never exposed. */
export function validateMove(graph: AtlasGraph, ch: Challenge, route: readonly string[], guess: string): MoveValidation {
  if (!graph.has(guess)) return { valid: false, isDestination: false };
  if (!nextMoves(graph, ch, route).includes(guess)) return { valid: false, isDestination: false };
  if (guess === ch.destination) {
    const full = [...route, guess];
    return { valid: routeSatisfies(graph, full, ch.rules), isDestination: true };
  }
  return { valid: true, isDestination: false };
}
