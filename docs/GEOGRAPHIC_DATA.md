# Geographic data

Build: `npm run data:build` (`scripts/build-data.ts`). Outputs are committed: `src/data/countries.json`,
`src/data/connections/connections.json`, `public/data/world.geojson`. Raw inputs live in `data-src/` (not shipped).

## Sources
| Data | Source | Licence |
|---|---|---|
| Geometry, population estimate | Natural Earth 1:50m `admin_0_map_units` | Public domain |
| Names (en/fr), ISO codes, capitals, area, land borders, subregions | `world-countries` (mledoze) | ODbL |
| Flags | `flag-icons` (bundled SVG) | MIT |
| French capitals | `src/data/countries-meta.ts` (hand-curated differences) | — |

## Country inclusion policy (195)
193 UN members + Holy See + Palestine, identified by ISO 3166-1 alpha-3. Dependent territories (Greenland, Puerto Rico,
French Guiana, Hong Kong…) are **not playable**. They are drawn as neutral, non-clickable areas.

- **Kosovo**: not playable (not a UN member); drawn neutral. Serbia is unaffected for gameplay.
- **Taiwan**: not playable (not a UN member); drawn neutral.
- Palestine: NE splits Gaza/West Bank; both merge into `PSE`. South Sudan is `SSD` (NE uses `SDS`).
- Continent for transcontinental states: Russia→Europe, Turkey/Kazakhstan/Georgia/Armenia/Azerbaijan→Asia, Cyprus→Europe,
  Egypt→Africa. Americas split by UN subregion (South America vs North America incl. Central America & Caribbean).
- "Island" = no land border, plus shared islands (IRL, GBR, HTI, DOM, PNG, IDN, TLS, BRN).
- Changing this list requires bumping `DATASET_VERSION` and a deliberate review: tests assert exactly 195.

## Visual geometry vs gameplay graph (separate on purpose)
Playable geometry uses *map units* and excludes overseas units (`FRA`: Guiana, Guadeloupe, Martinique, Réunion, Mayotte;
`NLD`: Caribbean Netherlands; `NOR`: Svalbard, Jan Mayen; `NZL`: Tokelau). They render as neutral areas. Adjacency is
**never inferred from polygons**; it comes from the reviewed border list plus `src/data/connections/overrides.ts`.

### Reviewed land overrides (`overrides.ts`, each with a reason)
- Removed: FRA–BRA, FRA–SUR (French Guiana), FRA–NLD (Saint-Martin), LKA–IND (maritime boundary listed as land by the source).
- Added fixed links: DNK–SWE (Øresund), BHR–SAU (King Fahd Causeway), SGP–MYS (Causeways).
- Kept on purpose: ESP–MAR (Ceuta/Melilla), GBR–IRL, DOM–HTI, IDN–MYS/PNG/TLS, BRN–MYS.

### Sea connections
~130 curated pairs: recognised straits, short crossings, shared archipelagos (Channel, Øresund, Palk, Bab-el-Mandeb, Caribbean
chain, Pacific micro-states…). Land supersedes sea. Never auto-generated from proximity. A test asserts every country is
reachable when sea links are enabled.

## Tests guarding the data
France–Spain/Germany land; France–UK sea only; France–Brazil none; bidirectionality; maritime on/off; Luxembourg's three
neighbours; main land component membership; 195 countries; metadata completeness.

## Known limitations
Natural Earth 1:50m is coarse for microstates (rendered as clickable dots when area < 12,000 km²). Antimeridian: geometries
are used as shipped (Russia/Fiji are pre-split); route lines connect country centres and do not wrap the Pacific.
