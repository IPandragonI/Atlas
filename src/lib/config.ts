import { CONTINENT_IDS, REGION_DEFS } from "@/data/regions";
import type { GenRequest } from "@/engine/generator/generator";
import type { Challenge, ChallengeDifficulty, Difficulty, GameMode } from "@/engine/types";
import { graph } from "./atlas";

/** How much of the map is shown. Only relevant for gameplay *presentation*: never read by the engine or the graph. */
export interface MapAppearance {
  /** Show the departure country. */
  start: boolean;
  /** Draw country borders. */
  borders: boolean;
  /** Show country names. */
  names: boolean;
  /** Full map from the start (true) or progressive discovery (false). */
  full: boolean;
}

/** Everything that defines a game except the random seed. Replaying a game = same config, new seed. */
export interface GameConfig {
  mode: GameMode;
  difficulty: ChallengeDifficulty;
  /** "world", a continent, or (regional mode) any playable region id. */
  scope: string;
  /** Countries the route must never go through. */
  forbidden: string[];
  /** Strait crossings (an explicit list, see `STRAIT_CONNECTIONS`) are valid links. Default: off. */
  straits: boolean;
  /** Connections through disputed territory (an explicit list, see `DISPUTED_CONNECTIONS`) are valid links. Default: off. */
  disputes: boolean;
  /** Custom difficulty only: minimum number of intermediate countries. */
  minIntermediate: number;
  /** Custom difficulty only: maximum number of attempts. */
  attempts: number;
  /** Custom difficulty only: map presentation (Easy/Normal/Hard use {@link PRESET_MAP}). */
  map: MapAppearance;
}

export const PRESET_MAP: Record<Difficulty, MapAppearance> = {
  easy: { start: true, borders: true, names: true, full: true },
  normal: { start: true, borders: true, names: true, full: false },
  hard: { start: true, borders: true, names: true, full: false },
};

export const LIMITS = { minAttempts: 1, maxAttempts: 30, minRoute: 1, maxForbidden: 10 } as const;

export const WORLD = "world";

export function defaultConfig(mode: GameMode): GameConfig {
  return {
    mode,
    difficulty: "normal",
    scope: mode === "regional" ? "europe" : WORLD,
    forbidden: [],
    straits: false,
    disputes: false,
    minIntermediate: 4,
    attempts: 8,
    map: { ...PRESET_MAP.normal },
  };
}

/** The map presentation actually used by a game. */
export function effectiveMap(cfg: Pick<GameConfig, "difficulty" | "map">): MapAppearance {
  return cfg.difficulty === "custom" ? cfg.map : PRESET_MAP[cfg.difficulty];
}

/** Scopes a player may pick: the whole world (classic/constraints only) and every region of the dataset. */
export function scopeOptions(mode: GameMode): { continents: string[]; subregions: string[]; world: boolean } {
  return {
    world: mode !== "regional",
    continents: [...CONTINENT_IDS],
    subregions: mode === "regional" ? REGION_DEFS.filter((r) => r.kind === "subregion").map((r) => r.id) : [],
  };
}

const MODES: GameMode[] = ["classic", "constraints", "regional"];
const DIFFS: ChallengeDifficulty[] = ["easy", "normal", "hard", "custom"];
const bool = (v: string | null, fallback: boolean) => (v === "1" ? true : v === "0" ? false : fallback);
const int = (v: string | null, fallback: number) => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isInteger(n) ? n : fallback;
};

export interface ParsedGame {
  config: GameConfig;
  seed: string;
  /** Replay: start/destination pair that must not come back. */
  exclude?: [string, string];
}

/** Reads a game configuration from URL parameters (unknown or invalid values fall back to safe defaults). */
export function parseConfig(params: URLSearchParams): ParsedGame {
  const modeRaw = params.get("mode") as GameMode | null;
  const mode: GameMode = modeRaw && MODES.includes(modeRaw) ? modeRaw : "classic";
  const base = defaultConfig(mode);
  const dRaw = params.get("difficulty") as ChallengeDifficulty | null;
  const difficulty = dRaw && DIFFS.includes(dRaw) ? dRaw : base.difficulty;
  const scopeRaw = params.get("scope") ?? params.get("region") ?? base.scope;
  const scope = scopeRaw === WORLD ? (mode === "regional" ? base.scope : WORLD) : graph.hasRegion(scopeRaw) ? scopeRaw : base.scope;
  const forbidden = (params.get("forbid") ?? "")
    .split(",")
    .filter((id) => graph.has(id))
    .filter((id, i, a) => a.indexOf(id) === i)
    .slice(0, LIMITS.maxForbidden);
  const preset = difficulty === "custom" ? PRESET_MAP.normal : PRESET_MAP[difficulty];
  const config: GameConfig = {
    mode,
    difficulty,
    scope,
    forbidden,
    straits: bool(params.get("straits"), false),
    disputes: bool(params.get("disputes"), false),
    minIntermediate: int(params.get("min"), base.minIntermediate),
    attempts: int(params.get("att"), base.attempts),
    map: {
      start: bool(params.get("mstart"), preset.start),
      borders: bool(params.get("mborders"), preset.borders),
      names: bool(params.get("mnames"), preset.names),
      full: bool(params.get("mfull"), preset.full),
    },
  };
  const avoid = (params.get("avoid") ?? "").split("-");
  const exclude: [string, string] | undefined = avoid.length === 2 && avoid.every((id) => graph.has(id)) ? [avoid[0], avoid[1]] : undefined;
  return { config, seed: params.get("seed") ?? String(Date.now()), exclude };
}

/** Serialises a configuration for the game URL. Custom-only fields are written only for custom games. */
export function configToParams(cfg: GameConfig, seed: string, exclude?: readonly [string, string]): URLSearchParams {
  const q = new URLSearchParams({ mode: cfg.mode, difficulty: cfg.difficulty, scope: cfg.scope, seed });
  if (cfg.forbidden.length) q.set("forbid", cfg.forbidden.join(","));
  // written only when ON: URLs (and the seeds derived from them) of games without the options stay exactly as before
  if (cfg.straits) q.set("straits", "1");
  if (cfg.disputes) q.set("disputes", "1");
  if (cfg.difficulty === "custom") {
    q.set("min", String(cfg.minIntermediate));
    q.set("att", String(cfg.attempts));
    q.set("mstart", cfg.map.start ? "1" : "0");
    q.set("mborders", cfg.map.borders ? "1" : "0");
    q.set("mnames", cfg.map.names ? "1" : "0");
    q.set("mfull", cfg.map.full ? "1" : "0");
  }
  if (exclude) q.set("avoid", `${exclude[0]}-${exclude[1]}`);
  return q;
}

/** The configuration a finished challenge was played with (used when none was stored, e.g. a restored daily). */
export function configFromChallenge(ch: Challenge): GameConfig {
  const base = defaultConfig(ch.mode);
  return {
    ...base,
    difficulty: ch.difficulty,
    scope: ch.rules.allowedRegion ?? base.scope,
    // Only user-chosen forbidden countries belong to a configuration; generated constraints are regenerated.
    forbidden: ch.mode === "constraints" ? [] : [...ch.rules.forbidden],
    // a challenge carries its own options: they decide what "the same settings" means, never the player's preferences
    straits: ch.rules.straits === true,
    disputes: ch.rules.disputes === true,
    minIntermediate: Math.max(LIMITS.minRoute, ch.minIntermediate),
    attempts: ch.attempts,
  };
}

/** Same settings, brand-new challenge: a fresh seed, and the previous start/destination pair is excluded. */
export function replayParams(cfg: GameConfig, previous: Pick<Challenge, "start" | "destination">, seed = String(Date.now())): URLSearchParams {
  return configToParams(cfg, seed, [previous.start, previous.destination]);
}

/** Generator request for a configuration. */
export function genRequestFor(cfg: GameConfig, seed: string, exclude?: readonly [string, string], candidates = 300): GenRequest {
  const regional = cfg.mode === "regional";
  return {
    mode: cfg.mode,
    difficulty: cfg.difficulty,
    seed,
    candidates,
    ...(regional ? { region: cfg.scope } : cfg.scope !== WORLD ? { scope: cfg.scope } : {}),
    ...(cfg.forbidden.length ? { forbidden: cfg.forbidden } : {}),
    ...(cfg.straits ? { straits: true } : {}),
    ...(cfg.disputes ? { disputes: true } : {}),
    ...(cfg.difficulty === "custom" ? { minIntermediate: cfg.minIntermediate, attempts: cfg.attempts } : {}),
    ...(exclude ? { exclude } : {}),
  };
}

export type ConfigIssue =
  | { code: "min"; max: number }
  | { code: "attempts" }
  | { code: "forbidden" }
  | { code: "scope" };

/** Static validation of a configuration (no generation). `diameter` is the longest possible route for the scope. */
export function validateConfig(cfg: GameConfig, diameter: number): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (cfg.forbidden.length > LIMITS.maxForbidden) issues.push({ code: "forbidden" });
  if (cfg.mode === "regional" && !graph.hasRegion(cfg.scope)) issues.push({ code: "scope" });
  if (cfg.difficulty === "custom") {
    if (!Number.isInteger(cfg.attempts) || cfg.attempts < LIMITS.minAttempts || cfg.attempts > LIMITS.maxAttempts) issues.push({ code: "attempts" });
    if (!Number.isInteger(cfg.minIntermediate) || cfg.minIntermediate < LIMITS.minRoute || cfg.minIntermediate > Math.max(diameter, 0)) {
      issues.push({ code: "min", max: Math.max(diameter, 0) });
    }
  }
  return issues;
}
