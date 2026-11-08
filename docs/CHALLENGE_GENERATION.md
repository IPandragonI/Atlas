# Challenge generation

Code: `src/engine/generator/{generator,diversity}.ts`, `src/lib/generate.ts`, `scripts/{generate-daily,simulate}.ts`.

## Pipeline (`generateChallenge`)
1. Seeded RNG from `mode|difficulty|region|seed`.
2. Universe + traversal view per mode (world / region; maritime by region `seaMode` or 22 % chance in Constraints).
3. All connected pairs with ≥1 intermediate come from a cached BFS table; keep pairs inside the difficulty band.
   (Constraints+maritime keeps only pairs the land graph cannot link as well.)
4. Sample `candidates` pairs (300 free play, 2000 daily), pick a random shortest route, count optimal routes.
5. Score = appeal − repetition penalty, rank.
6. Constraints mode: for the top candidates build 2–3 constraints from templates derived from that route's real
   alternatives (forbid a route country, mandate an alternative-only country, coastal/island minimums, require/avoid a
   region, optional tightening `maxIntermediate`), re-solving after each addition.
7. **Final feasibility validation** (`solve`): feasible, recorded minimum matches, first solution passes `isValidRoute`;
   every constraint must be *active*; maritime must matter; length capped (≤14). Otherwise try the next candidate.
8. `generateWithRetry` derives new seeds on the rare failure (<1 % in simulation).

## Diversity scoring (`DEFAULT_WEIGHTS`, configurable)
Sliding window of the last 40 challenges with linear recency (latest = 1, oldest ≈ 0.1).
Penalties: start/destination reuse (3), intermediate reuse (2.5, √-dampened so hubs are discouraged, never banned), same
continent/subregion pair (0.8), shared corridor edges (5), repeated country triples (6).
Appeal: log₂(optimal routes) ×0.6, subregion variety ×2, island/landlocked share ×0.5, small jitter.

## Daily challenges
`npm run data:daily -- [start=2026-11-01] [days=400] [candidates=2000]` writes `public/daily/YYYY-MM-DD.json`
(`date`, `rulesVersion`, `datasetVersion`, three challenges with mode, difficulty, start, destination, rules incl. maritime,
`minIntermediate`, `attempts`). Ids are `daily-<date>-<mode>`. **Existing files are never overwritten**; they feed the
history for later days (the build runs this script and is idempotent). Difficulty is fixed per mode and UTC weekday
(`src/lib/daily-schedule.ts`); the regional region rotates with stride 4 over the 15 regions. If a file is missing or no
longer validates, the client regenerates deterministically from the date seed (flagged as local fallback).
The range is automatic: the script keeps `DAILY_AHEAD_DAYS` (default 365) days ahead of today and only adds missing days; a
monthly GitHub Action (`.github/workflows/extend-daily.yml`) commits the new files. `npm run data:revalidate-daily` verifies
every file against the current graph.

## Simulation and tuning
`npm run data:simulate -- [perCombo=60] [candidates=300]` prints invalid rate, repeats, country/continent/subregion/corridor
frequencies, length distribution and mean attempts. Observed (135 challenges): 0 invalid after validation, ~0.7 % failed
requests (retried), repeated pairs 5 %, 172/195 countries covered. Hub corridors in Africa/Middle-East still recur because
long overland routes structurally funnel there; raise `corridor`/`intermediate` weights to trade geography for variety.
Margins (+5/+3/+1) should be re-checked with `data:simulate` after any band change.

## Game configuration (free play)
`GenRequest` also accepts `scope` (continent for Classic/Constraints), `forbidden`, `difficulty: "custom"` with
`minIntermediate` / `attempts`, and `exclude` (a start/destination pair not to repeat, used by "replay with the same settings").
- **Scope / forbidden**: the universe of start/destination candidates is the scope minus forbidden countries; the traversal
  view blocks forbidden countries and allows only the scope. Pair tables are cached per `(scope, sea, forbidden)`.
  Standard difficulty inside a continent uses the region-scaled bands (the world bands would not fit a small continent).
- **Custom**: band = `[min, min + 2]` intermediates; the final solver check rejects anything below `min`. `attempts`
  overrides `minIntermediate + margin`; constraint density behaves like Normal.
- **Never impossible**: no pair in the band, an invalid attempts value, or no route after all restrictions ⇒ `null` (no
  challenge). `scopeInfo()` gives the longest possible route / playable country count so the form can validate before
  generating; the modal then runs the real generator once (same inputs as the game) to report impossible setups.
- **Replay**: `generateForConfig(cfg, seed, history, exclude)` retries without the exclusion only if the exclusion itself made
  generation impossible (a scope with a single possible pair).
- Daily generation is unaffected: the RNG seed string and consumption order are unchanged for requests without the new fields.
