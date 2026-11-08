import type { AtlasGraph } from "./graph/graph";
import { bfsDistances } from "./graph/bfs";
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
    // the link must be usable under THIS challenge's options (land always; sea / strait / dispute only when enabled)
    if (i > 0 && !graph.neighbors(route[i - 1], view).includes(id)) return false;
  }
  return routeSatisfies(graph, route, ch.rules);
}

/**
 * Countries that extend the CURRENT end of the route right now: adjacent under the active connection rules, unused,
 * not forbidden, inside the region, within the intermediate budget. The destination is never a move: it only decides
 * victory (see {@link reachesDestination}). Used by the hint engine; the autocomplete UI deliberately does NOT use it.
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
 * At least one country must have been entered: a start that already touches the destination never wins by itself.
 */
export function reachesDestination(graph: AtlasGraph, ch: Challenge, route: readonly string[]): boolean {
  if (route.length < 2) return false;
  const current = route[route.length - 1];
  if (current === ch.destination) return false;
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  if (!graph.neighbors(current, view).includes(ch.destination)) return false;
  return routeSatisfies(graph, [...route, ch.destination], ch.rules);
}

/** True when the departure country is already connected to the destination under the active rules. */
export function startTouchesDestination(graph: AtlasGraph, ch: Pick<Challenge, "start" | "destination" | "rules">): boolean {
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  return graph.neighbors(ch.start, view).includes(ch.destination);
}

export interface MoveResolution {
  valid: boolean;
  /**
   * Index in the current route of the country the new one connects to. `route.length - 1` is a plain extension of
   * the route; a smaller index is a change of direction: everything after that index leaves the active route.
   */
  from: number;
}

/**
 * Single source of truth for accepting a guess; the reason for a rejection is never exposed.
 *  - Plain extension: adjacent to the last country of the route (any valid neighbour, as before).
 *  - Change of direction: adjacent to an EARLIER country of the route AND strictly closer to the destination than that
 *    country (shortest-path distance in the active graph). The latest such connection point is used.
 * Forbidden / out-of-region / used countries and the intermediate budget apply to the NEW route, and a change of
 * direction may not drop a mandatory country from the route: it can never be used to bypass a constraint.
 */
export function resolveMove(graph: AtlasGraph, ch: Challenge, route: readonly string[], guess: string): MoveResolution {
  const no: MoveResolution = { valid: false, from: -1 };
  if (!graph.has(guess) || guess === ch.start || guess === ch.destination || route.includes(guess)) return no;
  const view = graph.viewFor(ch.rules, [ch.start, ch.destination]);
  if (view.blocked.has(guess) || (view.allowed && !view.allowed.has(guess))) return no;
  const max = ch.rules.maxIntermediate;
  const touching = new Set(graph.neighbors(guess, view));
  const last = route.length - 1;
  // A plain extension wins when it is allowed. When the country touches the last one but the budget is already full, the
  // move is NOT rejected yet: a change of direction from an earlier country (a shorter new route) may still be valid.
  if (touching.has(route[last]) && (max === undefined || route.length <= max)) return { valid: true, from: last };

  const toGoal = bfsDistances(graph, ch.destination, view);
  const dGuess = toGoal.get(guess);
  if (dGuess === undefined) return no;
  for (let i = last - 1; i >= 0; i--) {
    if (!touching.has(route[i])) continue;
    const dHere = toGoal.get(route[i]);
    if (dHere === undefined || dGuess >= dHere) continue; // must be real progress towards the destination
    if (max !== undefined && i + 1 > max) continue; // the new route would have too many intermediates
    // A change of direction can never be used to drop a mandatory country: it would leave the player on a route that
    // cannot be completed (the abandoned country cannot be re-entered). Such a guess is an ordinary wrong answer.
    if (ch.rules.mandatory.length > 0 && route.slice(i + 1).some((id) => ch.rules.mandatory.includes(id))) continue;
    return { valid: true, from: i };
  }
  return no;
}

export type MoveValidation = MoveResolution;

/** Validation of a guess (see {@link resolveMove}). */
export function validateMove(graph: AtlasGraph, ch: Challenge, route: readonly string[], guess: string): MoveValidation {
  return resolveMove(graph, ch, route, guess);
}
