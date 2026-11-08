/** Shared engine types. The engine never imports React, MapLibre or browser APIs. */

/**
 * land: ordinary borders (always usable).
 * sea: curated maritime links (usable with `rules.maritime`).
 * strait: curated strait crossings (usable with `rules.straits`, independent of `maritime`).
 * dispute: connections that exist only through disputed or contested territory (usable with `rules.disputes`).
 */
export type ConnectionType = "land" | "sea" | "strait" | "dispute";
export type Difficulty = "easy" | "normal" | "hard";
/** Challenges can also be generated with player-defined ("custom") settings. */
export type ChallengeDifficulty = Difficulty | "custom";
export type GameMode = "classic" | "constraints" | "regional";
export type Locale = "fr" | "en";

export interface CountryConnection {
  from: string;
  to: string;
  type: ConnectionType;
}

export interface Country {
  id: string; // ISO 3166-1 alpha-3
  iso2?: string;
  name: { fr: string; en: string };
  aliases?: { fr: string[]; en: string[] };
  capital: { fr: string; en: string };
  continent: string; // europe | africa | asia | north-america | south-america | oceania
  region: string; // UN geoscheme subregion, e.g. "Western Europe"
  population: number;
  area: number; // km²
  isCoastal: boolean;
  isIsland: boolean;
  center: [number, number];
  bbox: [number, number, number, number];
}

export type SeaMode = "never" | "optional" | "always";

export interface RegionDef {
  id: string;
  kind: "continent" | "subregion";
  /** Explicit member ids; for continents members are derived from Country.continent. */
  countries?: string[];
  seaMode: SeaMode;
}

/** Rules a challenge applies on top of the shared geographic graph. */
export interface ChallengeRules {
  maritime: boolean;
  /** Strait crossings are usable. Absent = false (every challenge published before this option keeps its meaning). */
  straits?: boolean;
  /** Connections through disputed territory are usable. Absent = false. */
  disputes?: boolean;
  forbidden: string[];
  mandatory: string[];
  minCoastal?: number;
  minIsland?: number;
  maxIntermediate?: number;
  /** Route must pass through at least one intermediate country of this region id. */
  requireRegion?: string;
  /** Route must not use any country of this region id. */
  avoidRegion?: string;
  /** Regional mode: only countries of this region are usable. */
  allowedRegion?: string;
}

export interface Challenge {
  id: string;
  mode: GameMode;
  difficulty: ChallengeDifficulty;
  start: string;
  destination: string;
  rules: ChallengeRules;
  /** Minimum number of intermediate countries under the rules. */
  minIntermediate: number;
  attempts: number;
  date?: string; // UTC YYYY-MM-DD for daily challenges
  rulesVersion: string;
  datasetVersion: string;
}

/** Three progressive hints, in this order: first letter, the borders, then the full name of a valid next country. */
export type HintKind = "letter" | "borders" | "reveal";

/** `countryId` is the hinted (valid next) country; the UI must never display its name. */
export type HintPayload =
  | { kind: "letter"; letter: { fr: string; en: string }; countryId: string }
  | { kind: "borders"; countryId: string }
  /** Hint 3: the UI shows the name of `countryId`. It is still the player who has to type it. */
  | { kind: "reveal"; countryId: string };

export interface HintRecord {
  payload: HintPayload;
  penalty: number;
  atMove: number;
  /** The active route (joined with ">") the hint was computed for. Older saves have none. */
  routeKey?: string;
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  challengeId: string;
  /** The ACTIVE route: start + the current branch of accepted countries (never the destination). Used for scoring. */
  route: string[];
  /** Discovery history: every country correctly entered this game, including branches the player abandoned. */
  visited: string[];
  attemptsTotal: number;
  attemptsLeft: number;
  /** Rejected submissions (country ids), in order. */
  mistakes: string[];
  hints: HintRecord[];
  status: GameStatus;
  startedAt: number;
  endedAt?: number;
}

/** "repeated": a country already submitted (and rejected) earlier in this game, submitted again: nothing is counted. */
export type MoveOutcome = "accepted" | "won" | "lost" | "rejected" | "repeated" | "ignored";

export interface ScoreBreakdown {
  victory: number;
  optimal: number;
  noMistakes: number;
  noHints: number;
  mistakePenalty: number;
  hintPenalty: number;
  total: number;
}

export interface GameResult {
  challengeId: string;
  status: "won" | "lost";
  route: string[];
  intermediates: number;
  minIntermediate: number;
  optimal: boolean;
  mistakes: number;
  hintsUsed: HintKind[];
  score: ScoreBreakdown;
  durationMs: number;
}
