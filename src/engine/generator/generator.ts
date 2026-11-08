import { attemptsFor, regionBands, WORLD_BANDS } from "../difficulty";
import type { AtlasGraph, GraphView } from "../graph/graph";
import { bfsDistances, countShortestRoutes, solve } from "../pathfinding";
import { createRng, pick, shuffle, type Rng } from "../rng";
import { isValidRoute } from "../rules";
import type { Challenge, ChallengeDifficulty, ChallengeRules, Difficulty, GameMode } from "../types";
import { DEFAULT_WEIGHTS, scoreCandidate, type DiversityWeights, type HistoryEntry } from "./diversity";

export interface GenContext {
  graph: AtlasGraph;
  history: readonly HistoryEntry[];
  weights?: DiversityWeights;
  datasetVersion: string;
  rulesVersion: string;
  /** Region ids usable as constraint targets (require / avoid). */
  constraintRegions: readonly string[];
}

export interface GenRequest {
  mode: GameMode;
  /** "custom" uses minIntermediate / attempts below (constraint density behaves like "normal"). */
  difficulty: ChallengeDifficulty;
  region?: string; // regional mode: the playable region
  /** Classic / Constraints: restrict the game to a continent (or any region id). Omitted or "world" = whole world. */
  scope?: string;
  /** Countries that must never be used. They are never picked as start or destination either. */
  forbidden?: readonly string[];
  /** Custom difficulty: minimum number of intermediate countries (the generated minimum is >= this). */
  minIntermediate?: number;
  /** Custom difficulty: maximum attempts (overrides minIntermediate + margin). */
  attempts?: number;
  /** Strait crossings are usable in this game (see `STRAIT_CONNECTIONS`). Default: off. */
  straits?: boolean;
  /** Connections through disputed territory are usable in this game (see `DISPUTED_CONNECTIONS`). Default: off. */
  disputes?: boolean;
  /** Replay: this unordered start/destination pair is never generated again. */
  exclude?: readonly [string, string];
  seed: string;
  id?: string;
  date?: string;
  /** Number of candidate pairs to score (thousands for daily, hundreds for free play). */
  candidates?: number;
}

export interface Generated {
  challenge: Challenge;
  /** Representative optimal route (for history and diagnostics). */
  route: string[];
  alternatives: number;
  diversity: { appeal: number; penalty: number };
  evaluated: number;
}

interface Pair {
  a: string;
  b: string;
  d: number;
}
interface PairTable {
  pairs: Pair[];
  diameter: number; // max intermediates
}
const tableCache = new WeakMap<AtlasGraph, Map<string, PairTable>>();

function pairTable(graph: AtlasGraph, view: GraphView, ids: readonly string[], key: string): PairTable {
  let m = tableCache.get(graph);
  if (!m) tableCache.set(graph, (m = new Map()));
  const hit = m.get(key);
  if (hit) return hit;
  const pairs: Pair[] = [];
  let maxD = 0;
  for (const a of ids) {
    const dist = bfsDistances(graph, a, view);
    for (const b of ids) {
      if (a >= b) continue;
      const d = dist.get(b);
      if (d === undefined || d < 2) continue; // adjacent pairs have no intermediate: not a puzzle
      pairs.push({ a, b, d });
      maxD = Math.max(maxD, d - 1);
    }
  }
  const t = { pairs, diameter: maxD };
  m.set(key, t);
  return t;
}

/** Random shortest route using exact BFS distances to the goal. */
function sampleRoute(graph: AtlasGraph, view: GraphView, rng: Rng, a: string, b: string): string[] {
  const toGoal = bfsDistances(graph, b, view);
  const route = [a];
  let cur = a;
  while (cur !== b) {
    const dc = toGoal.get(cur)!;
    const next = graph.neighbors(cur, view).filter((n) => toGoal.get(n) === dc - 1);
    cur = pick(rng, next);
    route.push(cur);
  }
  return route;
}

/** Options are written into the rules only when ON, so rules (and therefore published challenges) of games without them are unchanged. */
interface Options { straits?: boolean; disputes?: boolean }
const optionRules = (o: Options): Pick<ChallengeRules, "straits" | "disputes"> => ({ ...(o.straits ? { straits: true } : {}), ...(o.disputes ? { disputes: true } : {}) });
const optionKey = (o: Options) => `${o.straits ? "|straits" : ""}${o.disputes ? "|disputes" : ""}`;
const emptyRules = (o: Options = {}): ChallengeRules => ({ maritime: false, forbidden: [], mandatory: [], ...optionRules(o) });

export function dailyId(date: string, mode: GameMode): string {
  return `daily-${date}-${mode}`;
}

export function generateChallenge(ctx: GenContext, req: GenRequest): Generated | null {
  const { graph } = ctx;
  const w = ctx.weights ?? DEFAULT_WEIGHTS;
  const effDiff: Difficulty = req.difficulty === "custom" ? "normal" : req.difficulty;
  const scope = req.mode === "regional" ? req.region : req.scope && req.scope !== "world" ? req.scope : undefined;
  if (scope && !graph.hasRegion(scope)) return null;
  const forbidden = [...new Set(req.forbidden ?? [])].filter((id) => graph.has(id)).sort();
  const forbiddenSet = new Set(forbidden);
  const customMin = req.difficulty === "custom" ? Math.max(1, Math.floor(req.minIntermediate ?? 3)) : 0;
  if (req.attempts !== undefined && (!Number.isInteger(req.attempts) || req.attempts < 1)) return null;
  const rng = createRng(`${req.mode}|${req.difficulty}|${req.region ?? req.scope ?? ""}|${req.seed}`);
  const candidates = req.candidates ?? 300;

  // ---- universe, view and band per mode
  let maritime = false;
  let ids = graph.ids();
  let view: GraphView = { maritime: false, blocked: new Set() };
  let baseRules = emptyRules();
  let bandsFor: (diameter: number) => { min: number; max: number };

  if (req.mode === "regional") {
    if (!req.region || !graph.hasRegion(req.region)) return null;
    ids = [...graph.regionMembers(req.region)].sort();
    const def = REGION_SEA.get(req.region) ?? "never";
    maritime = def === "always" ? true : def === "optional" ? rng() < 0.3 : false;
    baseRules = { ...emptyRules(req), maritime, allowedRegion: req.region, forbidden: [...forbidden] };
  } else {
    if (scope) ids = [...graph.regionMembers(scope)].sort();
    maritime = req.mode === "constraints" && rng() < 0.22;
    baseRules = { ...emptyRules(req), maritime, forbidden: [...forbidden], ...(scope ? { allowedRegion: scope } : {}) };
  }
  // forbidden countries are neither crossed nor ever picked as start / destination
  ids = ids.filter((id) => !forbiddenSet.has(id));
  view = graph.viewFor(baseRules);
  if (req.difficulty === "custom") bandsFor = () => ({ min: customMin, max: customMin + 2 });
  else if (req.mode === "regional" || scope) bandsFor = (d) => regionBands(d)[effDiff];
  else bandsFor = () => WORLD_BANDS[effDiff];

  const table = pairTable(graph, view, ids, `${scope ?? "world"}|${maritime}|${forbidden.join(",")}${optionKey(req)}`);
  const band = bandsFor(table.diameter);
  let eligible = table.pairs.filter((p) => p.d - 1 >= band.min && p.d - 1 <= band.max);
  if (req.exclude) {
    const [x, y] = req.exclude;
    eligible = eligible.filter((p) => !((p.a === x && p.b === y) || (p.a === y && p.b === x)));
  }
  if (maritime && req.mode === "constraints") {
    // maritime constraint must matter: keep pairs the land graph cannot link as well
    const landView = graph.viewFor(emptyRules(req)); // the options stay on: maritime must matter BEYOND them
    eligible = eligible.filter((p) => {
      const ld = bfsDistances(graph, p.a, landView).get(p.b);
      return ld === undefined || ld > p.d;
    });
  }
  if (eligible.length === 0) return null;

  const sampled = shuffle(rng, eligible).slice(0, candidates);
  const scored = sampled.map((p) => {
    const flip = rng() < 0.5;
    const a = flip ? p.b : p.a;
    const b = flip ? p.a : p.b;
    const route = sampleRoute(graph, view, rng, a, b);
    const optimalRoutes = countShortestRoutes(graph, a, b, view);
    const s = scoreCandidate(graph, ctx.history, { start: a, destination: b, route, optimalRoutes }, w, rng());
    return { a, b, d: p.d, route, optimalRoutes, s };
  });
  scored.sort((x, y) => y.s.total - x.s.total || (x.a + x.b).localeCompare(y.a + y.b));

  const id = req.id ?? `fp-${req.mode}-${req.seed}`;
  const maxTries = req.mode === "constraints" ? 30 : 8;
  for (const cand of scored.slice(0, maxTries)) {
    let rules: ChallengeRules = baseRules;
    if (req.mode === "constraints") {
      const built = buildConstraints(ctx, rng, cand.a, cand.b, cand.route, effDiff, baseRules, band.max);
      if (!built) continue;
      rules = built;
    }
    // ---- final feasibility validation (never publish an unvalidated challenge)
    const sol = solve(graph, { start: cand.a, destination: cand.b, rules });
    if (!sol.feasible) continue;
    if (req.mode !== "constraints" && sol.minIntermediate !== cand.d - 1) continue;
    if (req.difficulty === "custom" && sol.minIntermediate < customMin) continue;
    if (rules.forbidden.includes(cand.a) || rules.forbidden.includes(cand.b)) continue;
    if (!isValidRoute(graph, { start: cand.a, destination: cand.b, rules }, sol.routes[0])) continue;
    const challenge: Challenge = {
      id,
      mode: req.mode,
      difficulty: req.difficulty,
      start: cand.a,
      destination: cand.b,
      rules,
      minIntermediate: sol.minIntermediate,
      attempts: req.attempts ?? attemptsFor(sol.minIntermediate, effDiff),
      ...(req.date ? { date: req.date } : {}),
      rulesVersion: ctx.rulesVersion,
      datasetVersion: ctx.datasetVersion,
    };
    return {
      challenge,
      route: sol.routes[0],
      alternatives: sol.optimalCount,
      diversity: { appeal: cand.s.appeal, penalty: cand.s.penalty },
      evaluated: scored.length,
    };
  }
  return null;
}

/** Region sea-mode lookup (filled by configureRegions so the engine stays data-agnostic). */
const REGION_SEA = new Map<string, "never" | "optional" | "always">();
export function configureRegionSea(defs: readonly { id: string; seaMode: "never" | "optional" | "always" }[]) {
  for (const d of defs) REGION_SEA.set(d.id, d.seaMode);
}

// ---------------------------------------------------------------- constraints

type Template = "forbid" | "mandate" | "coastal" | "island" | "require" | "avoid" | "max";

interface Constraint {
  key: Template;
  apply: (r: ChallengeRules) => ChallengeRules;
}

function constraintCount(d: Difficulty, rng: Rng): number {
  return d === "easy" ? 2 : d === "hard" ? 3 : rng() < 0.5 ? 2 : 3;
}

function buildConstraints(
  ctx: GenContext,
  rng: Rng,
  a: string,
  b: string,
  route: string[],
  difficulty: Difficulty,
  baseRules: ChallengeRules,
  bandMax: number,
): ChallengeRules | null {
  const { graph } = ctx;
  const maritime = baseRules.maritime;
  const want = constraintCount(difficulty, rng) - (maritime ? 1 : 0);
  const cap = Math.min(14, bandMax + (difficulty === "hard" ? 3 : 2));
  const mid = route.slice(1, -1);
  const base: ChallengeRules = baseRules;
  const baseSol = solve(graph, { start: a, destination: b, rules: base }, undefined, { slack: 2, maxRoutes: 60 });
  if (!baseSol.feasible) return null;

  const options: Constraint[] = [];
  const optimalSet = new Set(baseSol.routes.slice(0, baseSol.optimalCount).flatMap((r) => r.slice(1, -1)));
  const altOnly = [...new Set(baseSol.routes.slice(baseSol.optimalCount).flatMap((r) => r.slice(1, -1)))].filter((c) => !optimalSet.has(c));
  if (mid.length > 0) {
    const f = pick(rng, mid);
    options.push({ key: "forbid", apply: (r) => ({ ...r, forbidden: [...r.forbidden, f] }) });
  }
  if (altOnly.length > 0) {
    const m = pick(rng, altOnly);
    options.push({ key: "mandate", apply: (r) => ({ ...r, mandatory: [...r.mandatory, m] }) });
    const reg = ctx.constraintRegions.filter((id) => graph.regionMembers(id).has(m) && !graph.regionMembers(id).has(a) && !graph.regionMembers(id).has(b) && !mid.some((x) => graph.regionMembers(id).has(x)));
    if (reg.length > 0) {
      const rid = pick(rng, reg);
      options.push({ key: "require", apply: (r) => ({ ...r, requireRegion: rid }) });
    }
  }
  const coastal = mid.filter((id) => graph.country(id).isCoastal).length;
  options.push({ key: "coastal", apply: (r) => ({ ...r, minCoastal: Math.min(4, Math.max(2, coastal + 1)) }) });
  const islands = mid.filter((id) => graph.country(id).isIsland).length;
  if (maritime && islands > 0) options.push({ key: "island", apply: (r) => ({ ...r, minIsland: Math.min(2, islands) }) });
  const avoidable = ctx.constraintRegions.filter((id) => {
    const mem = graph.regionMembers(id);
    return !mem.has(a) && !mem.has(b) && mid.some((x) => mem.has(x)) && mem.size >= 3;
  });
  if (avoidable.length > 0) {
    const rid = pick(rng, avoidable);
    options.push({ key: "avoid", apply: (r) => ({ ...r, avoidRegion: rid }) });
  }

  const chosen: Constraint[] = [];
  let rules = base;
  for (const opt of shuffle(rng, options)) {
    if (chosen.length >= want) break;
    if (chosen.some((c) => c.key === opt.key)) continue;
    const next = opt.apply(rules);
    const sol = solve(graph, { start: a, destination: b, rules: next }, undefined, { slack: 1, maxRoutes: 40 });
    if (!sol.feasible || sol.minIntermediate > cap) continue;
    chosen.push(opt);
    rules = next;
  }
  if (chosen.length < Math.max(1, want)) return null;

  // optional tightening: cap on intermediates (only for harder puzzles, only if still more than 1 constraint)
  const full = solve(graph, { start: a, destination: b, rules }, undefined, { slack: 2, maxRoutes: 60 });
  if (!full.feasible) return null;
  if (difficulty === "hard" && chosen.length + (maritime ? 1 : 0) < 3 && full.routes.length > full.optimalCount) {
    rules = { ...rules, maxIntermediate: full.minIntermediate + 1 };
  }

  // every constraint must be active: removing it changes the optimum or invalidates an optimal route
  const finalSol = solve(graph, { start: a, destination: b, rules });
  for (const c of chosen) {
    const without = chosen.filter((x) => x !== c).reduce((r, x) => x.apply(r), base);
    const sw = solve(graph, { start: a, destination: b, rules: without }, undefined, { slack: 0, maxRoutes: 80 });
    const only = c.apply(emptyRules());
    const excludes = sw.routes.slice(0, sw.optimalCount).some((r) => !isValidRoute(graph, { start: a, destination: b, rules: { ...only, ...optionRules(baseRules), maritime } }, r));
    if (!(sw.minIntermediate < finalSol.minIntermediate || excludes)) return null;
  }
  if (maritime) {
    const landSol = solve(graph, { start: a, destination: b, rules: { ...rules, maritime: false } });
    if (landSol.feasible && landSol.minIntermediate <= finalSol.minIntermediate) return null;
  }
  return rules;
}

/** Facts about a game scope, used by the configuration UI to validate settings before generating anything. */
export interface ScopeInfo {
  /** Largest possible number of intermediate countries between two playable countries in this scope. */
  diameter: number;
  /** Playable countries once forbidden ones are removed. */
  countries: number;
}

export function scopeInfo(ctx: GenContext, req: { mode: GameMode; scope?: string; forbidden?: readonly string[]; straits?: boolean; disputes?: boolean }): ScopeInfo {
  const { graph } = ctx;
  const scope = req.scope && req.scope !== "world" && graph.hasRegion(req.scope) ? req.scope : undefined;
  const forbidden = [...new Set(req.forbidden ?? [])].filter((id) => graph.has(id)).sort();
  const maritime = req.mode === "regional" && !!scope && REGION_SEA.get(scope) === "always";
  const rules: ChallengeRules = { ...emptyRules(req), maritime, forbidden, ...(scope ? { allowedRegion: scope } : {}) };
  const ids = (scope ? [...graph.regionMembers(scope)] : graph.ids()).filter((id) => !forbidden.includes(id)).sort();
  const table = pairTable(graph, graph.viewFor(rules), ids, `${scope ?? "world"}|${maritime}|${forbidden.join(",")}${optionKey(req)}`);
  return { diameter: table.diameter, countries: ids.length };
}
