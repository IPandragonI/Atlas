import { expect, type Page } from "@playwright/test";
import { attemptsFor } from "../src/engine/difficulty";
import { solve } from "../src/engine/pathfinding";
import type { Challenge, ChallengeRules } from "../src/engine/types";
import { graph } from "../src/lib/atlas";

export const FAKE_DATE = "2099-01-01";
/** French display name of a country id. */
export const fr = (id: string) => graph.country(id).name.fr;

/** A fully controlled challenge, served in place of a real daily file so the scenario is deterministic. */
export function custom(
  start: string,
  destination: string,
  difficulty: Challenge["difficulty"] = "easy",
  extra: Partial<ChallengeRules> = {},
): Challenge {
  const rules: ChallengeRules = { maritime: false, forbidden: [], mandatory: [], ...extra };
  const sol = solve(graph, { start, destination, rules });
  return {
    id: `daily-${FAKE_DATE}-classic`, mode: "classic", difficulty, start, destination, rules, minIntermediate: sol.minIntermediate,
    attempts: attemptsFor(Math.max(0, sol.minIntermediate), difficulty === "custom" ? "normal" : difficulty),
    date: FAKE_DATE, rulesVersion: "2", datasetVersion: "2026.2",
  };
}

/** Serves `ch` as the daily challenge of FAKE_DATE and opens it. */
export async function serve(page: Page, ch: Challenge) {
  await page.route(`**/daily/${FAKE_DATE}.json`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ date: FAKE_DATE, rulesVersion: "2", datasetVersion: "2026.2", challenges: [ch] }) }),
  );
  await page.goto(`/fr/game/?daily=${FAKE_DATE}&mode=classic`);
  await expect(page.getByRole("combobox").first()).toBeVisible();
}

/** Types a country name and submits it, exactly like a player. */
export async function type(page: Page, name: string) {
  const input = page.getByRole("combobox").first();
  await input.fill(name);
  await input.press("Enter");
}

/** On mobile the route and hints live in a bottom sheet that starts collapsed. */
export async function expandSheet(page: Page) {
  const handle = page.getByRole("button", { name: "Ouvrir le panneau" });
  if (await handle.isVisible()) await handle.click();
}
