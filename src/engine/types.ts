/** Shared engine types. The engine never imports React, MapLibre or browser APIs. */

export type ConnectionType = "land" | "sea";
export type Difficulty = "easy" | "normal" | "hard";
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
  difficulty: Difficulty;
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

export type HintKind = "geographic" | "connectivity" | "discovery";

export type HintPayload =
  | { kind: "geographic"; region: string; continent: string }
  | { kind: "connectivity"; borders: number }
  | { kind: "discovery"; letter: { fr: string; en: string } };

export interface HintRecord {
  payload: HintPayload;
  penalty: number;
  atMove: number;
}

export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  challengeId: string;
  /** start + accepted countries (destination appended on victory). */
  route: string[];
  attemptsTotal: number;
  attemptsLeft: number;
  /** Rejected submissions (country ids), in order. */
  mistakes: string[];
  hints: HintRecord[];
  status: GameStatus;
  startedAt: number;
  endedAt?: number;
}

export type MoveOutcome = "accepted" | "won" | "lost" | "rejected" | "ignored";

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
