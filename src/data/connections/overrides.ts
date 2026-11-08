/**
 * Reviewed adjustments applied on top of the `world-countries` border list.
 * Every entry documents WHY it exists. Never edit land.json by hand: edit this file
 * and run `npm run data:build`.
 */
export type EdgePair = readonly [string, string, string];

/** Edges present in the source data that must NOT be playable land connections. */
export const LAND_REMOVALS: readonly EdgePair[] = [
  ["FRA", "BRA", "French Guiana is an overseas region, not part of the playable France node."],
  ["FRA", "SUR", "French Guiana is an overseas region, not part of the playable France node."],
  ["FRA", "NLD", "Saint-Martin / Sint Maarten island: overseas territories, excluded."],
  ["LKA", "IND", "Palk Strait is a maritime boundary; the source lists it as a land border."],
];

/** Land edges missing in the source data. */
export const LAND_ADDITIONS: readonly EdgePair[] = [
  ["DNK", "SWE", "Øresund Bridge: permanent fixed road/rail link."],
  ["BHR", "SAU", "King Fahd Causeway: permanent fixed road link."],
  ["SGP", "MYS", "Johor–Singapore Causeway and Second Link: permanent fixed road link."],
];

/**
 * Curated SEA connections (only active when maritime rules are enabled).
 * Criteria: recognised strait, short crossing (<~400 km), regular ferry/shipping link,
 * or neighbouring states of the same archipelago. Pairs are normalised and stored once.
 */
export const SEA_CONNECTIONS: readonly EdgePair[] = [
  // Western & Northern Europe
  ["GBR", "FRA", "English Channel / Channel Tunnel crossing"],
  ["GBR", "BEL", "North Sea ferries (Hull–Zeebrugge)"],
  ["GBR", "NLD", "North Sea ferries (Harwich–Hook of Holland)"],
  ["GBR", "ISL", "North Atlantic link via Faroe-Shetland corridor"],
  ["DNK", "NOR", "Skagerrak"],
  ["DNK", "SWE", "Øresund / Kattegat"],
  ["SWE", "FIN", "Gulf of Bothnia, Åland ferries"],
  ["FIN", "EST", "Gulf of Finland (Helsinki–Tallinn)"],
  ["SWE", "DEU", "Baltic Sea (Trelleborg–Rostock)"],
  ["SWE", "POL", "Baltic Sea (Karlskrona–Gdynia)"],
  ["SWE", "LTU", "Baltic Sea (Karlshamn–Klaipėda)"],
  ["DNK", "DEU", "Fehmarn Belt"],
  // Mediterranean
  ["ITA", "MLT", "Sicily–Malta Channel"],
  ["MLT", "LBY", "Central Mediterranean"],
  ["MLT", "TUN", "Central Mediterranean"],
  ["ITA", "TUN", "Strait of Sicily"],
  ["ITA", "ALB", "Strait of Otranto"],
  ["ITA", "HRV", "Adriatic Sea"],
  ["ITA", "GRC", "Ionian Sea (Brindisi–Patras)"],
  ["ESP", "DZA", "Western Mediterranean (Almería–Oran)"],
  ["ESP", "ITA", "Western Mediterranean ferries (Barcelona–Genoa)"],
  ["FRA", "ITA", "Ligurian Sea"],
  ["CYP", "TUR", "Eastern Mediterranean"],
  ["CYP", "SYR", "Eastern Mediterranean"],
  ["CYP", "LBN", "Eastern Mediterranean"],
  ["CYP", "ISR", "Eastern Mediterranean"],
  ["CYP", "GRC", "Aegean–Eastern Mediterranean"],
  ["CYP", "EGY", "Eastern Mediterranean"],
  ["GRC", "EGY", "Eastern Mediterranean (Crete corridor)"],
  ["GRC", "LBY", "Libyan Sea (Crete corridor)"],
  // Black Sea & Caspian
  ["TUR", "UKR", "Black Sea"],
  ["TUR", "ROU", "Black Sea"],
  ["TUR", "RUS", "Black Sea"],
  ["BGR", "UKR", "Black Sea"],
  ["GEO", "UKR", "Black Sea"],
  ["AZE", "KAZ", "Caspian Sea"],
  ["AZE", "TKM", "Caspian Sea"],
  ["IRN", "RUS", "Caspian Sea"],
  ["IRN", "KAZ", "Caspian Sea"],
  ["KAZ", "TKM", "Caspian Sea"],
  // Red Sea, Gulf, Arabian Sea
  ["EGY", "SAU", "Strait of Tiran / Red Sea"],
  ["EGY", "JOR", "Gulf of Aqaba"],
  ["SAU", "SDN", "Red Sea"],
  ["SAU", "ERI", "Red Sea"],
  ["YEM", "DJI", "Bab-el-Mandeb"],
  ["YEM", "ERI", "Bab-el-Mandeb / Red Sea"],
  ["YEM", "SOM", "Gulf of Aden"],
  ["BHR", "QAT", "Gulf of Bahrain"],
  ["IRN", "ARE", "Persian Gulf"],
  ["IRN", "OMN", "Strait of Hormuz"],
  ["IRN", "BHR", "Persian Gulf"],
  ["IRN", "QAT", "Persian Gulf"],
  ["IRN", "KWT", "Persian Gulf"],
  ["OMN", "ARE", "Gulf of Oman"],
  // Indian Ocean
  ["IND", "LKA", "Palk Strait"],
  ["IND", "MDV", "Laccadive Sea"],
  ["MDG", "MOZ", "Mozambique Channel"],
  ["MDG", "COM", "Mozambique Channel"],
  ["COM", "MOZ", "Mozambique Channel"],
  ["COM", "TZA", "Indian Ocean"],
  ["MUS", "MDG", "Indian Ocean (Mascarene link)"],
  ["SYC", "MDG", "Indian Ocean"],
  // Atlantic Africa
  ["CPV", "SEN", "Atlantic Ocean"],
  ["STP", "GAB", "Gulf of Guinea"],
  ["STP", "GNQ", "Gulf of Guinea"],
  // East & South-East Asia
  ["JPN", "KOR", "Korea Strait"],
  ["JPN", "PRK", "Sea of Japan"],
  ["JPN", "RUS", "La Pérouse Strait / Sea of Japan"],
  ["JPN", "CHN", "East China Sea"],
  ["KOR", "CHN", "Yellow Sea"],
  ["SGP", "IDN", "Singapore Strait"],
  ["PHL", "MYS", "Sulu / Celebes Sea"],
  ["PHL", "IDN", "Celebes Sea"],
  ["PHL", "JPN", "Luzon Strait / Philippine Sea"],
  ["BRN", "PHL", "Sulu Sea"],
  ["IDN", "AUS", "Timor Sea / Arafura Sea"],
  ["TLS", "AUS", "Timor Sea"],
  ["PLW", "IDN", "Western Pacific"],
  ["PLW", "FSM", "Western Pacific"],
  // Oceania
  ["AUS", "PNG", "Torres Strait"],
  ["AUS", "NZL", "Tasman Sea"],
  ["PNG", "SLB", "Solomon Sea"],
  ["SLB", "VUT", "Coral Sea"],
  ["VUT", "FJI", "Coral Sea"],
  ["FJI", "TON", "South Pacific"],
  ["FJI", "TUV", "South Pacific"],
  ["TON", "WSM", "South Pacific"],
  ["MHL", "KIR", "Micronesia"],
  ["KIR", "NRU", "Micronesia"],
  // Caribbean & Americas
  ["USA", "CUB", "Straits of Florida"],
  ["USA", "BHS", "Straits of Florida"],
  ["USA", "RUS", "Bering Strait"],
  ["CUB", "BHS", "Old Bahama Channel"],
  ["CUB", "HTI", "Windward Passage"],
  ["CUB", "JAM", "Cayman Trench"],
  ["CUB", "MEX", "Yucatán Channel"],
  ["JAM", "HTI", "Jamaica Channel"],
  ["BHS", "HTI", "Caribbean"],
  ["DOM", "JAM", "Caribbean"],
  ["DOM", "BHS", "Caribbean"],
  ["KNA", "ATG", "Leeward Islands"],
  ["ATG", "DMA", "Leeward Islands"],
  ["DMA", "LCA", "Martinique Channel"],
  ["LCA", "VCT", "Windward Islands"],
  ["LCA", "BRB", "Caribbean"],
  ["VCT", "GRD", "Grenadines"],
  ["VCT", "BRB", "Caribbean"],
  ["GRD", "TTO", "Caribbean"],
  ["TTO", "VEN", "Gulf of Paria"],
  ["TTO", "GUY", "Caribbean"],
  ["TTO", "BRB", "Caribbean"],
  // Kept because a PUBLISHED daily challenge depends on them (see SEA_DISTANCE_EXCEPTIONS)
  ["FJI", "NZL", "South Pacific"],
  ["KIR", "TUV", "Micronesia"],
  ["JAM", "NIC", "Caribbean Sea"],
];

/**
 * Sea links whose crossing exceeds 500 km. The limit is enforced by a test against the measured coastline distances
 * (src/data/connections/sea-audit.json, produced by `npm run data:audit-sea`). Each exception exists because the island
 * state would otherwise be cut off from the whole graph, and it is the NEAREST playable neighbour.
 */
export const SEA_DISTANCE_LIMIT_KM = 500;
export const SEA_DISTANCE_EXCEPTIONS: readonly EdgePair[] = [
  ["MDG", "SYC", "Seychelles: remote archipelago, Madagascar is its nearest playable neighbour (~1,060 km)."],
  ["MDG", "MUS", "Mauritius: remote island, Madagascar is its nearest playable neighbour (~870 km)."],
  ["GBR", "ISL", "Iceland: remote island, the British Isles are its nearest playable neighbours (~790 km)."],
  ["AUS", "NZL", "New Zealand: the Tasman Sea crossing to Australia is the only link of the country (~620 km)."],
  ["CPV", "SEN", "Cabo Verde: Senegal is its nearest mainland neighbour (~570 km)."],
  ["TON", "WSM", "Samoa: Tonga is its nearest playable neighbour and its only link (~550 km)."],
  ["FJI", "VUT", "The only link joining Melanesia (Vanuatu) to the Fiji / Polynesia group (~515 km)."],
  ["FJI", "NZL", "Published daily 2026-11-08 (regional) is solved through it; also New Zealand's link to the Fiji group (~1,420 km). Candidate for removal once that date is history."],
  ["KIR", "TUV", "Published daily 2026-11-08 (regional) is solved through it; also the link joining Kiribati / Marshall Islands / Nauru to the rest (~810 km)."],
  ["JAM", "NIC", "Published daily 2026-11-06 (constraints) is solved through it (~630 km). Candidate for removal once that date is history."],
];

/**
 * STRAIT crossings: pairs of playable countries facing each other across a NAMED strait (or channel/passage) with a short
 * crossing, usable when the game option "straits" is on. They are independent of the maritime option: turning straits on
 * enables exactly this list and no other sea link.
 *
 * Selection rule: a recognised strait whose two shores belong to two different playable countries, and that is not
 * already an ordinary land link (so Øresund DNK–SWE, Fehmarn DNK–DEU, Åland SWE–FIN and Gibraltar ESP–MAR are NOT listed:
 * they are land links in this dataset). Every pair is also a curated sea link, so `maritime` still covers them.
 * Uncertain entries are marked (?) and discussed in docs/GEOGRAPHIC_DATA.md.
 */
export const STRAIT_CONNECTIONS: readonly EdgePair[] = [
  ["GBR", "FRA", "Strait of Dover (Pas de Calais): ~34 km, Channel Tunnel"],
  ["ITA", "ALB", "Strait of Otranto: ~72 km between Apulia and Albania"],
  ["ITA", "TUN", "Strait of Sicily: ~145 km between Sicily and Tunisia"],
  ["IRN", "OMN", "Strait of Hormuz: between Iran and Oman's Musandam exclave"],
  ["YEM", "DJI", "Bab-el-Mandeb: ~30 km between Yemen (Perim) and Djibouti"],
  ["EGY", "SAU", "Strait of Tiran: between Sinai (Egypt) and Saudi Arabia"],
  ["IND", "LKA", "Palk Strait: ~55 km between India and Sri Lanka"],
  ["SGP", "IDN", "Singapore Strait: ~20 km to the Riau Islands (Indonesia)"],
  ["AUS", "PNG", "Torres Strait: ~150 km between Cape York and Papua New Guinea"],
  ["JPN", "KOR", "Korea Strait (Tsushima Strait): ~50 km between Tsushima (Japan) and Korea"],
  ["JPN", "RUS", "(?) Nemuro / La Pérouse Straits: Hokkaido to Sakhalin and the Kuril Islands (Russia). The Kurils are disputed by Japan."],
  ["USA", "RUS", "Bering Strait: ~85 km between Alaska and Chukotka"],
  ["USA", "CUB", "Straits of Florida: ~150 km between Key West and Cuba"],
  ["CUB", "HTI", "Windward Passage: ~80 km between Cuba and Haiti"],
  ["CUB", "MEX", "Yucatán Channel: ~200 km between Cuba and Mexico"],
  ["JAM", "HTI", "Jamaica Channel: ~190 km between Jamaica and Haiti"],
  ["TTO", "VEN", "Columbus Channel / Dragon's Mouth: ~15–25 km between Trinidad and Venezuela"],
  ["DNK", "NOR", "Skagerrak: strait between Denmark (Jutland) and Norway"],
  ["PHL", "MYS", "(?) Balabac Strait: ~50 km between Palawan (Philippines) and Sabah (Malaysia). Sabah is claimed by the Philippines."],
  ["DMA", "LCA", "Martinique Channel (Dominica Channel to Saint Lucia): ~45 km, Martinique itself is French and not playable"],
  ["LCA", "VCT", "Saint Vincent Passage: ~40 km between Saint Lucia and Saint Vincent"],
];

/**
 * DISPUTED connections: links that exist only through territory whose sovereignty or control is contested, usable when
 * the game option "territorial disputes" is on. They are ADDITIONS to the baseline: nothing in this list is a land link in
 * the default graph. Every entry states what is disputed. Never add a pair merely because a claim exists: a link is listed
 * only when there is an actual border crossing or land boundary on the ground.
 *
 * Deliberately NOT listed (see docs/GEOGRAPHIC_DATA.md): India–Afghanistan (a claim on Gilgit-Baltistan with no border
 * crossing), Canada–Denmark / Hans Island (settled in 2022), Cyprus–Turkey (no shared boundary).
 */
export const DISPUTED_CONNECTIONS: readonly EdgePair[] = [
  ["MAR", "MRT", "Western Sahara: Morocco administers most of the territory and the only Morocco–Mauritania crossing (Guerguerat) lies in it. Its status is undecided (UN non-self-governing territory)."],
  ["ESP", "GBR", "Gibraltar: a British Overseas Territory claimed by Spain; the land border at La Línea is a real crossing. The playable GBR node does not include overseas territories, so this link exists only when disputes are on."],
  ["SRB", "ALB", "Kosovo: declared independence in 2008 and is not a node of this dataset; Serbia and Albania only touch through it. Serbia does not recognise Kosovo's independence."],
];

/**
 * Baseline LAND links that rest on territory whose sovereignty is disputed. They are kept as ordinary land links in every
 * game (changing them would rewrite published daily challenges); this list only documents them, a test keeps it honest,
 * and it is the place to move an entry from if the project decides otherwise.
 */
export const DISPUTED_BASELINE_LAND: readonly EdgePair[] = [
  ["ESP", "MAR", "Ceuta and Melilla (Spanish enclaves claimed by Morocco)"],
  ["ISR", "SYR", "Golan Heights (Israeli-administered, claimed by Syria)"],
  ["CHN", "IND", "Aksai Chin and Arunachal Pradesh"],
  ["IND", "PAK", "Kashmir"],
  ["GEO", "RUS", "Abkhazia and South Ossetia (Russian-backed separatist regions of Georgia)"],
  ["ARM", "AZE", "Nagorno-Karabakh and exclaves"],
  ["RUS", "UKR", "Crimea and the occupied regions"],
];
