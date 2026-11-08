import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REGION_DEFS } from "@/data/regions";
import { DAILY_DIFFICULTY } from "@/lib/daily-schedule";
import { generate, generateWithRetry, historyEntry, validateChallenge } from "@/lib/generate";
import { solve } from "../pathfinding";
import { attemptsFor } from "../difficulty";
import { graph } from "@/lib/atlas";
import type { HistoryEntry } from "../generator/diversity";
import type { Challenge, Difficulty, GameMode } from "../types";
import fr from "@/i18n/messages/fr.json";
import en from "@/i18n/messages/en.json";

const modes: GameMode[] = ["classic", "constraints", "regional"];
const diffs: Difficulty[] = ["easy", "normal", "hard"];

describe("challenge generator", () => {
  it("never publishes an impossible challenge and applies the attempts formula", () => {
    let produced = 0;
    for (const mode of modes)
      for (const difficulty of diffs)
        for (let i = 0; i < 4; i++) {
          const region = mode === "regional" ? REGION_DEFS[(i * 4 + diffs.indexOf(difficulty)) % REGION_DEFS.length].id : undefined;
          const g = generateWithRetry({ mode, difficulty, region, seed: `t${i}`, candidates: 80 });
          if (!g) continue;
          produced++;
          const ch = g.challenge;
          expect(validateChallenge(ch), `${mode}/${difficulty}/${region}`).toBe(true);
          expect(ch.attempts).toBe(attemptsFor(ch.minIntermediate, difficulty));
          expect(ch.minIntermediate).toBeGreaterThanOrEqual(mode === "regional" ? 1 : 2);
          if (mode === "constraints") {
            const r = ch.rules;
            const n = [r.maritime, r.forbidden.length > 0, r.mandatory.length > 0, r.minCoastal, r.minIsland, r.maxIntermediate, r.requireRegion, r.avoidRegion].filter(Boolean).length;
            expect(n).toBeGreaterThanOrEqual(1);
            expect(n).toBeLessThanOrEqual(4);
          }
          if (mode === "regional") for (const c of [ch.start, ch.destination]) expect(graph.regionMembers(region!).has(c)).toBe(true);
        }
    expect(produced).toBeGreaterThanOrEqual(30);
  }, 60000);

  it("is deterministic for identical inputs", () => {
    const a = generate({ mode: "classic", difficulty: "normal", seed: "same", candidates: 100 });
    const b = generate({ mode: "classic", difficulty: "normal", seed: "same", candidates: 100 });
    expect(a?.challenge).toEqual(b?.challenge);
    const c = generate({ mode: "classic", difficulty: "normal", seed: "other", candidates: 100 });
    expect(c?.challenge.id).not.toBe(a?.challenge.id);
  });

  it("diversity scoring spreads challenges across the world", () => {
    const history: HistoryEntry[] = [];
    const pairs = new Set<string>();
    const countries = new Set<string>();
    for (let i = 0; i < 24; i++) {
      const g = generateWithRetry({ mode: "classic", difficulty: "normal", seed: `d${i}`, candidates: 150 }, history)!;
      history.push(historyEntry(g.challenge, g.route));
      pairs.add([g.challenge.start, g.challenge.destination].sort().join());
      g.route.forEach((c) => countries.add(c));
    }
    expect(pairs.size).toBe(24);
    expect(countries.size).toBeGreaterThan(40);
  }, 60000);
});

describe("published daily challenges", () => {
  const dir = path.resolve(__dirname, "../../../public/daily");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];

  it("exist for a long range with three challenges per day", () => {
    expect(files.length).toBeGreaterThan(30);
  });
  it("are stable, valid, versioned and follow the fixed schedule", () => {
    for (const f of files.filter((_, i) => i % 9 === 0)) {
      const day = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { date: string; rulesVersion: string; datasetVersion: string; challenges: Challenge[] };
      expect(day.date).toBe(f.slice(0, 10));
      expect(day.challenges.map((c) => c.mode)).toEqual(["classic", "constraints", "regional"]);
      const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
      for (const ch of day.challenges) {
        expect(ch.id).toBe(`daily-${day.date}-${ch.mode}`);
        expect(ch.difficulty).toBe(DAILY_DIFFICULTY[ch.mode][weekday]);
        expect(ch.date).toBe(day.date);
        expect(ch.rulesVersion && ch.datasetVersion).toBeTruthy();
        expect(solve(graph, ch).minIntermediate).toBe(ch.minIntermediate);
      }
    }
  }, 60000);
});

describe("i18n catalogs", () => {
  const keys = (o: unknown, p = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  it("French and English define exactly the same keys", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });
  it("every UN subregion in the data has a translation", () => {
    const slug = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, "-");
    const sub = Object.keys((fr as { subregions: object }).subregions);
    for (const c of graph.countries.values()) expect(sub, c.region).toContain(slug(c.region));
  });
});
