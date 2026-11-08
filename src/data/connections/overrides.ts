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
