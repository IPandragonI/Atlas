/**
 * Precomputes daily challenges (3 per UTC day) as static JSON in public/daily/.
 * Published days are NEVER regenerated: existing files are kept untouched and feed the diversity history.
 *   npm run data:daily -- [startDate=2026-11-01] [days=400] [candidates=2000]
 */
import fs from "node:fs";
import path from "node:path";
import { REGION_DEFS } from "../src/data/regions";
import { DATASET_VERSION, RULES_VERSION } from "../src/data/version";
import { DAILY_DIFFICULTY, DAILY_MODES, dailyRegionFor } from "../src/lib/daily-schedule";
import { dailyId } from "../src/engine/generator/generator";
import type { HistoryEntry } from "../src/engine/generator/diversity";
import { solve } from "../src/engine/pathfinding";
import type { Challenge } from "../src/engine/types";
import { graph } from "../src/lib/atlas";
import { generateWithRetry, historyEntry } from "../src/lib/generate";

const candidates = Number(process.argv[4] ?? 2000);
const dir = path.resolve(__dirname, "../public/daily");
fs.mkdirSync(dir, { recursive: true });

// Range: from the first existing day (or 2026-11-01) to whichever is later: the last existing day or today + AHEAD days.
// Missing days inside that range (e.g. after `data:revalidate-daily`) are filled; existing days are never touched.
const AHEAD = Number(process.env.DAILY_AHEAD_DAYS ?? 120);
const DAY_MS = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const existing = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
const start = process.argv[2] ?? existing[0] ?? "2026-11-01";
const target = [existing[existing.length - 1] ?? start, iso(Date.now() + AHEAD * DAY_MS)].sort().pop()!;
const days = Number(process.argv[3] ?? Math.round((Date.parse(target) - Date.parse(start)) / DAY_MS) + 1);

const history: HistoryEntry[] = [];
const dateAt = (i: number) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
let created = 0, kept = 0;
const t0 = Date.now();

for (let i = 0; i < days; i++) {
  const date = dateAt(i);
  const file = path.join(dir, `${date}.json`);
  if (fs.existsSync(file)) {
    const existing = JSON.parse(fs.readFileSync(file, "utf8")) as { challenges: Challenge[] };
    for (const ch of existing.challenges) history.push(historyEntry(ch, solve(graph, ch).routes[0]));
    kept++;
    continue;
  }
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const challenges: Challenge[] = [];
  for (const mode of DAILY_MODES) {
    const difficulty = DAILY_DIFFICULTY[mode][weekday];
    const region = mode === "regional" ? dailyRegionFor(date, REGION_DEFS.map((r) => r.id)) : undefined;
    const g = generateWithRetry(
      { mode, difficulty, region, seed: `${date}|${mode}`, id: dailyId(date, mode), date, candidates },
      history,
      12,
    );
    if (!g) throw new Error(`Could not generate ${mode} for ${date}`);
    challenges.push(g.challenge);
    history.push(historyEntry(g.challenge, g.route));
  }
  fs.writeFileSync(
    file,
    JSON.stringify({ date, rulesVersion: RULES_VERSION, datasetVersion: DATASET_VERSION, challenges }, null, 1),
  );
  created++;
  if (created % 10 === 0) console.log(`${date} (${created} new, ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
// Index lists every published date (sorted) so clients know the covered range.
const dates = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify({ first: dates[0], last: dates[dates.length - 1], count: dates.length }));
console.log(`Daily challenges: ${created} created, ${kept} kept, ${dates.length} total (${dates[0]} → ${dates[dates.length - 1]})`);
const aheadLeft = Math.round((Date.parse(dates[dates.length - 1]) - Date.parse(iso(Date.now()))) / DAY_MS);
if (aheadLeft < 30) console.warn(`⚠ Daily challenges end in ${aheadLeft} day(s): run \`npm run data:daily\` (or let the scheduled workflow do it) before they run out.`);
