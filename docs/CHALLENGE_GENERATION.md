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
Bundled range: 2026-11-01 → 2027-12-05; extend it by re-running the script before a release.

## Simulation and tuning
`npm run data:simulate -- [perCombo=60] [candidates=300]` prints invalid rate, repeats, country/continent/subregion/corridor
frequencies, length distribution and mean attempts. Observed (135 challenges): 0 invalid after validation, ~0.7 % failed
requests (retried), repeated pairs 5 %, 172/195 countries covered. Hub corridors in Africa/Middle-East still recur because
long overland routes structurally funnel there; raise `corridor`/`intermediate` weights to trade geography for variety.
Margins (+5/+3/+1) should be re-checked with `data:simulate` after any band change.
