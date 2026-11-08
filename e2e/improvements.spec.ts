import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { graph } from "../src/lib/atlas";
import { generateWithRetry } from "../src/lib/generate";
import { solve } from "../src/engine/pathfinding";
import { nextMoves } from "../src/engine/rules";
import type { Challenge, Difficulty } from "../src/engine/types";

const fr = (id: string) => graph.country(id).name.fr;
const today = new Date().toISOString().slice(0, 10);

function todaysClassic(): Challenge | null {
  const file = path.resolve(__dirname, `../public/daily/${today}.json`);
  if (!fs.existsSync(file)) return null;
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { challenges: Challenge[] }).challenges.find((c) => c.mode === "classic") ?? null;
}

function challengeFor(seed: string, difficulty: Difficulty) {
  const g = generateWithRetry({ mode: "classic", difficulty, seed, candidates: 300 }, []);
  if (!g) throw new Error("no challenge");
  return g;
}

async function type(page: Page, name: string) {
  const input = page.getByRole("combobox");
  await input.fill(name);
  await input.press("Enter");
}

/** Types the intermediates of a shortest route; the destination is never typed. */
async function playOptimal(page: Page, route: string[]) {
  for (const id of route.slice(1, -1)) await type(page, fr(id));
}

test.describe("daily launch", () => {
  test.use({ locale: "fr-FR" }); // the root entry point follows the browser language (FR default)

  test("opening Atlas starts today's Classic daily challenge directly", async ({ page }) => {
    const ch = todaysClassic();
    test.skip(!ch, "no published daily file for today");
    await page.goto("/");
    await expect(page).toHaveURL(new RegExp(`/game/\\?daily=${today}&mode=classic`));
    await expect(page.getByTestId("game-screen")).toBeVisible();
    const fromTo = page.getByTestId("from-to").first();
    await expect(fromTo).toContainText(fr(ch!.start));
    await expect(fromTo).toContainText(fr(ch!.destination));
    await expect(page.getByRole("combobox")).toBeEnabled(); // playable at once: no mode/difficulty/confirmation screen
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", String(ch!.attempts));
  });

  test("a completed daily is displayed as completed instead of restarting", async ({ page }) => {
    const ch = todaysClassic();
    test.skip(!ch, "no published daily file for today");
    const route = solve(graph, ch!).routes[0];
    await page.goto("/");
    await expect(page.getByRole("combobox")).toBeVisible();
    await playOptimal(page, route);
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    const score = await page.getByTestId("score").textContent();
    expect(Number(score)).toBeGreaterThan(0);

    await page.goto("/"); // next launch, same day
    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0); // no new attempt
    await expect(page.getByTestId("score")).toHaveText(score!);

    await page.goto("/fr/");
    await expect(page.getByTestId("daily-classic")).toContainText(/Terminé/);
  });

  test("other modes, difficulties and free play stay reachable from the game", async ({ page }) => {
    const ch = todaysClassic();
    test.skip(!ch, "no published daily file for today");
    await page.goto("/");
    await expect(page.getByTestId("game-screen")).toBeVisible();
    const menu = page.getByTestId("mobile-menu");
    if (await menu.isVisible()) {
      await menu.click();
      await page.getByRole("menuitem", { name: "Accueil" }).click();
    } else {
      await page.getByRole("link", { name: "Accueil" }).first().click();
    }
    // each free-play mode opens its own configuration modal
    await page.getByTestId("free-constraints").click();
    await expect(page.getByTestId("config-modal")).toBeVisible();
    await page.getByTestId("cfg-diff-hard").click();
    await page.getByTestId("cfg-start").click();
    await expect(page).toHaveURL(/mode=constraints/);
    await expect(page).toHaveURL(/difficulty=hard/);
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("daily launch in English", () => {
  test.use({ locale: "en-US" });
  test("an English browser is sent to the English daily", async ({ page }) => {
    test.skip(!todaysClassic(), "no published daily file for today");
    await page.goto("/");
    await expect(page).toHaveURL((u) => u.pathname === "/en/game/" && u.searchParams.get("daily") === today && u.searchParams.get("mode") === "classic");
    await expect(page.getByTestId("game-screen")).toBeVisible();
  });
});

test.describe("map visibility", () => {
  const url = (seed: string, d: Difficulty) => `/fr/game/?mode=classic&difficulty=${d}&seed=${seed}`;

  for (const difficulty of ["normal", "hard"] as const) {
    test(`${difficulty}: hidden at first, countries appear when entered, everything revealed at the end`, async ({ page }) => {
      const g = challengeFor(`e2e-mask-${difficulty}`, difficulty);
      await page.goto(url(`e2e-mask-${difficulty}`, difficulty));
      const map = page.getByTestId("world-map");
      await expect(map).toHaveAttribute("data-painted", "true");
      await expect(map).toHaveAttribute("data-masked", "true");
      // departure and arrival are always displayed; nothing else is
      await expect(map).toHaveAttribute("data-shown", "2");
      await page.waitForTimeout(600);
      const hiddenSize = (await map.screenshot()).length;

      // a wrong answer reveals nothing
      const valid = new Set(nextMoves(graph, g.challenge, [g.challenge.start]));
      const wrong = graph.ids().find((id) => id !== g.challenge.start && id !== g.challenge.destination && !valid.has(id) && !fr(id).includes(" "))!;
      await type(page, fr(wrong));
      await expect(page.getByTestId("toast")).toContainText("Incorrect");
      await expect(map).toHaveAttribute("data-shown", "2");

      // a correct answer reveals exactly that country
      const mid = g.route.slice(1, -1);
      await type(page, fr(mid[0]));
      await expect(map).toHaveAttribute("data-shown", "3");
      await expect(map).toHaveAttribute("data-masked", "true");

      for (const id of mid.slice(1)) await type(page, fr(id));
      await expect(page.getByTestId("results")).toBeVisible();
      await expect(map).toHaveAttribute("data-masked", "false");
      await page.waitForTimeout(1800); // reveal animation
      const revealedSize = (await map.screenshot()).length;
      // a blank (masked) map compresses to almost nothing; the revealed atlas is far richer
      expect(revealedSize).toBeGreaterThan(hiddenSize * 1.3);
    });
  }

  test("easy: the whole map is visible during the game", async ({ page }) => {
    challengeFor("e2e-mask-easy", "easy");
    await page.goto(url("e2e-mask-easy", "easy"));
    const map = page.getByTestId("world-map");
    await expect(map).toHaveAttribute("data-painted", "true");
    await expect(map).toHaveAttribute("data-masked", "false");
  });
});
