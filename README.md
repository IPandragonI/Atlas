# Atlas

A geography game: connect a start country to a destination through neighbouring countries, in as few steps as possible.
French (default) and English. Installable PWA, fully offline, no backend, no account — progress lives in IndexedDB.

Stack: Next.js (static export), React, TypeScript strict, Tailwind 4, MapLibre GL (own GeoJSON, no tiles), Zustand, Dexie,
next-intl, Vitest, Playwright.

## Setup
```bash
npm install            # also vendors the MapLibre worker into public/vendor
npm run dev            # http://localhost:3000  (service worker is production-only)
```

## Commands
| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | vendor worker → generate missing daily JSON (idempotent) → `next build` (→ `out/`) → write `out/sw.js` |
| `npm start` | serve `out/` |
| `npm test` | Vitest (72 tests: graph, rules, pathfinding, hints, scoring, generator, dailies, persistence, i18n) |
| `npm run test:e2e` | Playwright desktop + mobile (needs `npm run build` and `npx playwright install chromium`) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run data:build` | rebuild countries, connections, geometry from `data-src/` + overrides |
| `npm run data:daily` | precompute missing daily challenges (never overwrites) |
| `npm run data:simulate` | generator diagnostics report |

`data-src/ne_50m_admin_0_map_units.geojson` (Natural Earth, public domain) is the only raw input; download it from
`nvkelso/natural-earth-vector` if missing.

## Geographic data & country policy
195 playable states (193 UN + Holy See + Palestine); Kosovo and Taiwan are excluded (drawn neutral); dependencies are not
playable. Adjacency is a reviewed list, not derived from polygons (French Guiana never links France to Brazil). Details:
[docs/GEOGRAPHIC_DATA.md](docs/GEOGRAPHIC_DATA.md).

## Documentation
- [docs/GAME_RULES.md](docs/GAME_RULES.md) · [docs/GEOGRAPHIC_DATA.md](docs/GEOGRAPHIC_DATA.md)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/CHALLENGE_GENERATION.md](docs/CHALLENGE_GENERATION.md)

## Challenge generation
Free play is generated in the browser from a seeded, diversity-weighted candidate search with mandatory feasibility
validation. Daily challenges (3 per UTC day) are precomputed JSON bundled with the app. See the doc above.

## PWA / offline
`out/sw.js` precaches the whole export (shell, assets, geometry, graph, all daily files, MapLibre worker). Verified by an
e2e test that goes offline and plays the daily challenge on a painted map. Deploy `out/` on any static host at the **domain
root** (paths are absolute, e.g. `/data/world.geojson`).
