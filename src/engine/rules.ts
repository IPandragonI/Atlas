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
 * Countries that are valid next moves right now: adjacent under the active connection rules, unused,
 * not forbidden, inside the region, within the intermediate budget. The destination is NEVER a move:
 * it is only used internally to decide victory (see {@link reachesDestination}).
 * Engine/hints only: the autocomplete UI deliberately does NOT use this (it would leak geography).
 */
export function nextMoves(graph: AtlasGraph, ch: Challenge, route: readonly string[]): string[] {
  const current = route[route.length - 1];
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  const used = new Set(route);
  const moves = graph.neighbors(current, view).filter((id) => !used.has(id) && id !== ch.start && id !== ch.destination);
  const max = ch.rules.maxIntermediate;
  // every accepted move adds one intermediate country
  return max === undefined || route.length <= max ? moves : [];
}

/**
 * Victory test, run after each accepted move: the current country must connect to the destination under
 * the active connection rules AND the completed route (route + destination) must satisfy every route-level
 * constraint. Otherwise the game simply continues (which constraint is missing is never revealed).
 */
export function reachesDestination(graph: AtlasGraph, ch: Challenge, route: readonly string[]): boolean {
  const current = route[route.length - 1];
  if (current === ch.destination) return false;
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  if (!graph.neighbors(current, view).includes(ch.destination)) return false;
  return routeSatisfies(graph, [...route, ch.destination], ch.rules);
}

export interface MoveValidation {
  valid: boolean;
}

/** Single source of truth for accepting a guess. The reason for rejection is never exposed. */
export function validateMove(graph: AtlasGraph, ch: Challenge, route: readonly string[], guess: string): MoveValidation {
  if (!graph.has(guess)) return { valid: false };
  return { valid: nextMoves(graph, ch, route).includes(guess) };
}
