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

### Strait crossings and territorial disputes (two independent game options)
Both are **explicit lists** in `src/data/connections/overrides.ts` (`STRAIT_CONNECTIONS`, `DISPUTED_CONNECTIONS`), copied by
`npm run data:build` into `connections.json` (`strait`, `dispute`). A test fails if the JSON and the lists drift. In the graph a
pair can have several types; each option enables **exactly its own list**:

| Option | Rule field | Enables | Default |
|---|---|---|---|
| Maritime (existing, set by the mode) | `maritime` | the curated sea links | per mode |
| Strait crossings | `straits` | `STRAIT_CONNECTIONS` only (independent of `maritime`) | off |
| Territorial disputes | `disputes` | `DISPUTED_CONNECTIONS` only | off |

Fields are written into a challenge's rules **only when on**; an absent field means off, so every published daily keeps its
meaning. A daily's options come from its file, never from the player's preferences.

**Supported straits (21):** Dover GBR–FRA, Otranto ITA–ALB, Sicily ITA–TUN, Hormuz IRN–OMN, Bab-el-Mandeb YEM–DJI, Tiran
EGY–SAU, Palk IND–LKA, Singapore SGP–IDN, Torres AUS–PNG, Korea JPN–KOR, Nemuro/La Pérouse JPN–RUS (?), Bering USA–RUS,
Florida USA–CUB, Windward CUB–HTI, Yucatán CUB–MEX, Jamaica Channel JAM–HTI, Columbus Channel TTO–VEN, Skagerrak DNK–NOR,
Balabac PHL–MYS (?), Martinique Channel DMA–LCA, Saint Vincent Passage LCA–VCT. Rule: a named strait/channel/passage between
two playable countries, short crossing, and not already a land link (so Øresund, Fehmarn, Åland and Gibraltar are **not**
listed: they are land links here). Every strait is also a sea link, so `maritime` still covers it.

**Disputed connections (3), additions to the baseline:** Morocco–Mauritania (Western Sahara, Guerguerat crossing), Spain–UK
(Gibraltar land border), Serbia–Albania (via Kosovo, which is not a node of this dataset).

**Uncertain, flagged (?) and decisions for the project owner:**
1. *Baseline land links on disputed land* (Ceuta/Melilla ESP–MAR, Golan ISR–SYR, Aksai Chin CHN–IND, Kashmir IND–PAK,
   Abkhazia/South Ossetia GEO–RUS, Nagorno-Karabakh ARM–AZE, Crimea RUS–UKR) stay ordinary land links in every game, because
   removing them would rewrite published dailies. They are documented in `DISPUTED_BASELINE_LAND`. Moving any of them to the
   disputes list (so that *Disabled* also cuts it) is a one-line change plus a regeneration of the affected future dailies.
2. *Considered and rejected:* India–Afghanistan (a claim over Gilgit-Baltistan with no border crossing), Canada–Denmark /
   Hans Island (settled in 2022), Cyprus–Turkey (no shared boundary).
3. *Kuril Islands* (JPN–RUS strait) and *Sabah* (PHL–MYS strait) are themselves territorial claims; they are listed as straits
   because the strait exists regardless of the claim.

### Sea-link audit (`npm run data:audit-sea`)
Each curated sea pair is measured on the real coastlines (`sea-audit.json`). Crossings over `SEA_DISTANCE_LIMIT_KM` must be
a documented entry of `SEA_DISTANCE_EXCEPTIONS` (with a reason): remote island states and links required by already-published
daily challenges (FJI–NZL, KIR–TUV, JAM–NIC, TON–WSM, FJI–VUT). `sea-links.test.ts` fails on an unaudited or unjustified link.
Pruning links changed gameplay, so `DATASET_VERSION` is `2026.2`; `npm run data:revalidate-daily` checks every published day
still validates (invalid *future* days were regenerated; past and today's days were never touched).

## Tests guarding the data
France–Spain/Germany land; France–UK sea only; France–Brazil none; bidirectionality; maritime on/off; Luxembourg's three
neighbours; main land component membership; 195 countries; metadata completeness.

## Known limitations
Natural Earth 1:50m is coarse for microstates (rendered as clickable dots when area < 12,000 km²). Antimeridian: geometries
are used as shipped (Russia/Fiji are pre-split); route lines connect country centres and do not wrap the Pacific.

## Display names, aliases and corrections
**Identity vs display.** A country's identity is its ISO 3166-1 alpha-3 `id` (e.g. `SWZ`). Everything persistent (discoveries,
history, daily challenges, exports, the graph) stores ids only, so renaming a *display* name can never break saved data.
French name, English name and aliases are separate fields; aliases include former and common names.

**Policy.** Use the name the country itself asks for (UN / national usage) when it is established; keep the common name when
both are current (e.g. "Birmanie" with alias "Myanmar", "Türkiye" with alias "Turkey"); never use display names as keys.
Every replaced name stays searchable as an alias. Corrections live in `src/data/countries-meta.ts` (`NAME_OVERRIDES`,
`CAPITAL_OVERRIDES`, `ALIASES`) and are applied by `npm run data:build`, which also removes duplicate, redundant (equal to the
country's own name) and ambiguous (shared by two countries) auto-imported aliases. Curated aliases are always kept.

| id | field | before | after | why |
|---|---|---|---|---|
| SWZ | name (fr) | Swaziland | **Eswatini** | renamed 2018 |
| CPV | name (fr) | Îles du Cap-Vert | **Cap-Vert** | the state, not the archipelago |
| CPV | name (en) | Cape Verde | **Cabo Verde** | official name since 2013 |
| CIV | name (fr, en) | Côte d'Ivoire / Ivory Coast | **Côte d’Ivoire** | the country's requested name in every language; typographic apostrophe |
| PLW | name (fr) | Palaos (Palau) | **Palaos** | gloss removed |
| SUR | name (fr) | Surinam | **Suriname** | old French spelling |
| SAU | name (fr) | Arabie Saoudite | **Arabie saoudite** | French capitalisation |
| COD | name (fr) | Congo (Rép. dém.) | **RD Congo** | catalogue abbreviation |
| TLS | name (fr) | Timor oriental | **Timor-Leste** | official name since 2002 |
| SWZ | capital (en) | Lobamba | **Mbabane** | fr/en disagreed; Mbabane is the administrative capital (Lobamba: legislative) |
| LKA | capital (fr) | Sri Jayawardenapura Kotte | **Colombo** | fr/en disagreed; Colombo is the seat of government and commonly used |

Reviewed and kept: Biélorussie (alias Bélarus), Birmanie / Myanmar, Türkiye / Turquie, Czechia / Tchéquie, North Macedonia /
Macédoine du Nord, Cité du Vatican, Kiev (alias Kyiv), Viêt Nam, Salvador (alias El Salvador). Tests (`features.test.ts`)
assert the corrections, that former names still resolve (Swaziland, Cape Verde, Ivory Coast, Surinam, Palau, Timor oriental,
Turkey…), that names are unique per language and clean, that aliases never collide, that ids are unchanged, that a pre-rename
save still imports, and that every published daily challenge still validates.
