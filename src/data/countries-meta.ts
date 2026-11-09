/** Hand-curated metadata used by the data build. See docs/GEOGRAPHIC_DATA.md. */
export const CONTINENT_OVERRIDES: Record<string, string> = {
  RUS: "europe", TUR: "asia", KAZ: "asia", GEO: "asia", ARM: "asia", AZE: "asia",
  CYP: "europe", EGY: "africa",
};

/** Countries treated as islands in addition to those with zero land borders (shared islands). */
export const ISLAND_OVERRIDES = new Set(["IRL", "GBR", "HTI", "DOM", "PNG", "IDN", "TLS", "BRN"]);

export const ALIASES: Record<string, { fr: string[]; en: string[] }> = {
  UKR: { fr: ["kyiv"], en: ["kyiv"] },
  SLV: { fr: ["el salvador"], en: [] },
  FSM: { fr: ["etats federes de micronesie"], en: ["federated states of micronesia"] },
  TUR: { fr: ["turkiye", "türkiye"], en: ["turkey"] },
  SUR: { fr: ["surinam"], en: ["surinam"] },
  PLW: { fr: ["palau"], en: ["belau"] },
  USA: { fr: ["etats-unis", "états unis", "usa", "amerique"], en: ["usa", "us", "united states", "america"] },
  GBR: { fr: ["royaume uni", "angleterre", "grande-bretagne", "ecosse", "écosse"], en: ["uk", "great britain", "britain", "england", "scotland", "wales"] },
  ARE: { fr: ["emirats", "eau"], en: ["uae", "emirates"] },
  COD: { fr: ["rdc", "congo kinshasa", "congo-kinshasa", "republique democratique du congo", "république démocratique du congo"], en: ["drc", "congo kinshasa", "democratic republic of the congo"] },
  COG: { fr: ["congo brazzaville", "congo-brazzaville"], en: ["congo brazzaville", "republic of the congo"] },
  CIV: { fr: ["cote d'ivoire", "côte d’ivoire"], en: ["ivory coast"] },
  CZE: { fr: ["tchequie", "république tchèque"], en: ["czechia", "czech"] },
  MMR: { fr: ["birmanie"], en: ["burma"] },
  SWZ: { fr: ["swaziland"], en: ["swaziland", "eswatini"] },
  MKD: { fr: ["macedoine", "république de macédoine du nord"], en: ["macedonia"] },
  TLS: { fr: ["timor-leste", "timor leste", "timor"], en: ["east timor", "timor"] },
  UNK: { fr: ["kosova"], en: ["kosova"] },
  KOR: { fr: ["coree du sud"], en: ["south korea"] },
  PRK: { fr: ["coree du nord"], en: ["north korea"] },
  VAT: { fr: ["vatican", "saint-siege", "saint siège"], en: ["vatican", "holy see"] },
  PSE: { fr: ["cisjordanie", "gaza"], en: ["west bank", "gaza"] },
  RUS: { fr: ["russie"], en: ["russia"] },
  BLR: { fr: ["bielorussie", "bélarus"], en: ["belarus", "byelorussia"] },
  NLD: { fr: ["hollande"], en: ["holland"] },
  CPV: { fr: ["cap vert", "cabo verde", "îles du cap-vert", "iles du cap vert"], en: ["cape verde"] },
};

export const CAPITAL_FR: Record<string, string> = {
  AFG: "Kaboul", ZAF: "Pretoria", DEU: "Berlin", SAU: "Riyad", DZA: "Alger", AUT: "Vienne",
  BEL: "Bruxelles", BLR: "Minsk", BRA: "Brasilia", BGR: "Sofia", KHM: "Phnom Penh", CHN: "Pékin",
  CYP: "Nicosie", COL: "Bogota", KOR: "Séoul", HRV: "Zagreb", DNK: "Copenhague", EGY: "Le Caire",
  ARE: "Abou Dabi", ESP: "Madrid", EST: "Tallinn", USA: "Washington", FIN: "Helsinki", GRC: "Athènes",
  HUN: "Budapest", IND: "New Delhi", IRN: "Téhéran", IRQ: "Bagdad", IRL: "Dublin", ISL: "Reykjavik",
  ISR: "Jérusalem", ITA: "Rome", JPN: "Tokyo", JOR: "Amman", KAZ: "Astana", KEN: "Nairobi",
  KWT: "Koweït", LBN: "Beyrouth", LBY: "Tripoli", LTU: "Vilnius", LUX: "Luxembourg", MAR: "Rabat",
  MEX: "Mexico", MDA: "Chisinau", MNG: "Oulan-Bator", NOR: "Oslo", NZL: "Wellington", NLD: "Amsterdam",
  PAK: "Islamabad", PRY: "Asunción", PER: "Lima", POL: "Varsovie", PRT: "Lisbonne", QAT: "Doha",
  ROU: "Bucarest", GBR: "Londres", RUS: "Moscou", SRB: "Belgrade", SGP: "Singapour", SVK: "Bratislava",
  SVN: "Ljubljana", SWE: "Stockholm", CHE: "Berne", SYR: "Damas", CZE: "Prague", THA: "Bangkok",
  TUN: "Tunis", TUR: "Ankara", UKR: "Kiev", VNM: "Hanoï", FRA: "Paris", MLT: "La Valette",
  MCO: "Monaco", VAT: "Vatican", CUB: "La Havane", ETH: "Addis-Abeba", GEO: "Tbilissi", ARM: "Erevan",
  AZE: "Bakou", UZB: "Tachkent", TKM: "Achgabat", TJK: "Douchanbé", KGZ: "Bichkek", NPL: "Katmandou",
  LKA: "Colombo", MMR: "Naypyidaw", PRK: "Pyongyang", PHL: "Manille", IDN: "Jakarta",
  TLS: "Dili", SOM: "Mogadiscio", SDN: "Khartoum", SSD: "Djouba", COD: "Kinshasa", COG: "Brazzaville",
  CMR: "Yaoundé", CIV: "Yamoussoukro", GHA: "Accra", SEN: "Dakar", MLI: "Bamako", NER: "Niamey",
  TCD: "N'Djamena", MRT: "Nouakchott", AGO: "Luanda", ZMB: "Lusaka", ZWE: "Harare", MOZ: "Maputo",
  MDG: "Antananarivo", NAM: "Windhoek", BWA: "Gaborone", TZA: "Dodoma", UGA: "Kampala", RWA: "Kigali",
  BDI: "Gitega", GNQ: "Malabo", GAB: "Libreville", STP: "São Tomé", CPV: "Praia", COM: "Moroni",
  SYC: "Victoria", MUS: "Port-Louis", DJI: "Djibouti", ERI: "Asmara", LSO: "Maseru", SWZ: "Mbabane",
  MWI: "Lilongwe", BEN: "Porto-Novo", TGO: "Lomé", BFA: "Ouagadougou", GIN: "Conakry", GNB: "Bissau",
  GMB: "Banjul", SLE: "Freetown", LBR: "Monrovia", CAF: "Bangui", NGA: "Abuja", YEM: "Sanaa",
  OMN: "Mascate", BHR: "Manama", MKD: "Skopje", UNK: "Pristina", ALB: "Tirana", BIH: "Sarajevo", MNE: "Podgorica",
  LVA: "Riga", AND: "Andorre-la-Vieille", LIE: "Vaduz", SMR: "Saint-Marin", ECU: "Quito", BOL: "Sucre",
  VEN: "Caracas", SUR: "Paramaribo", GUY: "Georgetown", CHL: "Santiago", ARG: "Buenos Aires",
  URY: "Montevideo", PAN: "Panama", CRI: "San José", NIC: "Managua", HND: "Tegucigalpa",
  SLV: "San Salvador", GTM: "Guatemala", BLZ: "Belmopan", HTI: "Port-au-Prince", DOM: "Saint-Domingue",
  JAM: "Kingston", BHS: "Nassau", BRB: "Bridgetown", TTO: "Port-d'Espagne", LCA: "Castries",
  VCT: "Kingstown", GRD: "Saint-Georges", DMA: "Roseau", ATG: "Saint John's", KNA: "Basseterre",
  CAN: "Ottawa", AUS: "Canberra", PNG: "Port Moresby", FJI: "Suva", WSM: "Apia", TON: "Nukuʻalofa",
  VUT: "Port-Vila", SLB: "Honiara", KIR: "Tarawa-Sud", MHL: "Majuro", FSM: "Palikir", PLW: "Ngerulmud",
  NRU: "Yaren", TUV: "Funafuti", MDV: "Malé", BTN: "Thimphou", BGD: "Dacca", LAO: "Vientiane",
  MYS: "Kuala Lumpur", BRN: "Bandar Seri Begawan", PSE: "Ramallah",
};

/**
 * Reviewed display-name corrections (IDs, i.e. ISO 3166-1 alpha-3 codes, NEVER change, so saved progress, daily
 * challenges, history and exports are unaffected). The replaced source name is automatically kept as a search alias.
 * See docs/GEOGRAPHIC_DATA.md for the rationale of each entry.
 */
export const NAME_OVERRIDES: Record<string, { fr?: string; en?: string }> = {
  SWZ: { fr: "Eswatini" }, // renamed in 2018 (French source still said "Swaziland")
  CPV: { fr: "Cap-Vert", en: "Cabo Verde" }, // "Îles du Cap-Vert" is not the state name; official name Cabo Verde since 2013
  CIV: { fr: "Côte d’Ivoire", en: "Côte d’Ivoire" }, // the country asked to use its French name in every language (typographic apostrophe)
  PLW: { fr: "Palaos" }, // "Palaos (Palau)" was a gloss, not a name
  SUR: { fr: "Suriname" }, // "Surinam" is the old spelling
  SAU: { fr: "Arabie saoudite" }, // French capitalisation rule for adjectives
  COD: { fr: "RD Congo" }, // "Congo (Rép. dém.)" was a catalogue abbreviation
  TLS: { fr: "Timor oriental" }, // the usual French name (East Timor); "Timor-Leste" stays searchable
};

/** Capitals corrected so that French and English agree. */
export const CAPITAL_OVERRIDES: Record<string, { fr?: string; en?: string }> = {
  SWZ: { fr: "Mbabane", en: "Mbabane" }, // administrative capital (Lobamba is the legislative/royal one)
  LKA: { fr: "Colombo", en: "Colombo" }, // largest city and seat of government (legislative: Sri Jayawardenepura Kotte)
};
