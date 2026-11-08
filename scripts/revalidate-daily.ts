/**
 * After a dataset change (countries, connections, rules): re-validates every published daily file.
 *  - dates up to TODAY (UTC) are published: they are never modified. If one no longer validates, this exits with an error
 *    so the dataset change can be reworked (e.g. keep the connection it needs as a documented exception).
 *  - FUTURE dates were never shown to players: invalid ones are deleted, and `npm run data:daily` regenerates them.
 *   npm run data:revalidate-daily
 */
import fs from "node:fs";
import path from "node:path";
import type { Challenge } from "../src/engine/types";
import { validateChallenge } from "../src/lib/generate";

const dir = path.resolve(__dirname, "../public/daily");
const today = new Date().toISOString().slice(0, 10);
let checked = 0;
const publishedInvalid: string[] = [];
const futureInvalid: string[] = [];

for (const f of fs.readdirSync(dir).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()) {
  const date = f.slice(0, 10);
  const day = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as { challenges: Challenge[] };
  checked++;
  if (day.challenges.every((c) => validateChallenge(c))) continue;
  (date <= today ? publishedInvalid : futureInvalid).push(date);
}

console.log(`${checked} daily files checked (today = ${today}).`);
if (publishedInvalid.length > 0) {
  console.error(`✗ ${publishedInvalid.length} PUBLISHED daily file(s) no longer validate and were left untouched: ${publishedInvalid.join(", ")}`);
  process.exitCode = 1;
}
for (const date of futureInvalid) fs.unlinkSync(path.join(dir, `${date}.json`));
if (futureInvalid.length > 0) console.log(`Removed ${futureInvalid.length} unpublished future file(s) so they can be regenerated: run \`npm run data:daily\`.`);
else if (publishedInvalid.length === 0) console.log("All daily files are valid.");
