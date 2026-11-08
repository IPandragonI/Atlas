import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { graph } from "../src/lib/atlas";
import { configToParams, defaultConfig, type GameConfig } from "../src/lib/config";
import { generateForConfig } from "../src/lib/generate";
import { solve } from "../src/engine/pathfinding";
import type { Challenge, GameMode } from "../src/engine/types";

test.use({ locale: "fr-FR" });

const fr = (id: string) => graph.country(id).name.fr;
const today = new Date().toISOString().slice(0, 10);

async function type(page: Page, name: string) {
  const input = page.getByRole("combobox").first();
  await input.fill(name);
  await input.press("Enter");
}
async function playRoute(page: Page, route: string[]) {
  for (const id of route.slice(1, -1)) await type(page, fr(id));
}
function daily(mode: GameMode): Challenge | null {
  const file = path.resolve(__dirname, `../public/daily/${today}.json`);
  if (!fs.existsSync(file)) return null;
  return (JSON.parse(fs.readFileSync(file, "utf8")) as { challenges: Challenge[] }).challenges.find((c) => c.mode === mode) ?? null;
}
const openModal = async (page: Page, mode: GameMode) => {
  await page.goto("/fr/");
  await page.getByTestId(`free-${mode}`).click();
  await expect(page.getByTestId("config-modal")).toBeVisible();
};

test.describe("home and configuration modal", () => {
  test("the Play tab is gone; the three modes are on the home screen", async ({ page }) => {
    await page.goto("/fr/");
    const nav = page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link");
    await expect(nav).toHaveText(["Accueil", "Collection", "Statistiques"]); // no "Jouer" tab any more
    for (const m of ["classic", "constraints", "regional"]) await expect(page.getByTestId(`free-${m}`)).toBeVisible();
    const res = await page.goto("/fr/play/");
    expect(res?.status()).toBe(404);
  });

  test("each mode opens its own modal", async ({ page }) => {
    await page.goto("/fr/");
    for (const [mode, title] of [["classic", "Classique"], ["constraints", "Contraintes"], ["regional", "Régional"]] as const) {
      await page.getByTestId(`free-${mode}`).click();
      const modal = page.getByTestId("config-modal");
      await expect(modal).toBeVisible();
      await expect(modal.getByRole("dialog")).toHaveAttribute("data-mode", mode);
      await expect(modal.getByRole("heading", { level: 2 })).toContainText(title);
      if (mode === "regional") await expect(modal.locator("#cfg-scope option[value=world]")).toHaveCount(0);
      else await expect(modal.locator("#cfg-scope option[value=world]")).toHaveCount(1);
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    }
  });

  test("custom settings only appear when Custom is selected", async ({ page }) => {
    await openModal(page, "classic");
    const custom = page.getByTestId("cfg-custom");
    for (const d of ["easy", "normal", "hard"]) {
      await page.getByTestId(`cfg-diff-${d}`).click();
      await expect(custom).toHaveCount(0);
    }
    await page.getByTestId("cfg-diff-custom").click();
    await expect(custom).toBeVisible();
    for (const id of ["cfg-min", "cfg-attempts", "cfg-map-full", "cfg-map-start", "cfg-map-borders", "cfg-map-names"]) await expect(page.getByTestId(id)).toBeVisible();
    await page.getByTestId("cfg-diff-normal").click();
    await expect(custom).toHaveCount(0);
  });

  test("settings are preserved while navigating inside the modal", async ({ page }) => {
    await openModal(page, "classic");
    await page.locator("#cfg-scope").selectOption("africa");
    await page.getByTestId("cfg-diff-custom").click();
    await page.getByTestId("cfg-min").fill("3");
    await page.getByTestId("cfg-diff-hard").click();
    await page.getByTestId("cfg-diff-custom").click();
    await expect(page.getByTestId("cfg-min")).toHaveValue("3");
    await expect(page.locator("#cfg-scope")).toHaveValue("africa");
  });

  test("validates the configuration and explains impossible setups", async ({ page }) => {
    await openModal(page, "classic");
    await page.getByTestId("cfg-diff-custom").click();
    await page.getByTestId("cfg-min").fill("99");
    await expect(page.getByTestId("cfg-errors")).toContainText("longueur minimale");
    await expect(page.getByTestId("cfg-start")).toBeDisabled();
    await page.getByTestId("cfg-min").fill("3");
    await page.getByTestId("cfg-attempts").fill("0");
    await expect(page.getByTestId("cfg-errors")).toContainText("erreurs autorisées");
    await expect(page.getByTestId("cfg-start")).toBeDisabled();
    await page.getByTestId("cfg-attempts").fill("5");
    await expect(page.getByTestId("cfg-errors")).toHaveCount(0);
    await expect(page.getByTestId("cfg-start")).toBeEnabled();
    // Oceania has no land borders: no Classic game is possible there, and the modal says so instead of starting
    await page.getByTestId("cfg-diff-normal").click();
    await page.locator("#cfg-scope").selectOption("oceania");
    await page.getByTestId("cfg-start").click();
    await expect(page.getByTestId("cfg-errors")).toContainText("Aucun trajet possible");
    await expect(page.getByTestId("config-modal")).toBeVisible();
    await expect(page).toHaveURL(/\/fr\/$/);
  });

  test("countries to avoid: add with the autocomplete, remove, and never used by the game", async ({ page }) => {
    await openModal(page, "classic");
    const list = page.getByTestId("cfg-forbid-list");
    await expect(list).toContainText("Aucun pays évité");
    const modalInput = page.getByTestId("cfg-forbid").getByRole("combobox");
    await modalInput.fill("allemagne");
    await modalInput.press("Enter");
    await expect(page.getByTestId("cfg-forbid-DEU")).toBeVisible();
    await modalInput.fill("germany"); // duplicates are ignored
    await modalInput.press("Enter");
    await expect(list.locator("li")).toHaveCount(1);
    await page.getByRole("button", { name: /Retirer Allemagne/ }).click();
    await expect(list).toContainText("Aucun pays évité");
    await modalInput.fill("allemagne");
    await modalInput.press("Enter");
    await modalInput.fill("suisse");
    await modalInput.press("Enter");
    await page.getByTestId("cfg-start").click();
    await expect(page).toHaveURL(/forbid=DEU(%2C|,)CHE/);
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    // the avoided countries are neither start nor destination
    const fromTo = page.getByTestId("from-to").first();
    await expect(fromTo).not.toContainText("Allemagne");
    await expect(fromTo).not.toContainText("Suisse");
  });

  test("a full custom game: minimum length, attempts, continent and map settings", async ({ page }) => {
    await openModal(page, "classic");
    await page.getByTestId("cfg-diff-custom").click();
    await page.getByTestId("cfg-min").fill("3");
    await page.getByTestId("cfg-attempts").fill("4");
    await page.locator("#cfg-scope").selectOption("europe");
    await page.getByTestId("cfg-map-full").click(); // progressive discovery -> full map
    await page.getByTestId("cfg-map-borders").click(); // no borders
    await page.getByTestId("cfg-start").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    const url = new URL(page.url());
    expect(url.searchParams.get("difficulty")).toBe("custom");
    expect(url.searchParams.get("min")).toBe("3");
    expect(url.searchParams.get("att")).toBe("4");
    expect(url.searchParams.get("scope")).toBe("europe");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", "4");
    const map = page.getByTestId("world-map");
    await expect(map).toHaveAttribute("data-painted", "true");
    await expect(map).toHaveAttribute("data-masked", "false"); // "full map" was switched on
    const handle = page.getByRole("button", { name: "Ouvrir le panneau" }); // mobile: the rules live in the bottom sheet
    if (await handle.isVisible()) await handle.click();
    await expect(page.getByText(/Région : Europe/).first()).toBeVisible();
  });

  test("Easy, Normal and Hard keep their behaviour (full map vs progressive)", async ({ page }) => {
    for (const [diff, masked] of [["easy", "false"], ["normal", "true"], ["hard", "true"]] as const) {
      await openModal(page, "classic");
      await page.getByTestId(`cfg-diff-${diff}`).click();
      await page.getByTestId("cfg-start").click();
      await expect(page.getByTestId("world-map")).toHaveAttribute("data-masked", masked, { timeout: 30_000 });
    }
  });

  test("the modal fits the screen and keeps the Start button reachable (desktop and mobile)", async ({ page }) => {
    await openModal(page, "regional");
    await page.getByTestId("cfg-diff-custom").click();
    const dialog = page.getByRole("dialog");
    const box = (await dialog.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.height).toBeLessThanOrEqual(vp.height);
    expect(box.width).toBeLessThanOrEqual(vp.width);
    await expect(page.getByTestId("cfg-start")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true); // no horizontal scroll
  });
});

test.describe("replay with the same settings", () => {
  const cfg: GameConfig = { ...defaultConfig("classic"), difficulty: "custom", scope: "europe", forbidden: ["RUS"], minIntermediate: 2, attempts: 7, map: { start: true, borders: true, names: true, full: true } };

  test("a finished custom game can be replayed with the same configuration and a new route", async ({ page }) => {
    const g = generateForConfig(cfg, "rp1", [])!;
    await page.goto(`/fr/game/?${configToParams(cfg, "rp1").toString()}`);
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await playRoute(page, g.route);
    await expect(page.getByTestId("results")).toBeVisible();
    const firstPair = await page.getByTestId("from-to").first().textContent();
    await page.getByTestId("replay-same").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("combobox").first()).toBeVisible();
    const url = new URL(page.url());
    for (const [k, v] of [["mode", "classic"], ["difficulty", "custom"], ["scope", "europe"], ["forbid", "RUS"], ["min", "2"], ["att", "7"], ["mfull", "1"]]) expect(url.searchParams.get(k), k).toBe(v);
    expect(url.searchParams.get("seed")).not.toBe("rp1");
    expect(url.searchParams.get("avoid")).toBe(`${g.challenge.start}-${g.challenge.destination}`);
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", "7");
    expect(await page.getByTestId("from-to").first().textContent()).not.toBe(firstPair); // a different start/destination pair
  });

  test("after a daily: another daily is suggested first, and 'replay' stays available", async ({ page }) => {
    const ch = daily("classic");
    test.skip(!ch, "no published daily for today");
    await page.goto(`/fr/game/?daily=${today}&mode=classic`);
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await playRoute(page, solve(graph, ch!).routes[0]);
    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByTestId("next-daily")).toContainText("Contraintes");
    await expect(page.getByTestId("new-classic")).toHaveCount(0);
    await expect(page.getByTestId("replay-same")).toBeVisible(); // always available, clearly separate from the daily
    // replay = a free game with the same mode/difficulty (a new route), not the daily again
    await page.getByTestId("replay-same").click();
    await expect(page).toHaveURL((u) => u.pathname === "/fr/game/" && !u.searchParams.has("daily") && u.searchParams.get("mode") === "classic");
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
  });

  test("the completed daily is never replaced; classic is suggested once all three dailies are done", async ({ page }) => {
    const all = (["classic", "constraints", "regional"] as const).map((m) => [m, daily(m)] as const);
    test.skip(all.some(([, c]) => !c), "no published dailies for today");
    let firstScore = "";
    for (const [mode, ch] of all) {
      await page.goto(`/fr/game/?daily=${today}&mode=${mode}`);
      await expect(page.getByRole("combobox").first()).toBeVisible();
      await playRoute(page, solve(graph, ch!).routes[0]);
      await expect(page.getByTestId("results")).toBeVisible();
      if (mode === "classic") firstScore = (await page.getByTestId("score").textContent()) ?? "";
    }
    // all three done: the suggestion is a new Classic game, not another daily
    await expect(page.getByTestId("new-classic")).toBeVisible();
    await expect(page.getByTestId("next-daily")).toHaveCount(0);
    // reopening a completed daily shows it as completed (same score), it is not restarted
    await page.goto(`/fr/game/?daily=${today}&mode=classic`);
    await expect(page.getByTestId("results")).toBeVisible();
    await expect(page.getByRole("combobox")).toHaveCount(0);
    await expect(page.getByTestId("score")).toHaveText(firstScore);
    // the suggestion opens the Classic configuration modal on the home screen
    await page.getByTestId("new-classic").click();
    await expect(page.getByTestId("config-modal").getByRole("dialog")).toHaveAttribute("data-mode", "classic");
  });
});

test.describe("hints and the hidden map", () => {
  test("the borders hint reveals one country's shape (no name) on a hidden map, then both hints are spent", async ({ page }) => {
    const cfg: GameConfig = { ...defaultConfig("classic"), difficulty: "hard" };
    await page.goto(`/fr/game/?${configToParams(cfg, "hm1").toString()}`);
    const map = page.getByTestId("world-map");
    await expect(map).toHaveAttribute("data-masked", "true");
    await expect(map).toHaveAttribute("data-shown", "2"); // departure + arrival only
    const labelsBefore = await page.locator(".atlas-label").count();
    const handle = page.getByRole("button", { name: "Ouvrir le panneau" });
    if (await handle.isVisible()) await handle.click();

    await page.getByTestId("hint-letter").click();
    await page.getByTestId("hint-confirm").click();
    await expect(map).toHaveAttribute("data-shown", "2"); // a letter reveals nothing on the map
    await page.getByTestId("hint-borders").click();
    await page.getByTestId("hint-confirm").click();
    await expect(map).toHaveAttribute("data-shown", "3"); // exactly one more shape, drawn through the hint colour
    expect(await page.locator(".atlas-label").count()).toBe(labelsBefore); // ... and no name label
    await expect(page.getByTestId("hint-letter")).toBeDisabled();
    await expect(page.getByTestId("hint-borders")).toBeDisabled();
  });
});

test.describe("country names in the interface", () => {
  test("Eswatini is searchable under its new and old names, in French and English", async ({ page }) => {
    await page.goto("/fr/game/?mode=classic&difficulty=easy&seed=names");
    const input = page.getByRole("combobox").first();
    await expect(input).toBeVisible();
    for (const q of ["eswatini", "swaziland"]) {
      await input.fill(q);
      await expect(page.getByRole("option").first()).toContainText("Eswatini");
    }
    await input.fill("cape verde");
    await expect(page.getByRole("option").first()).toContainText("Cap-Vert");
    await input.fill("ivory coast");
    await expect(page.getByRole("option").first()).toContainText(/Côte d.Ivoire/);
  });
});
