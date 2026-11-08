import type { MapAppearance } from "./config";

export interface MapVisibility {
  /** When true, only the `shown` countries are drawn; everything else is invisible (shapes, borders, names). */
  masked: boolean;
  /** Countries drawn while masked: the arrival, the departure (if enabled) and every country correctly entered. */
  shown: string[];
}

/**
 * Purely visual rule (never used by the engine, the graph or the generator). `appearance` comes from the game
 * configuration: Easy = full map, Normal / Hard = progressive discovery, Custom = whatever the player chose.
 *  - Full map: nothing is masked.
 *  - Progressive: hidden while playing, except the arrival country (always displayed), the departure country (unless the
 *    player disabled it) and each correctly entered country, which appears the moment it is validated.
 *    Wrong guesses are never drawn.
 *  - Finished game (win or loss): everything is revealed.
 * `route` is the engine route (start + entered countries; never the destination).
 */
export function computeVisibility(args: {
  appearance: MapAppearance;
  finished: boolean;
  route: readonly string[];
  start: string;
  destination: string;
}): MapVisibility {
  const masked = !args.appearance.full && !args.finished;
  if (!masked) return { masked, shown: [] };
  const shown = [args.destination, ...(args.appearance.start ? [args.start] : []), ...args.route.slice(1)];
  return { masked, shown: [...new Set(shown)] };
}
