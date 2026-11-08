# Architecture

Static Next.js export (App Router, `output: "export"`), no server. React UI on top of a pure TypeScript engine.

```
src/
  engine/        pure TS, no React/MapLibre/browser: graph, pathfinding, rules, game, hints, scoring,
                 difficulty, search, rng, generator/{generator,diversity}
  data/          countries.json, connections/, regions.ts, version.ts (generated + curated)
  lib/           atlas.ts (data -> shared graph), generate.ts, daily*.ts, db.ts (Dexie), progress.ts, share.ts, sound.ts
  stores/        zustand: settings, progress (Dexie-backed), game (drives the engine)
  components/    map/ (WorldMap, MapControls, MapView), game/, home/, collection/, ui/
  app/[locale]/  routes: / , play, game, collection, stats, settings
  i18n/          next-intl routing + fr/en catalogs
scripts/         build-data, generate-daily, simulate, build-brand, build-sw, copy-maplibre-worker
```
(The suggested `features/` and `explore/` folders were folded into `lib/` and the collection map.)

## Principles
- Engine is deterministic (seeded RNG, no `Math.random`) and never imported *from* UI code the other way round.
- All validation goes through `rules.validateMove` → `game.submitGuess`. Components never decide gameplay.
- One shared `AtlasGraph`; rules only change the **traversal view** (`viewFor`: maritime, blocked, allowed).
- `solve()` = iterative-deepening enumeration of loopless paths pruned by exact BFS distance-to-goal. It supports
  route-level constraints (mandatory, coastal minimums…) that BFS/Yen cannot, mid-game prefixes (hints), and returns
  optimal + alternative routes ordered by length (equivalent to k-shortest loopless paths, capped by a budget).

## Map
MapLibre GL with a style object built in code: `background`, `country-fill`, `country-hover`, `country-borders`,
`country-selected`, `route-glow`, `route-line`, `country-dots` (+`dots-hover`) for small states. State is applied via
**feature-state** (`s`: start/destination/traversed/wrong/discovered/new/region/dim), so recolouring never rebuilds data.
Colours come from CSS variables and update on theme change (MutationObserver). No tile server, no glyph server: labels and
A/B pins are DOM markers. MapLibre 6's worker is vendored to `public/vendor/` (`copy-maplibre-worker.mjs`) because bundlers
cannot resolve it; `data-painted` on the map root proves polygons really rendered (asserted in e2e).
**Masking** (hidden-map mode, see GAME_RULES): `WorldMap` takes `masked`; each country listed in `states` gets feature-state `show`, and fill / border / dot opacity is `case(show, 1, level)` where `level` animates 0↔1 on toggle. The source GeoJSON is never altered, hidden countries cannot be hovered or clicked, and which countries are shown comes from the pure `lib/visibility.ts`.
Trade-off: DOM labels avoid shipping a font/glyph stack and work offline, at the cost of no label collision handling
(thresholded by area/zoom instead).

## Persistence (IndexedDB via Dexie)
Tables: `kv` (settings), `discovered`, `games`, `daily`, `achievements`, `recents` (generator history, capped 120).
DB version 1 (`DB_VERSION`); export format has its own `schemaVersion` + `migrateExport`. Import is atomic and strictly
validated (`validateImport`). First completion of a daily challenge is the one stored. Theme is mirrored in `localStorage`
for flash-free first paint. If storage is unavailable the game remains playable.

## PWA / offline
`scripts/build-sw.mjs` writes `out/sw.js` listing every exported file (shell, JS/CSS, geometry, countries, graph, **a window of daily
JSON (yesterday → +60 days, `scripts/sw-manifest.mjs`; other days are cached when first fetched and prefetched while online)**, flags, icons, MapLibre worker). Navigations are network-first with cache fallback; assets cache-first. Updates show a
reload prompt (`PwaRegister`). e2e verifies: install, offline reload, offline daily challenge, offline map painting.

## Generation in a Web Worker
`src/workers/generate.worker.ts` runs the generator off the main thread. Turbopack does not bundle `new Worker(new URL(...))`
for TypeScript correctly, so `scripts/build-worker.mjs` (esbuild) pre-bundles it to `public/workers/generate.worker.js`
(run by `predev` and `build`; git-ignored). `generate-client.ts` falls back to the main thread if the worker is unavailable
(always in `next dev`) and sets `html[data-gen-worker]` so e2e can prove which path ran. The game modal warms the worker up.

## Accessibility
Focus trap + focus return in dialogs (`useFocusTrap`), labelled map and a textual route summary (`sr-route`), coarse-pointer
target sizes, no opacity-based dimming of text. `e2e/a11y.spec.ts` runs axe (WCAG 2 A/AA) on every screen in both themes.

## Testing
Vitest (graph, rules, pathfinding, difficulty, hints, scoring, generator, daily files, persistence, i18n parity),
Playwright (desktop + Pixel 7: full game, wrong answers, autocomplete, hints, persistence, theme, offline).
