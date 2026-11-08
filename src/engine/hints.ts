import type { AtlasGraph } from "./graph/graph";
import { optimalContinuations } from "./pathfinding";
import { hashString } from "./rng";
import { nextMoves } from "./rules";
import { HINT_PENALTY } from "./scoring";
import type { Challenge, HintKind, HintPayload, HintRecord } from "./types";

export { HINT_PENALTY };

/** Hints must be used in this order; each can be used once per game. */
export const HINT_ORDER: readonly HintKind[] = ["letter", "borders"];

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
 * Countries a hint may point to. They come from the real solver and the real move rules:
 * the optimal continuations of the CURRENT partial route (so each one belongs to at least one valid solution under
 * every active constraint), intersected with the currently valid moves. If the player is off every optimal route,
 * any valid move that can still be completed is used; if nothing can be determined the list is empty and no hint
 * is given (and no penalty applied).
 */
export function hintCandidates(graph: AtlasGraph, ch: Challenge, route: readonly string[]): string[] {
  const valid = new Set(nextMoves(graph, ch, route));
  const optimal = optimalContinuations(graph, ch, route).filter((id) => valid.has(id));
  return (optimal.length > 0 ? optimal : []).sort();
}

/**
 * Deterministic hint: the same game state always yields the same country.
 * The borders hint reuses the country of the letter hint when it is still a valid continuation, so both hints
 * describe the same country; otherwise it picks deterministically among the current candidates.
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
  const pick = (salt: string) => candidates[hashString(`${ch.id}|${route.join(">")}|${salt}`) % candidates.length];
  const letterHint = previous.find((h) => h.payload.kind === "letter");
  const reuse = letterHint && candidates.includes(letterHint.payload.countryId) ? letterHint.payload.countryId : null;
  const countryId = kind === "borders" ? (reuse ?? pick("borders")) : pick("letter");
  if (kind === "borders") return { kind, countryId };
  const c = graph.country(countryId);
  return {
    kind,
    countryId,
    letter: { fr: stripAccents(c.name.fr).charAt(0).toUpperCase(), en: stripAccents(c.name.en).charAt(0).toUpperCase() },
  };
}
