import { expect, test, type Page } from "@playwright/test";
import { graph } from "../src/lib/atlas";
import { attemptsFor } from "../src/engine/difficulty";
import { solve } from "../src/engine/pathfinding";
import type { Challenge } from "../src/engine/types";
import { configToParams, defaultConfig } from "../src/lib/config";
import { generateForConfig } from "../src/lib/generate";

test.use({ locale: "fr-FR" });

const fr = (id: string) => graph.country(id).name.fr;
const FAKE_DATE = "2099-01-01";

/** A fully controlled challenge, served instead of a real daily file (so the scenario is deterministic). */
function custom(start: string, destination: string, difficulty: Challenge["difficulty"] = "easy"): Challenge {
  const rules = { maritime: false, forbidden: [], mandatory: [] };
  const sol = solve(graph, { start, destination, rules });
  return {
    id: `daily-${FAKE_DATE}-classic`, mode: "classic", difficulty, start, destination, rules, minIntermediate: sol.minIntermediate,
    attempts: attemptsFor(Math.max(0, sol.minIntermediate), difficulty === "custom" ? "normal" : difficulty), date: FAKE_DATE, rulesVersion: "2", datasetVersion: "2026.2",
  };
}
async function serve(page: Page, ch: Challenge) {
  await page.route(`**/daily/${FAKE_DATE}.json`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ date: FAKE_DATE, rulesVersion: "2", datasetVersion: "2026.2", challenges: [ch] }) }),
  );
  await page.goto(`/fr/game/?daily=${FAKE_DATE}&mode=classic`);
  await expect(page.getByRole("combobox").first()).toBeVisible();
}
async function type(page: Page, name: string) {
  const input = page.getByRole("combobox").first();
  await input.fill(name);
  await input.press("Enter");
}
const expandSheet = async (page: Page) => {
  const handle = page.getByRole("button", { name: "Ouvrir le panneau" });
  if (await handle.isVisible()) await handle.click();
};

test.describe("changing direction", () => {
  test("a country linked to an earlier country and closer to the destination replaces the abandoned branch, without any penalty", async ({ page }) => {
    // France -> Bulgaria. The player wanders off to Spain and Portugal, then realises Italy (next to France) is the better way.
    await serve(page, custom("FRA", "BGR"));
    const attempts = page.getByTestId("attempts").first();
    const total = await attempts.getAttribute("data-left");
    await expandSheet(page);
    await type(page, fr("ESP"));
    await type(page, fr("PRT"));
    await expect(page.getByTestId("route-list").locator("li")).toHaveCount(4); // France, Espagne, Portugal + the destination slot
    await type(page, fr("ITA")); // adjacent to France (index 0), strictly closer to Bulgaria than France
    const wrap = page.getByTestId("route-wrap");
    await expect(wrap).toHaveAttribute("data-branched", "true");
    await expect(page.getByTestId("route-list").locator("li")).toHaveCount(3); // France, Italie + the destination slot
    await expect(page.getByTestId("route-list")).toContainText("Italie");
    await expect(page.getByTestId("route-list")).not.toContainText("Portugal");
    await expect(page.getByTestId("toast")).toContainText("Nouvelle direction");
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect"); // never presented as an error
    await expect(attempts).toHaveAttribute("data-left", total!); // no attempt consumed
    await expect(page.getByTestId("sr-route")).toContainText("France → Italie");
  });

  test("a country that is not closer to the destination is an ordinary wrong answer", async ({ page }) => {
    await serve(page, custom("FRA", "POL"));
    const attempts = page.getByTestId("attempts").first();
    const total = Number(await attempts.getAttribute("data-left"));
    await type(page, fr("BEL"));
    await type(page, fr("NLD"));
    await type(page, fr("ESP")); // touches France but is farther from Poland than France
    await expect(attempts).toHaveAttribute("data-left", String(total - 1));
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(page.getByTestId("route-list")).not.toContainText("Espagne");
  });

  test("the game still ends on a victory after a change of direction", async ({ page }) => {
    await serve(page, custom("FRA", "PRT"));
    await type(page, fr("BEL"));
    await type(page, fr("NLD"));
    await type(page, fr("ESP")); // borders France (earlier) and Portugal (destination)
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expect(page.getByTestId("score")).toHaveText("1000"); // the abandoned branch costs nothing and does not count
  });
});

test.describe("a start that already touches the destination", () => {
  test("shows a non-blocking notice, costs nothing, and cannot win without entering a country", async ({ page }) => {
    await serve(page, custom("FRA", "DEU"));
    const notice = page.getByTestId("start-adjacent");
    await expect(notice).toContainText("déjà voisin");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", "5"); // no attempt consumed
    await expect(page.getByTestId("results")).toHaveCount(0); // the game did not end by itself
    await expect(page.getByRole("combobox").first()).toBeEnabled(); // not blocking
    await type(page, fr("DEU")); // typing the destination is a wrong answer, never a shortcut
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", "4");
    await type(page, fr("BEL")); // a real intermediate country: normal victory
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
  });
  test("is not shown for an ordinary challenge", async ({ page }) => {
    await serve(page, custom("FRA", "POL"));
    await expect(page.getByTestId("start-adjacent")).toHaveCount(0);
  });
});

test.describe("resume", () => {
  const cfg = { ...defaultConfig("classic"), difficulty: "easy" as const };
  const url = (seed: string) => `/fr/game/?${configToParams(cfg, seed).toString()}`;

  test("a reload continues the same game: route, mistakes and attempts are kept", async ({ page }) => {
    const g = generateForConfig(cfg, "rs1", [])!;
    await page.goto(url("rs1"));
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expandSheet(page);
    await type(page, fr(g.route[1]));
    await type(page, "Japon"); // a mistake
    const left = await page.getByTestId("attempts").first().getAttribute("data-left");
    await expect(page.getByTestId("route-list").locator("li")).toHaveCount(3);
    await page.reload();
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expandSheet(page);
    await expect(page.getByTestId("route-list").locator("li")).toHaveCount(3);
    await expect(page.getByTestId("route-list")).toContainText(fr(g.route[1]));
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", left!);
  });

  test("the home screen offers to resume, opening Atlas resumes, and finishing clears it", async ({ page }) => {
    const g = generateForConfig(cfg, "rs2", [])!;
    await page.goto(url("rs2"));
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await type(page, fr(g.route[1]));
    await page.goto("/fr/");
    const card = page.getByTestId("resume-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText(fr(g.challenge.start));
    await page.goto("/"); // opening the app never abandons the game silently
    await expect(page).toHaveURL(/seed=rs2/);
    await expandSheet(page);
    await expect(page.getByTestId("route-list")).toContainText(fr(g.route[1]));
    for (const id of g.route.slice(2, -1)) await type(page, fr(id));
    await expect(page.getByTestId("results")).toBeVisible();
    await page.goto("/fr/");
    await expect(page.getByTestId("resume-card")).toHaveCount(0);
  });
});

test.describe("generation runs in a Web Worker", () => {
  test("a game started from the modal is generated by the worker (not the main-thread fallback)", async ({ page }) => {
    const worker = page.waitForResponse((r) => r.url().endsWith("/workers/generate.worker.js") && r.status() === 200);
    await page.goto("/fr/");
    await worker; // loaded while the player is still on the home screen
    await page.getByTestId("free-classic").click();
    await page.getByTestId("cfg-start").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("html")).toHaveAttribute("data-gen-worker", "worker");
  });
});

test.describe("how to play", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("opens on the first visit, walks through five steps, never comes back on its own, and can be reopened", async ({ page }) => {
    await page.goto("/fr/game/?mode=classic&difficulty=easy&seed=tuto1");
    const dialog = page.getByTestId("howto");
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId("howto-step-title")).toContainText("Relie deux pays");
    for (let i = 0; i < 4; i++) await page.getByTestId("howto-next").click();
    await expect(page.getByTestId("howto-step-title")).toContainText("score");
    await page.getByTestId("howto-next").click();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expect(page.getByTestId("howto")).toHaveCount(0);
    const open = page.getByTestId("howto-open");
    if (await open.isVisible()) await open.click();
    else await page.getByTestId("howto-open-m").click();
    await expect(page.getByTestId("howto")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("howto")).toHaveCount(0);
  });

  test("keyboard focus stays inside the dialog (focus trap)", async ({ page }) => {
    await page.goto("/fr/game/?mode=classic&difficulty=easy&seed=tuto2");
    await expect(page.getByTestId("howto")).toBeVisible();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="howto"]'))).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="howto"]'))).toBe(true);
    }
  });
});

test.describe("accessibility details", () => {
  test("the configuration modal traps focus and gives it back when closed", async ({ page }) => {
    await page.goto("/fr/");
    const card = page.getByTestId("free-classic");
    await card.click();
    const modal = page.getByTestId("config-modal");
    await expect(modal).toBeVisible();
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="config-modal"]')), `tab ${i}`).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(card).toBeFocused();
  });
  test("the map is named for assistive technology, and the route is announced as text", async ({ page }) => {
    await page.goto("/fr/game/?mode=classic&difficulty=easy&seed=a11y1");
    await expect(page.getByRole("application", { name: "Carte du monde interactive" })).toBeVisible();
    await expect(page.getByTestId("sr-route")).toContainText("Itinéraire actif");
  });
});

test.describe("wording", () => {
  test("mistakes are called mistakes, and the input no longer suggests that only neighbours work", async ({ page }) => {
    await page.goto("/fr/game/?mode=classic&difficulty=easy&seed=word1");
    const input = page.getByRole("combobox").first();
    await expect(input).toHaveAttribute("placeholder", "Tape le nom d’un pays…");
    const attemptsLabel = page.getByText("Erreurs permises").first();
    await expect(attemptsLabel).toBeAttached();
    await page.goto("/fr/");
    await page.getByTestId("free-classic").click();
    await page.getByTestId("cfg-diff-custom").click();
    await expect(page.getByText("Erreurs autorisées").first()).toBeVisible();
  });
  test("a custom map with no borders, no names and a hidden map shows a (non-blocking) warning", async ({ page }) => {
    await page.goto("/fr/");
    await page.getByTestId("free-classic").click();
    await page.getByTestId("cfg-diff-custom").click();
    await expect(page.getByTestId("cfg-hidden-warning")).toHaveCount(0);
    await page.getByTestId("cfg-map-borders").click();
    await page.getByTestId("cfg-map-names").click();
    await expect(page.getByTestId("cfg-hidden-warning")).toBeVisible();
    await expect(page.getByTestId("cfg-start")).toBeEnabled();
  });
});

test.describe("statistics and sharing", () => {
  test("a finished game appears in the per-mode statistics and the score chart; the result can be saved as an image", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "canShare", { value: undefined })); // force the download path
    const ch = custom("FRA", "PRT");
    await serve(page, ch);
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByTestId("share-image").click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^atlas-.*\.png$/);
    const path = await file.path();
    expect((await import("node:fs")).statSync(path).size).toBeGreaterThan(8_000); // a real rendered picture
    await page.goto("/fr/stats/");
    const row = page.getByTestId("mode-row-classic");
    await expect(row).toContainText("1/1");
    await expect(row).toContainText("100%");
    await expect(page.getByTestId("mode-row-regional")).toContainText("—");
    await expect(page.getByTestId("score-chart").locator("li")).toHaveCount(1);
  });
});

test.describe("map palette", () => {
  test("light theme: darker land and a clearer ocean; dark theme unchanged", async ({ page }) => {
    await page.goto("/fr/");
    const tokens = () => page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { land: s.getPropertyValue("--land").trim(), water: s.getPropertyValue("--water").trim(), border: s.getPropertyValue("--map-border").trim() };
    });
    await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
    expect(await tokens()).toEqual({ land: "#d4cdb7", water: "#eae7da", border: "#968f79" });
    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    expect(await tokens()).toEqual({ land: "#303633", water: "#1b1f1e", border: "#555d57" });
  });
});

test.describe("mobile layout", () => {
  test("the expanded bottom sheet leaves a usable part of the map", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile", "mobile only");
    await page.goto("/fr/game/?mode=classic&difficulty=easy&seed=mob1");
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await page.getByRole("button", { name: "Ouvrir le panneau" }).click();
    const box = (await page.locator("aside").boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(box.height).toBeLessThanOrEqual(vh * 0.6 + 2);
    const map = (await page.getByTestId("world-map").boundingBox())!;
    expect(map.height).toBeGreaterThan(vh * 0.9); // the map still fills the screen behind the sheet
  });
});
