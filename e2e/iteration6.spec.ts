import { expect, test, type Page } from "@playwright/test";
import { solve } from "../src/engine/pathfinding";
import { resolveMove } from "../src/engine/rules";
import { graph } from "../src/lib/atlas";
import { custom, expandSheet, fr, serve, type } from "./helpers";

test.use({ locale: "fr-FR" });

const links = async (page: Page) => (await page.getByTestId("world-map").getAttribute("data-links")) ?? "";
const routeOf = async (page: Page) => (await page.getByTestId("world-map").getAttribute("data-route")) ?? "";

/** The shortest route of a long pair, and the countries to type to walk along it without finishing the game. */
function longWalk(start: string, destination: string) {
  const sol = solve(graph, { start, destination, rules: { maritime: false, forbidden: [], mandatory: [] } });
  const route = sol.routes[0];
  return { route, enter: route.slice(1, -2) }; // everything except the last intermediate (the one touching the destination)
}

test.describe("the route list shows 5 rows and scrolls", () => {
  const { enter } = longWalk("PRT", "KOR");

  test("a short route is not scrollable; a long one is capped at five rows, follows the newest country and never shifts the panel", async ({ page }) => {
    expect(enter.length).toBeGreaterThanOrEqual(5); // the scenario really has more than five rows (start + 5 + destination)
    await serve(page, custom("PRT", "KOR"));
    await expandSheet(page);
    const scroll = page.getByTestId("route-scroll");
    const list = page.getByTestId("route-list");
    await expect(scroll).toHaveAttribute("data-scrollable", "false");

    const inputY = async () => (await page.getByRole("combobox").first().boundingBox())!.y;
    let capped: number | null = null;
    for (let i = 0; i < enter.length; i++) {
      await type(page, fr(enter[i]));
      await expect.poll(async () => (await list.locator("li").count()), { timeout: 8000 }).toBe(i + 3); // start + entered + destination slot
      const rows = i + 3;
      if (rows <= 5) {
        await expect(scroll).toHaveAttribute("data-scrollable", "false");
        const sh = await scroll.evaluate((el) => [el.clientHeight, el.scrollHeight]);
        expect(sh[0]).toBe(sh[1]); // the list takes exactly the room it needs
      } else {
        await expect(scroll).toHaveAttribute("data-scrollable", "true");
        const h = await scroll.evaluate((el) => el.clientHeight);
        expect(h).toBeLessThanOrEqual(5 * 36 + 2); // about five rows
        expect(h).toBeGreaterThan(5 * 36 - 8);
        // the newest country is scrolled into view (smooth scrolling needs a moment)
        await expect.poll(() => scroll.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)), { timeout: 20_000 }).toBeLessThan(3);
        if (capped === null) capped = await inputY();
        else expect(Math.abs((await inputY()) - capped)).toBeLessThan(2); // once capped, nothing below it moves
      }
    }
    // the rows the player can see include the latest country
    const last = list.locator("li").nth(enter.length); // index 0 = start, then the entered countries
    const box = (await last.boundingBox())!;
    const area = (await scroll.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(area.y - 1);
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height + 1);
  });

  test("a change of direction replaces the abandoned segment in the list and scrolls to the end of the NEW route", async ({ page }) => {
    const ch = custom("PRT", "KOR");
    // wander north (Denmark is a dead end), then Poland: it touches Germany (index 5) and is nearer Korea than Germany is
    const walk = ["ESP", "FRA", "BEL", "NLD", "DEU", "DNK"];
    expect(resolveMove(graph, ch, ["PRT", ...walk], "POL")).toEqual({ valid: true, from: 5 });
    await serve(page, ch);
    await expandSheet(page);
    for (const g of walk) await type(page, fr(g));
    const list = page.getByTestId("route-list");
    await expect(list.locator("li")).toHaveCount(walk.length + 2);
    await type(page, fr("POL"));
    await expect(page.getByTestId("route-wrap")).toHaveAttribute("data-branched", "true");
    await expect.poll(() => routeOf(page)).toBe("PRT ESP FRA BEL NLD DEU POL");
    await expect(list.locator("li")).toHaveCount(8); // 7 countries + the destination slot
    await expect(list).not.toContainText("Danemark"); // the abandoned segment left the list
    const scroll = page.getByTestId("route-scroll");
    await expect(scroll).toHaveAttribute("data-scrollable", "true");
    await expect.poll(() => scroll.evaluate((el) => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop)), { timeout: 20_000 }).toBeLessThan(3);
  });

  test("the scrollable list is reachable and usable with the keyboard", async ({ page }) => {
    await serve(page, custom("PRT", "KOR"));
    await expandSheet(page);
    for (const id of enter.slice(0, 6)) await type(page, fr(id));
    const scroll = page.getByTestId("route-scroll");
    await expect(scroll).toHaveAttribute("data-scrollable", "true");
    await expect(scroll).toHaveAttribute("tabindex", "0");
    await expect(scroll).toHaveAttribute("role", "region");
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop), { timeout: 20_000 }).toBeGreaterThan(0);
    await scroll.focus();
    await page.keyboard.press("Home");
    await expect.poll(() => scroll.evaluate((el) => el.scrollTop), { timeout: 20_000 }).toBe(0);
    await page.keyboard.press("End");
    await expect.poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop), { timeout: 20_000 }).toBeLessThan(3);
  });

  test("a list that fits is never scrolled by the app", async ({ page }) => {
    await serve(page, custom("FRA", "GRC"));
    await expandSheet(page);
    await type(page, fr("ITA"));
    const scroll = page.getByTestId("route-scroll");
    await expect(scroll).toHaveAttribute("data-scrollable", "false");
    await expect(scroll).not.toHaveAttribute("tabindex", /.*/); // not a focus stop when there is nothing to scroll
    expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0);
  });
});

test.describe("strait crossings and territorial disputes", () => {
  test("both options are in the configuration modal, off by default, and translated", async ({ page }) => {
    await page.goto("/fr/");
    await page.getByTestId("free-classic").click();
    await expect(page.getByTestId("cfg-straits")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("cfg-disputes")).toHaveAttribute("aria-checked", "false");
    await expect(page.getByTestId("cfg-links")).toContainText("Traversées de détroits");
    await expect(page.getByTestId("cfg-links")).toContainText("Territoires contestés");
    await page.goto("/en/");
    await page.getByTestId("free-classic").click();
    await expect(page.getByTestId("cfg-links")).toContainText("Strait crossings");
    await expect(page.getByTestId("cfg-links")).toContainText("Territorial disputes");
  });

  test("the options apply to the game, show on the map and in the rules, and are remembered for the next games (in any mode)", async ({ page }) => {
    await page.goto("/fr/");
    await page.getByTestId("free-classic").click();
    await page.getByTestId("cfg-diff-easy").click(); // the full map: links are drawn between every country that is displayed
    await page.getByTestId("cfg-straits").click();
    await page.getByTestId("cfg-start").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/straits=1/);
    await expect(page).not.toHaveURL(/disputes=1/);
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-ready", "true");
    await expect.poll(async () => (await links(page)).includes(":strait")).toBe(true);
    expect(await links(page)).not.toContain(":dispute");
    await expandSheet(page);
    await expect(page.getByTestId("constraints-body")).toContainText("Traversées de détroits autorisées");

    // remembered: a different mode, and a brand-new page load
    await page.goto("/fr/");
    await page.getByTestId("free-regional").click();
    await expect(page.getByTestId("cfg-straits")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("cfg-disputes")).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await page.getByTestId("free-classic").click();
    await expect(page.getByTestId("cfg-straits")).toHaveAttribute("aria-checked", "true");
    // and it can be switched off again
    await page.getByTestId("cfg-straits").click();
    await page.getByTestId("cfg-disputes").click();
    await page.getByTestId("cfg-start").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/disputes=1/);
    await expect(page).not.toHaveURL(/straits=1/);
  });

  test("a strait is a valid link only with the option: Dover makes France-Ireland possible; without it the answer is wrong", async ({ page }) => {
    await serve(page, custom("FRA", "IRL", "easy", { straits: true }));
    await type(page, fr("GBR"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won"); // Britain touches Ireland by land
    // a daily map is hidden while playing; once the game is over the whole map, links included, is shown
    await expect.poll(async () => await links(page)).toContain("FRA-GBR:strait");
  });

  test("territorial disputes: Gibraltar links Spain and Britain only when enabled; drawn as a dashed link", async ({ page }) => {
    await serve(page, custom("PRT", "GBR", "easy", { disputes: true }));
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-ready", "true");
    expect(await links(page)).toBe(""); // the daily map is hidden: a link to a country not shown yet is never drawn (nothing leaks)
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expect.poll(async () => await links(page)).toContain("ESP-GBR:dispute"); // the finished map shows the link
    expect(await links(page)).toContain("MAR-MRT:dispute");
    expect(await links(page)).not.toContain(":strait");
  });

  test("a game without the options draws no special link and treats the crossing as a wrong answer", async ({ page }) => {
    await serve(page, custom("FRA", "IRL"));
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-ready", "true");
    expect(await links(page)).toBe("");
    const total = Number(await page.getByTestId("attempts").first().getAttribute("data-left"));
    await type(page, fr("GBR"));
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", String(total - 1));
  });

  test("a hidden map only draws links between countries that are already shown", async ({ page }) => {
    await serve(page, custom("FRA", "GBR", "hard", { straits: true }));
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-masked", "true");
    await expect.poll(async () => await links(page)).toBe("FRA-GBR:strait"); // both ends are shown (start and destination); no other link leaks
  });

  test("DAILY challenges keep their own rules: the player's global preferences never change them", async ({ page }) => {
    // the player has both options switched on ...
    await page.addInitScript(() => localStorage.setItem("atlas-settings", JSON.stringify({ theme: "light", sound: false, labels: "route", straits: true, disputes: true })));
    // ... but this daily challenge was published without them
    await serve(page, custom("FRA", "IRL"));
    await expect(page.getByTestId("world-map")).toHaveAttribute("data-ready", "true");
    expect(await links(page)).toBe("");
    const total = Number(await page.getByTestId("attempts").first().getAttribute("data-left"));
    await type(page, fr("GBR")); // the strait is NOT valid in this daily
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", String(total - 1));
    await expandSheet(page);
    await expect(page.getByTestId("constraints-toggle")).toHaveAttribute("aria-expanded", "false"); // basic rule only
  });

  test("a daily that defines the straits option has it even when the player's preference is off", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("atlas-settings", JSON.stringify({ theme: "light", sound: false, labels: "route", straits: false, disputes: false })));
    await serve(page, custom("FRA", "IRL", "easy", { straits: true }));
    await expect.poll(async () => await links(page)).toContain("FRA-GBR:strait");
    await type(page, fr("GBR"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
  });

  test("hints use the option-aware graph: with straits the hint points across the strait", async ({ page }) => {
    await serve(page, custom("FRA", "IRL", "easy", { straits: true }));
    await expandSheet(page);
    await page.getByTestId("hint-letter").click();
    await expect(page.locator(".hint-letter")).toHaveText("R"); // Royaume-Uni, on the map
    await page.getByTestId("hint-borders").click();
    await page.getByTestId("hint-reveal").click(); // the name hint enters the country: Britain, across the strait, touches Ireland
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
  });
});
