/**
 * Generator diagnostics: generates many challenges with a rolling history and prints frequency,
 * length, difficulty and repetition reports.
 *   npm run data:simulate -- [countPerCombo=60] [candidates=300]
 */
import { graph } from "../src/lib/atlas";
import { generate, historyEntry, validateChallenge } from "../src/lib/generate";
import { SUBREGION_IDS, CONTINENT_IDS } from "../src/data/regions";
import type { HistoryEntry } from "../src/engine/generator/diversity";
import type { Difficulty, GameMode } from "../src/engine/types";

const perCombo = Number(process.argv[2] ?? 60);
const candidates = Number(process.argv[3] ?? 300);
const modes: GameMode[] = ["classic", "constraints", "regional"];
const diffs: Difficulty[] = ["easy", "normal", "hard"];
const regions = [...CONTINENT_IDS, ...SUBREGION_IDS];

const history: HistoryEntry[] = [];
const freq = { country: new Map<string, number>(), continent: new Map<string, number>(), region: new Map<string, number>(), corridor: new Map<string, number>() };
const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const lenDist = new Map<string, number>();
const attemptsByDiff = new Map<string, number[]>();
let total = 0, failed = 0, invalid = 0, repeatsPair = 0, altSum = 0;
const seenPairs = new Set<string>();
const t0 = Date.now();

for (let i = 0; i < perCombo; i++) {
  for (const mode of modes) {
    for (const difficulty of diffs) {
      total++;
      const region = mode === "regional" ? regions[(i * 3 + diffs.indexOf(difficulty)) % regions.length] : undefined;
      const g = generate({ mode, difficulty, region, seed: `sim-${i}-${mode}-${difficulty}`, candidates }, history);
      if (!g) { failed++; console.log("FAIL", mode, difficulty, region ?? ""); continue; }
      if (!validateChallenge(g.challenge)) { invalid++; continue; }
      const ch = g.challenge;
      history.push(historyEntry(ch, g.route));
      const pk = [ch.start, ch.destination].sort().join("-");
      if (seenPairs.has(pk)) repeatsPair++;
      seenPairs.add(pk);
      for (const id of g.route) bump(freq.country, id);
      bump(freq.continent, graph.country(ch.start).continent);
      bump(freq.continent, graph.country(ch.destination).continent);
      bump(freq.region, graph.country(ch.start).region);
      for (let k = 0; k + 1 < g.route.length; k++) bump(freq.corridor, [g.route[k], g.route[k + 1]].sort().join("-"));
      const lk = `${mode}/${difficulty}/${ch.minIntermediate}`;
      lenDist.set(lk, (lenDist.get(lk) ?? 0) + 1);
      const ak = `${mode}/${difficulty}`;
      attemptsByDiff.set(ak, [...(attemptsByDiff.get(ak) ?? []), ch.attempts]);
      altSum += g.alternatives;
    }
  }
}
const top = (m: Map<string, number>, n = 10) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}:${v}`).join("  ");
console.log(`\n== Generator report: ${total} requested, ${total - failed - invalid} valid, ${failed} failed, ${invalid} invalid (${(((failed + invalid) / total) * 100).toFixed(1)}% invalid rate) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`Repeated unordered pairs: ${repeatsPair} (${((repeatsPair / total) * 100).toFixed(1)}%), mean optimal routes: ${(altSum / Math.max(1, total)).toFixed(2)}`);
console.log(`Countries covered: ${freq.country.size}/195`);
console.log(`\nTop countries:  ${top(freq.country, 15)}`);
console.log(`Continents:     ${top(freq.continent, 6)}`);
console.log(`Subregions:     ${top(freq.region, 8)}`);
console.log(`Top corridors:  ${top(freq.corridor, 10)}`);
console.log(`\nMin intermediates distribution (mode/difficulty/n:count)`);
console.log([...lenDist.entries()].sort().map(([k, v]) => `${k}:${v}`).join("  "));
console.log(`\nAttempts (mean) per mode/difficulty`);
console.log([...attemptsByDiff.entries()].sort().map(([k, v]) => `${k}=${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)}`).join("  "));
