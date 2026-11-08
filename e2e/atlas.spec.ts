import { expect, test, type Page } from "@playwright/test";
import { graph } from "../src/lib/atlas";
import { generateWithRetry } from "../src/lib/generate";
import { optimalContinuations } from "../src/engine/pathfinding";
import { nextMoves } from "../src/engine/rules";

const fr = (id: string) => graph.country(id).name.fr;

// Same inputs as the app (fresh browser context => empty history) => same challenge.
function challengeFor(seed: string) {
  const g = generateWithRetry({ mode: "classic", difficulty: "easy", seed, candidates: 300 }, []);
  if (!g) throw new Error("no challenge");
  return g;
}

async function open(page: Page, seed: string) {
  await page.goto(`/fr/game/?mode=classic&difficulty=easy&seed=${seed}`);
  await expect(page.getByTestId("game-screen")).toBeVisible();
  await expect(page.getByRole("combobox")).toBeVisible();
}

/** On mobile the secondary sections live in a collapsible bottom sheet. */
async function expandSheet(page: Page) {
  const handle = page.getByRole("button", { name: "Ouvrir le panneau" });
  if (await handle.isVisible()) await handle.click();
}

async function type(page: Page, name: string) {
  const input = page.getByRole("combobox");
  await input.fill(name);
  await input.press("Enter");
}

test.describe("home & i18n", () => {
  test("shows the three daily challenges and switches language", async ({ page }) => {
    await page.goto("/fr/");
    await expect(page.getByRole("heading", { name: "Défis du jour" })).toBeVisible();
    for (const m of ["classic", "constraints", "regional"]) await expect(page.getByTestId(`daily-${m}`)).toBeVisible();
    await page.getByRole("link", { name: /English/ }).click();
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.getByRole("heading", { name: "Daily challenges" })).toBeVisible();
  });

  test("home screen is still reachable from the navigation", async ({ page }) => {
    await page.goto("/fr/");
    await expect(page.getByRole("heading", { name: "Défis du jour" })).toBeVisible();
  });
});

test.describe("gameplay", () => {
  test("plays a full optimal game and scores 1000", async ({ page }) => {
    const g = challengeFor("e2e-win");
    await open(page, "e2e-win");
    await expect(page.getByTestId("from-to").first()).toContainText(fr(g.challenge.start));
    // the destination is never typed: the last intermediate borders it and ends the game
    for (const id of g.route.slice(1, -1)) await type(page, fr(id));
    const results = page.getByTestId("results");
    await expect(results).toBeVisible();
    await expect(results).toHaveAttribute("data-status", "won");
    await expect(page.getByTestId("score")).toHaveText("1000");
    // alternative routes are only revealed after the game
    await expect(page.getByTestId("route-choice-shortest")).toBeVisible();
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-painted", "true");
  });

  test("a wrong country costs exactly one attempt and reveals nothing", async ({ page }) => {
    const g = challengeFor("e2e-wrong");
    await open(page, "e2e-wrong");
    const attempts = page.getByTestId("attempts").first();
    const before = Number(await attempts.getAttribute("data-left"));
    const valid = new Set(nextMoves(graph, g.challenge, [g.challenge.start]));
    const wrong = graph.ids().find((id) => id !== g.challenge.start && !valid.has(id) && !graph.country(id).name.fr.includes(" "))!;
    await type(page, fr(wrong));
    await expect(attempts).toHaveAttribute("data-left", String(before - 1));
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(page.getByTestId("route-list").locator("li")).toHaveCount(2); // start + destination slot
  });

  test("autocomplete is a pure name search over all countries (no geographic help)", async ({ page }) => {
    const g = challengeFor("e2e-auto");
    await open(page, "e2e-auto");
    const input = page.getByRole("combobox");
    await input.click();
    await expect(page.getByRole("option")).toHaveCount(0); // nothing is suggested before typing
    await input.fill("g");
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    const shown = (await options.allTextContents()).map((s) => s.trim());
    expect(shown.length).toBeGreaterThanOrEqual(5);
    // includes countries that are NOT neighbours of the start country
    const near = new Set(graph.neighbors(g.challenge.start, { maritime: true, blocked: new Set() }).map(fr));
    expect(shown.some((s) => !near.has(s))).toBe(true);
    // accents, case, English names, spacing
    await input.fill("ALLEMAGNE");
    await expect(page.getByRole("option").first()).toContainText("Allemagne");
    await input.fill("germany");
    await expect(page.getByRole("option").first()).toContainText("Allemagne");
    await input.fill("cote d ivoire");
    await expect(page.getByRole("option").first()).toContainText(/Côte d.Ivoire/);
  });

  test("two ordered hints: penalty shown before confirming, never consume attempts", async ({ page }) => {
    const g = challengeFor("e2e-hint");
    await open(page, "e2e-hint");
    const attempts = page.getByTestId("attempts").first();
    const before = await attempts.getAttribute("data-left");
    await expandSheet(page);
    // order: the borders hint is locked until the first-letter hint was used
    await expect(page.getByTestId("hint-letter")).toContainText("75");
    await expect(page.getByTestId("hint-borders")).toContainText("150");
    await expect(page.getByTestId("hint-borders")).toBeDisabled();
    // the penalty is displayed in a confirmation step; cancelling costs nothing
    await page.getByTestId("hint-letter").click();
    await expect(page.getByTestId("hint-confirm-box")).toContainText("75");
    await page.getByTestId("hint-cancel").click();
    await expect(page.getByTestId("hint-list")).toHaveCount(0);
    await page.getByTestId("hint-letter").click();
    await page.getByTestId("hint-confirm").click();
    await expect(page.getByText(/commence par la lettre/)).toBeVisible();
    // the letter belongs to a valid next country (first letter, French or English name)
    const text = (await page.getByTestId("hint-list").textContent()) ?? "";
    const letter = /« (.) »|“(.)”/.exec(text)?.slice(1).find(Boolean);
    const valid = optimalContinuations(graph, g.challenge, [g.challenge.start]); // real solver: part of an optimal solution
    expect(valid.map((id) => fr(id).normalize("NFD").replace(/[̀-ͯ]/g, "")[0].toUpperCase())).toContain(letter);
    await expect(page.getByTestId("hint-letter")).toBeDisabled(); // once per game
    await expect(page.getByTestId("hint-borders")).toBeEnabled();
    await page.getByTestId("hint-borders").click();
    await page.getByTestId("hint-confirm").click();
    await expect(page.getByTestId("hint-borders")).toBeDisabled();
    await expect(page.getByText(/sans son nom/)).toBeVisible();
    await expect(attempts).toHaveAttribute("data-left", before!);
  });
});

test.describe("settings & persistence", () => {
  test("theme switch applies and discovery persists across reload", async ({ page }) => {
    const g = challengeFor("e2e-persist");
    await open(page, "e2e-persist");
    await type(page, fr(g.route[1]));
    await page.goto("/fr/collection/");
    await expect(page.getByTestId("collection-subtitle")).toContainText("1 pays sur");
    await page.reload();
    await expect(page.getByTestId("collection-subtitle")).toContainText("1 pays sur");
    await page.goto("/fr/settings/");
    await page.getByRole("radio", { name: "Sombre" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("offline", () => {
  test("app shell, daily challenge and map work offline after install", async ({ page, context }, info) => {
    test.skip(info.project.name === "mobile", "covered once on desktop");
    await page.goto("/fr/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(async () => page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).length), { timeout: 60_000 })
      .toBeGreaterThan(300);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Défis du jour" })).toBeVisible();
    const today = new Date().toISOString().slice(0, 10);
    await page.goto(`/fr/game/?daily=${today}&mode=classic`);
    await expect(page.getByTestId("game-screen")).toBeVisible();
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-painted", "true");
  });
});
