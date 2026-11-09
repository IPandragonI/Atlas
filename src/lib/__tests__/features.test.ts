import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { solve } from "@/engine/pathfinding";
import { normalizeText, searchCountries } from "@/engine/search";
import type { Challenge } from "@/engine/types";
import { COUNTRIES, graph, searchIndex } from "@/lib/atlas";
import {
  configFromChallenge, configToParams, defaultConfig, effectiveMap, genRequestFor, LIMITS, parseConfig, PRESET_MAP, replayParams, validateConfig,
  type GameConfig,
} from "@/lib/config";
import { validateImport } from "@/lib/db";
import { generate, generateForConfig, scopeFacts, validateChallenge } from "@/lib/generate";
import { remainingDailies, suggestAfterDaily } from "@/lib/replay";

const customConfig: GameConfig = {
  mode: "classic",
  difficulty: "custom",
  straits: false,
  disputes: false,
  scope: "europe",
  forbidden: ["DEU", "CHE"],
  minIntermediate: 4,
  attempts: 6,
  map: { start: false, borders: false, names: true, full: false },
};

describe("game configuration", () => {
  it("round-trips through URL parameters, including every custom setting", () => {
    const { config, seed, exclude } = parseConfig(configToParams(customConfig, "abc", ["FRA", "POL"]));
    expect(config).toEqual(customConfig);
    expect(seed).toBe("abc");
    expect(exclude).toEqual(["FRA", "POL"]);
  });
  it("standard difficulties do not serialise custom-only fields and use the presets", () => {
    const cfg = { ...defaultConfig("classic"), difficulty: "easy" as const };
    const q = configToParams(cfg, "s");
    expect(q.has("min") || q.has("att") || q.has("mfull")).toBe(false);
    expect(effectiveMap(parseConfig(q).config)).toEqual(PRESET_MAP.easy);
    expect(PRESET_MAP.easy.full).toBe(true);
    expect(PRESET_MAP.normal.full).toBe(false);
    expect(PRESET_MAP.hard.full).toBe(false);
  });
  it("sanitises invalid parameters instead of trusting them", () => {
    const { config } = parseConfig(new URLSearchParams("mode=nope&difficulty=wild&scope=atlantis&forbid=FRA,ZZZ,FRA,DEU&min=x&att=2.5"));
    expect(config.mode).toBe("classic");
    expect(config.difficulty).toBe("normal");
    expect(config.scope).toBe("world");
    expect(config.forbidden).toEqual(["FRA", "DEU"]);
    expect(config.attempts).toBe(8);
  });
  it("accepts the legacy region parameter and never allows the world as a regional scope", () => {
    expect(parseConfig(new URLSearchParams("mode=regional&region=balkans")).config.scope).toBe("balkans");
    expect(parseConfig(new URLSearchParams("mode=regional&scope=world")).config.scope).not.toBe("world");
  });
  it("validates custom settings", () => {
    expect(validateConfig(customConfig, 8)).toEqual([]);
    expect(validateConfig({ ...customConfig, attempts: 0 }, 8).map((i) => i.code)).toContain("attempts");
    expect(validateConfig({ ...customConfig, attempts: LIMITS.maxAttempts + 1 }, 8).map((i) => i.code)).toContain("attempts");
    expect(validateConfig({ ...customConfig, attempts: NaN }, 8).map((i) => i.code)).toContain("attempts");
    expect(validateConfig({ ...customConfig, minIntermediate: 0 }, 8).map((i) => i.code)).toContain("min");
    expect(validateConfig({ ...customConfig, minIntermediate: 9 }, 8)).toContainEqual({ code: "min", max: 8 });
    expect(validateConfig({ ...customConfig, difficulty: "hard", attempts: 0, minIntermediate: 99 }, 8)).toEqual([]); // custom-only fields ignored
  });
});

describe("replay with the same settings", () => {
  it("keeps the whole configuration but generates a different route", () => {
    for (const cfg of [defaultConfig("classic"), { ...defaultConfig("constraints"), difficulty: "hard" as const }, { ...defaultConfig("regional"), scope: "asia" }, customConfig]) {
      const first = generateForConfig(cfg, "first", [])!;
      expect(first, cfg.mode).toBeTruthy();
      const parsed = parseConfig(replayParams(cfg, first.challenge, "second"));
      expect(parsed.config).toEqual(parseConfig(configToParams(cfg, "x")).config);
      const again = generateForConfig(parsed.config, parsed.seed, [], parsed.exclude)!;
      expect(again, cfg.mode).toBeTruthy();
      const pair = (c: Challenge) => [c.start, c.destination].sort().join("-");
      expect(pair(again.challenge)).not.toBe(pair(first.challenge)); // never the same start/destination pair
      expect(again.challenge.mode).toBe(first.challenge.mode);
      expect(again.challenge.difficulty).toBe(first.challenge.difficulty);
      expect(again.challenge.rules.allowedRegion).toBe(first.challenge.rules.allowedRegion);
      if (cfg.difficulty === "custom") {
        expect(again.challenge.attempts).toBe(cfg.attempts);
        expect(again.challenge.minIntermediate).toBeGreaterThanOrEqual(cfg.minIntermediate);
      }
    }
  }, 60000);
  it("a replay of a restored daily derives its settings from the challenge", () => {
    const g = generate({ mode: "regional", difficulty: "hard", region: "balkans", seed: "d", candidates: 100 })!;
    const cfg = configFromChallenge(g.challenge);
    expect(cfg).toMatchObject({ mode: "regional", difficulty: "hard", scope: "balkans" });
    const again = generateForConfig(cfg, "other", [], [g.challenge.start, g.challenge.destination])!;
    expect(again.challenge.rules.allowedRegion).toBe("balkans");
    expect(again.challenge.id).not.toBe(g.challenge.id);
  });
  it("standard difficulty generation is unchanged by the configuration layer", () => {
    expect(generateForConfig(defaultConfig("classic"), "x", [])?.challenge).toEqual(generate({ mode: "classic", difficulty: "normal", seed: "x", candidates: 300 })?.challenge);
    expect(genRequestFor(defaultConfig("classic"), "x")).toEqual({ mode: "classic", difficulty: "normal", seed: "x", candidates: 300 });
  });
});

describe("daily completion: what to suggest next", () => {
  const D = "2026-11-08";
  const id = (m: string) => `daily-${D}-${m}`;
  it("suggests another daily that is not completed yet (classic done -> constraints first)", () => {
    expect(suggestAfterDaily(D, [], "classic")).toEqual({ kind: "daily", mode: "constraints" });
    expect(suggestAfterDaily(D, [id("constraints")], "classic")).toEqual({ kind: "daily", mode: "regional" });
    expect(suggestAfterDaily(D, [id("classic")], "constraints")).toEqual({ kind: "daily", mode: "regional" });
    expect(suggestAfterDaily(D, [id("regional")], "constraints")).toEqual({ kind: "daily", mode: "classic" });
  });
  it("suggests a new Classic game once all three dailies are completed", () => {
    expect(suggestAfterDaily(D, [id("classic"), id("constraints")], "regional")).toEqual({ kind: "classic" });
    expect(suggestAfterDaily(D, [id("constraints"), id("regional")], "classic")).toEqual({ kind: "classic" });
  });
  it("only counts completions of the same date and never lists the game just played", () => {
    expect(remainingDailies(D, ["daily-2026-11-07-constraints"], "classic")).toEqual(["constraints", "regional"]);
    expect(remainingDailies(D, [], "regional")).toEqual(["classic", "constraints"]);
  });
});

describe("custom difficulty, continents and forbidden countries", () => {
  const classic = (over: Partial<GameConfig>): GameConfig => ({ ...defaultConfig("classic"), ...over });

  it("respects the minimum route length and the attempts override", () => {
    for (const min of [2, 5, 8]) {
      const g = generateForConfig(classic({ difficulty: "custom", minIntermediate: min, attempts: 9 }), `min${min}`, [])!;
      expect(g, `min ${min}`).toBeTruthy();
      expect(g.challenge.minIntermediate).toBeGreaterThanOrEqual(min); // counted exactly like the solver: no off-by-one
      expect(solve(graph, g.challenge).minIntermediate).toBe(g.challenge.minIntermediate);
      expect(g.challenge.attempts).toBe(9);
      expect(g.challenge.difficulty).toBe("custom");
      expect(validateChallenge(g.challenge)).toBe(true);
    }
  });
  it("custom without an explicit attempts value falls back to the normal margin", () => {
    const g = generate({ mode: "classic", difficulty: "custom", minIntermediate: 3, seed: "m", candidates: 100 })!;
    expect(g.challenge.attempts).toBe(g.challenge.minIntermediate + 3);
  });
  it("continent scope keeps start, destination and the whole route inside the continent", () => {
    for (const continent of ["europe", "africa", "asia", "south-america"]) {
      for (const mode of ["classic", "constraints"] as const) {
        const g = generateForConfig({ ...defaultConfig(mode), scope: continent }, `c-${continent}`, [], undefined, 120);
        expect(g, `${mode}/${continent}`).toBeTruthy();
        const members = graph.regionMembers(continent);
        const ch = g!.challenge;
        expect(members.has(ch.start) && members.has(ch.destination)).toBe(true);
        expect(ch.rules.allowedRegion).toBe(continent);
        for (const r of solve(graph, ch).routes) expect(r.every((c) => members.has(c))).toBe(true);
        expect(validateChallenge(ch)).toBe(true);
      }
    }
  }, 60000);
  it("forbidden countries are never crossed, never the start and never the destination", () => {
    const forbidden = ["DEU", "RUS", "TUR"];
    for (const mode of ["classic", "constraints", "regional"] as const) {
      for (let i = 0; i < 4; i++) {
        const cfg = { ...defaultConfig(mode), forbidden, scope: mode === "regional" ? "europe" : "world" };
        const g = generateForConfig(cfg, `f${i}`, [], undefined, 120);
        expect(g, `${mode} ${i}`).toBeTruthy();
        const ch = g!.challenge;
        expect(forbidden).not.toContain(ch.start);
        expect(forbidden).not.toContain(ch.destination);
        expect(forbidden.every((f) => ch.rules.forbidden.includes(f))).toBe(true);
        const sol = solve(graph, ch);
        expect(sol.feasible).toBe(true);
        for (const r of sol.routes) for (const f of forbidden) expect(r).not.toContain(f);
      }
    }
  }, 60000);
  it("never generates an impossible challenge: returns null instead", () => {
    // Oceania has no land borders between its countries: a land-only game there is impossible
    expect(generateForConfig(classic({ scope: "oceania" }), "o", [])).toBeNull();
    // a route longer than anything that exists
    expect(generateForConfig(classic({ difficulty: "custom", minIntermediate: 40, attempts: 5 }), "long", [])).toBeNull();
    // forbidding everything but two non-neighbouring countries leaves no route at all
    const keep = new Set(["FRA", "POL"]);
    const forbidden = [...graph.regionMembers("europe")].filter((c) => !keep.has(c));
    expect(generateForConfig(classic({ scope: "europe", forbidden }), "none", [])).toBeNull();
    // an invalid attempts value is rejected
    expect(generate({ mode: "classic", difficulty: "custom", minIntermediate: 3, attempts: 0, seed: "a" })).toBeNull();
  });
  it("reports scope facts used by the configuration form", () => {
    const world = scopeFacts({ mode: "classic", scope: "world", forbidden: [] });
    expect(world.countries).toBe(196);
    expect(world.diameter).toBeGreaterThan(8);
    expect(scopeFacts({ mode: "classic", scope: "oceania", forbidden: [] }).diameter).toBe(0);
    const base = scopeFacts({ mode: "classic", scope: "europe", forbidden: [] }).countries;
    expect(scopeFacts({ mode: "classic", scope: "europe", forbidden: ["DEU", "FRA"] }).countries).toBe(base - 2);
    expect(validateConfig({ ...classic({ scope: "oceania" }), difficulty: "custom", minIntermediate: 1, attempts: 5 }, 0).map((i) => i.code)).toContain("min");
  });
});

describe("country names and data integrity", () => {
  const byId = (id: string) => COUNTRIES.find((c) => c.id === id)!;
  const top = (q: string) => searchCountries(searchIndex, q, null, "fr", 3).map((c) => c.id);

  it("French and English display names are corrected", () => {
    const expected: Record<string, [string, string]> = {
      SWZ: ["Eswatini", "Eswatini"],
      CPV: ["Cap-Vert", "Cabo Verde"],
      CIV: ["Côte d’Ivoire", "Côte d’Ivoire"],
      PLW: ["Palaos", "Palau"],
      SUR: ["Suriname", "Suriname"],
      SAU: ["Arabie saoudite", "Saudi Arabia"],
      COD: ["RD Congo", "DR Congo"],
      TLS: ["Timor oriental", "Timor-Leste"], // French: East Timor; "Timor-Leste" stays searchable
      MKD: ["Macédoine du Nord", "North Macedonia"],
      CZE: ["Tchéquie", "Czechia"],
      MMR: ["Birmanie", "Myanmar"],
      TUR: ["Turquie", "Türkiye"],
    };
    for (const [id, [fr, en]] of Object.entries(expected)) {
      expect(byId(id).name.fr, id).toBe(fr);
      expect(byId(id).name.en, id).toBe(en);
    }
  });
  it("Eswatini is displayed correctly in French (and nowhere as Swaziland)", () => {
    expect(byId("SWZ").name.fr).toBe("Eswatini");
    expect(COUNTRIES.filter((c) => c.name.fr === "Swaziland" || c.name.en === "Swaziland")).toEqual([]);
  });
  it("former and common names stay searchable", () => {
    expect(top("swaziland")[0]).toBe("SWZ");
    expect(top("cape verde")[0]).toBe("CPV");
    expect(top("îles du cap-vert")[0]).toBe("CPV");
    expect(top("ivory coast")[0]).toBe("CIV");
    expect(top("cote d ivoire")[0]).toBe("CIV");
    expect(top("surinam")[0]).toBe("SUR");
    expect(top("palau")[0]).toBe("PLW");
    expect(top("timor oriental")[0]).toBe("TLS");
    expect(top("congo kinshasa")[0]).toBe("COD");
    expect(top("turkey")[0]).toBe("TUR");
    expect(top("macedonia")[0]).toBe("MKD");
    expect(top("uk")[0]).toBe("GBR");
    expect(top("eswatini")[0]).toBe("SWZ");
  });
  it("names are clean: no stray spaces, glosses or duplicates inside a language", () => {
    for (const c of COUNTRIES) {
      for (const n of [c.name.fr, c.name.en, c.capital.fr, c.capital.en]) {
        expect(n, c.id).toBe(n.trim());
        expect(n, c.id).not.toMatch(/\s{2,}/);
        expect(n.length, c.id).toBeGreaterThan(1);
      }
      expect(c.name.fr, c.id).not.toMatch(/[()]/);
      expect(c.name.en, c.id).not.toMatch(/[()]/);
    }
    for (const lang of ["fr", "en"] as const) {
      const names = COUNTRIES.map((c) => c.name[lang]);
      expect(new Set(names).size).toBe(names.length);
    }
  });
  it("French and English agree on capitals that were inconsistent", () => {
    expect(byId("SWZ").capital).toEqual({ fr: "Mbabane", en: "Mbabane" });
    expect(byId("LKA").capital).toEqual({ fr: "Colombo", en: "Colombo" });
  });
  it("aliases are unique, non-redundant and never collide with another country's name", () => {
    const primary = new Map(COUNTRIES.flatMap((c) => [[normalizeText(c.name.fr), c.id] as const, [normalizeText(c.name.en), c.id] as const]));
    for (const c of COUNTRIES) {
      const all = [...(c.aliases?.fr ?? []), ...(c.aliases?.en ?? [])].map(normalizeText);
      expect(new Set(all).size, c.id).toBe(all.length);
      for (const a of all) {
        expect(a, c.id).not.toBe(normalizeText(c.name.fr));
        expect(a, c.id).not.toBe(normalizeText(c.name.en));
        expect(primary.get(a) ?? c.id, `${c.id} alias "${a}"`).toBe(c.id);
      }
    }
  });
  it("internal IDs are stable ISO codes, so saved progress, graph and exports are unaffected by renames", () => {
    expect(COUNTRIES).toHaveLength(196);
    for (const c of COUNTRIES) expect(c.id).toMatch(/^[A-Z]{3}$/);
    for (const id of ["SWZ", "CPV", "CIV", "PLW", "SUR", "SAU", "COD", "TLS"]) expect(graph.has(id)).toBe(true);
    expect(graph.connection("SWZ", "ZAF")).toBe("land");
    expect(graph.connection("SWZ", "MOZ")).toBe("land");
    // a pre-rename save that contains the Eswatini record still imports and resolves to the renamed country
    const old = validateImport(
      {
        app: "atlas", schemaVersion: 1,
        data: {
          discovered: [{ id: "SWZ", firstAt: 1, visits: 2 }],
          games: [{ challengeId: "c", mode: "classic", difficulty: "custom", status: "won", score: 400, finishedAt: 1, route: ["ZAF", "SWZ"], hintKinds: ["geographic", "letter"] }],
        },
      },
      new Set(COUNTRIES.map((c) => c.id)),
    );
    expect(old.ok).toBe(true);
    if (old.ok) {
      expect(byId(old.data.discovered[0].id).name.fr).toBe("Eswatini");
      expect(old.data.games[0].difficulty).toBe("custom");
      expect(old.data.games[0].hintKinds).toEqual(["geographic", "letter"]);
    }
  });
  it("every published daily challenge still resolves against the renamed dataset", () => {
    const dir = path.resolve(__dirname, "../../../public/daily");
    const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f));
    expect(files.length).toBeGreaterThan(300);
    for (const f of files.filter((_, i) => i % 7 === 0)) {
      const day = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { challenges: Challenge[] };
      for (const ch of day.challenges) {
        for (const id of [ch.start, ch.destination, ...ch.rules.forbidden, ...ch.rules.mandatory]) expect(graph.has(id), `${f} ${id}`).toBe(true);
        expect(validateChallenge(ch), `${f} ${ch.id}`).toBe(true);
      }
    }
  }, 60000);
});
