import { expect, test, type Page } from "@playwright/test";
import { createHint } from "../src/engine/hints";
import { resolveMove } from "../src/engine/rules";
import { graph } from "../src/lib/atlas";
import { custom, expandSheet, fr, serve, type } from "./helpers";

test.use({ locale: "fr-FR" });

const applied = async (page: Page) => (await page.getByTestId("world-map").getAttribute("data-applied")) ?? "";
const routeOf = async (page: Page) => (await page.getByTestId("world-map").getAttribute("data-route")) ?? "";

/** Records every oscillator the app starts (frequency in Hz): the victory jingle is the only sound containing 1046.5 Hz. */
async function spyAudio(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __starts: number[] };
    w.__starts = [];
    const proto = OscillatorNode.prototype;
    const start = proto.start;
    proto.start = function (this: OscillatorNode, ...args: [number?]) {
      w.__starts.push(Math.round(this.frequency.value * 100) / 100);
      return start.apply(this, args);
    };
  });
}
const starts = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number[] }).__starts);
const victoryNotes = async (page: Page) => (await starts(page)).filter((f) => Math.abs(f - 1046.5) < 0.02).length;

test.describe("changing direction, in real games", () => {
  // France -> Bulgaria: the player first wanders north (Germany, Denmark), then realises Austria is the better way
  const ch = custom("FRA", "BGR");

  test("a branch from a MIDDLE country replaces the route, repaints the map, keeps the discoveries and costs nothing", async ({ page }) => {
    expect(resolveMove(graph, ch, ["FRA", "DEU", "DNK"], "AUT")).toEqual({ valid: true, from: 1 }); // the scenario is what we think it is
    await serve(page, ch);
    await expandSheet(page);
    const total = await page.getByTestId("attempts").first().getAttribute("data-left");
    await type(page, fr("DEU"));
    await type(page, fr("DNK"));
    await expect.poll(() => routeOf(page)).toBe("FRA DEU DNK");
    expect(await applied(page)).toContain("DNK:traversed");

    await type(page, fr("AUT")); // touches Germany (middle of the route), closer to Bulgaria than Germany is
    await expect(page.getByTestId("route-wrap")).toHaveAttribute("data-branched", "true");
    await expect(page.getByTestId("toast")).toContainText("Nouvelle direction");
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", total!);

    // the active route (list AND map line) is France > Germany > Austria; Denmark left it
    const list = page.getByTestId("route-list");
    await expect(list).toContainText("Autriche");
    await expect(list).not.toContainText("Danemark");
    await expect.poll(() => routeOf(page)).toBe("FRA DEU AUT");
    // the map really holds the new states: Denmark is shown as an abandoned (but discovered) branch, Austria as traversed
    await expect.poll(() => applied(page)).toMatch(/AUT:traversed/);
    const states = await applied(page);
    expect(states).toContain("DNK:abandoned");
    expect(states).not.toContain("DNK:traversed");
    expect(states).toContain("DEU:traversed");

    // finish the game from the new end: Austria > Hungary > Romania (touches Bulgaria)
    await type(page, fr("HUN"));
    await type(page, fr("ROU"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    // the played route is France > Germany > Austria > ...; Denmark is NOT on it, yet it is listed among the new discoveries
    await expect(page.getByText("France → Allemagne → Autriche → Hongrie → Roumanie → Bulgarie").first()).toBeVisible();
    await expect(page.getByTestId("results")).not.toContainText("Danemark →");
    await expect(page.getByTestId("results")).not.toContainText("→ Danemark");
    await expect(page.getByTestId("results")).toContainText("Danemark"); // discovery history is kept
    const score = Number(await page.getByTestId("score").textContent());
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1000);

    // ... but Denmark stays in the collection (discovery history)
    const discovered = await page.evaluate(
      () =>
        new Promise<string[]>((resolve, reject) => {
          const open = indexedDB.open("atlas");
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const all = open.result.transaction("discovered").objectStore("discovered").getAllKeys();
            all.onsuccess = () => resolve(all.result as string[]);
          };
        }),
    );
    expect(discovered).toEqual(expect.arrayContaining(["DEU", "DNK", "AUT", "HUN", "ROU"]));
  });

  test("a country linked to several earlier countries uses the latest of them", async ({ page }) => {
    // Spain > France > Switzerland > Italy, then Germany touches France (index 1) AND Switzerland (index 2), nearer Poland than both:
    // the later connection keeps the most progress
    const c = custom("ESP", "POL");
    expect(resolveMove(graph, c, ["ESP", "FRA", "CHE", "ITA"], "DEU")).toEqual({ valid: true, from: 2 });
    await serve(page, c);
    await expandSheet(page);
    for (const g of ["FRA", "CHE", "ITA"]) await type(page, fr(g));
    await expect.poll(() => routeOf(page)).toBe("ESP FRA CHE ITA");
    await type(page, fr("DEU"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won"); // Germany touches Poland
    const finalRoute = await routeOf(page); // after a win the map route also ends on the destination
    expect(finalRoute.startsWith("ESP FRA CHE DEU")).toBe(true); // Switzerland was kept ...
    expect(finalRoute).not.toContain("ITA"); // ... and Italy left the route
  });

  test("a forbidden country is never accepted, branch or not", async ({ page }) => {
    const c = custom("FRA", "BGR", "easy", { forbidden: ["AUT"] });
    await serve(page, c);
    const total = Number(await page.getByTestId("attempts").first().getAttribute("data-left"));
    await type(page, fr("DEU"));
    await type(page, fr("DNK"));
    await type(page, fr("AUT"));
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", String(total - 1));
    await expect.poll(() => routeOf(page)).toBe("FRA DEU DNK");
  });

  test("a branch that would drop a mandatory country is an ordinary wrong answer", async ({ page }) => {
    const c = custom("FRA", "PRT", "easy", { mandatory: ["CHE"] });
    await serve(page, c);
    const total = Number(await page.getByTestId("attempts").first().getAttribute("data-left"));
    await type(page, fr("CHE"));
    await type(page, fr("ITA"));
    await type(page, fr("ESP")); // touches France and is nearer Portugal, but would remove Switzerland from the route
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", String(total - 1));
    await expect.poll(() => routeOf(page)).toBe("FRA CHE ITA");
  });

  test("a branch can win the game, and the abandoned branch costs no point", async ({ page }) => {
    await serve(page, custom("FRA", "PRT"));
    for (const g of ["BEL", "NLD", "DEU"]) await type(page, fr(g));
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expect(page.getByTestId("score")).toHaveText("1000");
  });
});

const placeholderOf = async (page: Page) => (await page.getByRole("combobox").first().getAttribute("placeholder")) ?? "";
const hintedOnMap = async (page: Page) =>
  ((await page.getByTestId("world-map").getAttribute("data-applied")) ?? "").split(" ").filter((x) => /:(hint|reveal)$/.test(x)).map((x) => x.split(":")[0]);
const clickHint = async (page: Page, k: "letter" | "borders" | "reveal") => page.getByTestId(`hint-${k}`).click(); // immediate: no confirmation step
const letterOf = (id: string) => fr(id).normalize("NFD").replace(/[̀-ͯ]/g, "")[0].toUpperCase();

test.describe("hints on the map (letter marker, outline, and the name hint that ENTERS the country)", () => {
  const ch = custom("FRA", "GRC"); // far enough that the hinted country does not end the game

  test("hint 1 puts the first letter on the map at the suggested country, and never touches the input", async ({ page }) => {
    await serve(page, ch);
    await expandSheet(page);
    const id = createHint(graph, ch, ["FRA"], "letter", [])!.countryId;
    await clickHint(page, "letter");
    await expect(page.locator(".hint-letter")).toHaveText(letterOf(id)); // no name, no outline
    expect(await hintedOnMap(page)).toEqual([]); // nothing outlined or filled by a letter hint
    await expect(page.getByTestId("toast")).toContainText("75");
    expect(await placeholderOf(page)).toBe("Tape le nom d’un pays…"); // the input is untouched
    await expect(page.getByRole("combobox").first()).toHaveValue("");
  });

  test("hint 2 outlines exactly that country; hint 3 then ENTERS it: the route grows, the cost is 300, no attempt is used", async ({ page }) => {
    await serve(page, ch);
    await expandSheet(page);
    const id = createHint(graph, ch, ["FRA"], "reveal", [])!.countryId;
    const total = String(ch.attempts);
    await clickHint(page, "letter");
    await clickHint(page, "borders");
    await expect.poll(() => hintedOnMap(page)).toEqual([id]); // exactly one country is highlighted
    await expect(page.locator(".hint-letter")).toHaveText(letterOf(id)); // the same country as the letter
    await expect(page.getByTestId("hint-reveal")).toContainText("−300");
    await clickHint(page, "reveal");
    await expect.poll(() => routeOf(page)).toBe(`FRA ${id}`); // validated: it is now part of the route
    await expect(page.getByTestId("toast")).toContainText("ajouté");
    await expect(page.getByTestId("toast")).toContainText("300");
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", total); // no attempt consumed
    await expect(page.getByTestId("hint-reveal")).toBeDisabled(); // once per game
    // the hint overlays are gone: the country was followed
    await expect.poll(() => hintedOnMap(page)).toEqual([]);
    await expect(page.locator(".hint-letter")).toHaveCount(0);
    expect(await placeholderOf(page)).toBe("Tape le nom d’un pays…");
  });

  test("the name hint can finish the game, and the score keeps all three penalties (375)", async ({ page }) => {
    await serve(page, custom("FRA", "PRT"));
    await expandSheet(page);
    for (const k of ["letter", "borders", "reveal"] as const) await clickHint(page, k);
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won"); // Spain was entered and touches Portugal
    await expect(page.getByTestId("score")).toHaveText("375"); // 500 + 300 + 100 - (75 + 150 + 300)
    await expect(page.getByTestId("hint-letter")).toHaveCount(0); // no hints panel once the game is won
    await expect(page.getByTestId("hint-reveal")).toHaveCount(0);
    await expect(page.getByTestId("results")).not.toContainText("Indices"); // and no hints recap in the results
  });

  test("the name hint respects the game rules: it enters a country the game itself would accept", async ({ page }) => {
    const mandatory = custom("FRA", "POL", "easy", { mandatory: ["CHE"] });
    await serve(page, mandatory);
    await expandSheet(page);
    for (const k of ["letter", "borders", "reveal"] as const) await clickHint(page, k);
    await expect.poll(() => routeOf(page)).toBe("FRA CHE"); // the only way to satisfy the mandatory country
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
  });

  test("the player can keep typing while a hint is shown", async ({ page }) => {
    await serve(page, ch);
    await expandSheet(page);
    const input = page.getByRole("combobox").first();
    await input.fill("Itali");
    await clickHint(page, "letter");
    await expect(input).toHaveValue("Itali");
    await input.fill("Italie");
    await expect(input).toHaveValue("Italie");
  });

  test("the map highlight never shows a name and never reveals other countries", async ({ page }) => {
    const far = custom("FRA", "GRC", "hard"); // hidden map: only the shapes that are shown are drawn
    await serve(page, far);
    await expandSheet(page);
    const map = page.getByTestId("world-map");
    const shown = await map.getAttribute("data-shown");
    const labels = await page.locator(".atlas-label").count();
    await clickHint(page, "letter");
    await clickHint(page, "borders");
    await expect(map).toHaveAttribute("data-shown", String(Number(shown) + 1)); // exactly one more shape
    expect(await page.locator(".atlas-label").count()).toBe(labels); // no name label
    expect((await hintedOnMap(page)).length).toBe(1);
  });

  test("from a dead end the name hint takes the way back out: a change of direction, entered for the player", async ({ page }) => {
    await serve(page, ch);
    await expandSheet(page);
    await type(page, fr("ESP"));
    await type(page, fr("PRT")); // dead end
    const id = createHint(graph, ch, ["FRA", "ESP", "PRT"], "reveal", [])!.countryId;
    expect(resolveMove(graph, ch, ["FRA", "ESP", "PRT"], id).from).toBeLessThan(2); // it is a change of direction
    for (const k of ["letter", "borders", "reveal"] as const) await clickHint(page, k);
    await expect(page.getByTestId("route-wrap")).toHaveAttribute("data-branched", "true");
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
    await expect.poll(() => routeOf(page)).toMatch(new RegExp(`${id}$`));
  });

  test("after a change of direction an outdated hint disappears from the map instead of misleading", async ({ page }) => {
    // search the engine for a real situation: a hint given at [FRA, A], then a change of direction to G after which the
    // hinted country H can no longer be entered
    const find = () => {
      for (const dest of ["GRC", "BGR", "POL", "UKR", "TUR", "SWE"]) {
        const c = custom("FRA", dest);
        const view = graph.viewFor(c.rules, ["FRA", dest]);
        for (const a of graph.neighbors("FRA", view)) {
          if (a === dest || resolveMove(graph, c, ["FRA"], a).from !== 0) continue;
          const h = createHint(graph, c, ["FRA", a], "letter", [])?.countryId;
          if (!h) continue;
          for (const g of graph.neighbors("FRA", view)) {
            if (g === a || g === dest || g === h) continue;
            if (resolveMove(graph, c, ["FRA", a], g).from !== 0) continue;
            if (!resolveMove(graph, c, ["FRA", g], h).valid) return { c, a, g, h };
          }
        }
      }
      return null;
    };
    const found = find();
    test.skip(!found, "no such situation in the sampled pairs");
    const { c, a, g, h } = found!;
    await serve(page, c);
    await expandSheet(page);
    await type(page, fr(a));
    await clickHint(page, "letter");
    await clickHint(page, "borders");
    await expect(page.locator(".hint-letter")).toHaveText(letterOf(h));
    await expect.poll(() => hintedOnMap(page)).toEqual([h]);
    await type(page, fr(g)); // change of direction from France
    await expect(page.getByTestId("route-wrap")).toHaveAttribute("data-branched", "true");
    await expect(page.locator(".hint-letter")).toHaveCount(0); // the stale hint is gone
    await expect.poll(() => hintedOnMap(page)).toEqual([]);
    await expect(page.getByTestId("hint-letter")).toHaveAttribute("data-status", "used"); // still spent (once per game)
  });

  test("hint buttons show their state: available, locked (order), used", async ({ page }) => {
    await serve(page, ch);
    await expandSheet(page);
    await expect(page.getByTestId("hint-letter")).toHaveAttribute("data-status", "available");
    await expect(page.getByTestId("hint-borders")).toHaveAttribute("data-status", "locked");
    await expect(page.getByTestId("hint-reveal")).toHaveAttribute("data-status", "locked");
    await clickHint(page, "letter");
    await expect(page.getByTestId("hint-letter")).toHaveAttribute("data-status", "used");
    await expect(page.getByTestId("hint-borders")).toHaveAttribute("data-status", "available");
  });
});

test.describe("victory celebration", () => {
  test("a victory shows a sparkle burst that never blocks the results, then disappears", async ({ page }) => {
    // The software-rendered map keeps the page busy, so everything about the canvas is checked inside ONE in-page script
    // (separate round trips could outlast the few seconds the burst lives).
    await page.addInitScript(() => {
      (window as unknown as { __inspectBurst: () => Promise<unknown> }).__inspectBurst = () =>
        new Promise((resolve) => {
          const find = () => document.querySelector<HTMLCanvasElement>('[data-testid="victory-burst"]');
          const t0 = performance.now();
          const waitFor = setInterval(() => {
            const c = find();
            if (!c && performance.now() - t0 > 15000) {
              clearInterval(waitFor);
              resolve({ appeared: false });
            }
            if (!c) return;
            clearInterval(waitFor);
            const shownAt = performance.now();
            const pointerEvents = getComputedStyle(c).pointerEvents;
            let painted = false;
            let underPointer = true;
            // sample the pixels around the first burst for as long as the canvas lives
            const poll = setInterval(() => {
              const live = find();
              if (!live) {
                clearInterval(poll);
                resolve({ appeared: true, pointerEvents, painted, underPointer, lifetime: performance.now() - shownAt });
                return;
              }
              const r = live.getBoundingClientRect();
              underPointer = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === live;
              if (painted) return;
              const g = live.getContext("2d")!;
              const x = Math.max(0, Math.round(live.width * 0.5 - 200));
              const y = Math.max(0, Math.round(live.height * 0.34 - 200));
              const data = g.getImageData(x, y, Math.min(400, live.width - x), Math.min(400, live.height - y)).data;
              for (let i = 3; i < data.length; i += 4) if (data[i] > 0) { painted = true; break; }
            }, 150);
          }, 20);
        });
    });
    await serve(page, custom("FRA", "PRT"));
    const inspection = page.evaluate(() => (window as unknown as { __inspectBurst: () => Promise<unknown> }).__inspectBurst());
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expandSheet(page);
    await expect(page.getByTestId("score")).toBeVisible(); // the results are usable while the burst plays
    const r = (await inspection) as { appeared: boolean; pointerEvents: string; painted: boolean; underPointer: boolean; lifetime: number };
    expect(r.appeared).toBe(true);
    expect(r.pointerEvents).toBe("none"); // it can never block a click
    expect(r.underPointer).toBe(false);
    expect(r.painted).toBe(true); // it really draws particles
    // It lasts BURST_MS (3.5 s) and then removes itself. The upper bound is loose on purpose: in this headless run the
    // software-rendered map starves timers, so a 3.5 s timeout can fire several seconds late.
    expect(r.lifetime).toBeGreaterThan(2000);
    expect(r.lifetime).toBeLessThan(12000);
    await expect(page.getByTestId("victory-burst")).toHaveCount(0);
  });

  test("a defeat shows no burst and plays no victory sound", async ({ page }) => {
    await spyAudio(page);
    await serve(page, custom("FRA", "PRT"));
    await expandSheet(page);
    await page.getByRole("button", { name: "Abandonner" }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "lost");
    await page.waitForTimeout(800);
    await expect(page.getByTestId("victory-burst")).toHaveCount(0);
    expect(await victoryNotes(page)).toBe(0);
  });

  test("the victory sound plays exactly once, offline too, and not again when browsing the results", async ({ page, context }) => {
    await spyAudio(page);
    await serve(page, custom("FRA", "PRT"));
    await context.setOffline(true); // the jingle is synthesised: nothing to download
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expect.poll(() => victoryNotes(page)).toBe(2); // C6 + the octave overtone of C5: one jingle
    await expandSheet(page);
    for (const choice of (await page.locator('[data-testid^="route-choice-"]').all()).slice(0, 3)) await choice.click({ timeout: 1500 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    expect(await victoryNotes(page)).toBe(2);
  });

  test("with sound effects off, a victory is silent; the choice survives a reload", async ({ page }) => {
    await spyAudio(page);
    await page.addInitScript(() => {
      new MutationObserver((ms) => {
        for (const m of ms) for (const n of m.addedNodes) if ((n as HTMLElement).dataset?.testid === "victory-burst") (window as unknown as { __burstSeen: boolean }).__burstSeen = true;
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto("/fr/settings/");
    const toggle = page.getByRole("switch", { name: "Effets sonores" });
    await expect(toggle).toHaveAttribute("aria-checked", "true"); // on by default
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.reload();
    await expect(page.getByRole("switch", { name: "Effets sonores" })).toHaveAttribute("aria-checked", "false"); // persisted
    await serve(page, custom("FRA", "PRT"));
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    // the visual celebration is independent of the sound setting (recorded in-page: it only lives a few seconds)
    await expect.poll(() => page.evaluate(() => (window as unknown as { __burstSeen?: boolean }).__burstSeen === true)).toBe(true);
    await page.waitForTimeout(800);
    expect(await starts(page)).toEqual([]); // no oscillator at all
  });

  test("with reduced motion requested there is no particle animation (the sound still plays)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await spyAudio(page);
    await serve(page, custom("FRA", "PRT"));
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await page.waitForTimeout(600);
    await expect(page.getByTestId("victory-burst")).toHaveCount(0);
    expect(await victoryNotes(page)).toBe(2);
  });
});

test.describe("achievement explanations", () => {
  test("a discreet ? opens a readable explanation (hover or tap), inside the viewport, and Escape closes it", async ({ page }, info) => {
    await page.goto("/fr/collection/");
    const icon = page.getByTestId("achievement-info-geographer");
    await icon.scrollIntoViewIfNeeded();
    await expect(icon).toBeVisible();
    const popover = page.getByTestId("achievement-popover-geographer");
    await expect(popover).toHaveCount(0); // collapsed by default: nothing cluttering the list

    if (info.project.name === "mobile") await icon.tap();
    else await icon.hover();
    await expect(popover).toBeVisible();
    await expect(popover).toContainText("Géographe");
    await expect(popover).toContainText("Comment le débloquer");
    await expect(popover).toContainText("10 parties avec un itinéraire optimal");
    await expect(popover.getByTestId("achievement-progress")).toContainText("/ 10");
    const box = (await popover.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height).toBeLessThanOrEqual(vp.height);

    await page.keyboard.press("Escape");
    await expect(popover).toHaveCount(0);
  });

  test("works on a narrow screen and in English, and tapping elsewhere dismisses it", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto("/en/collection/");
    const icon = page.getByTestId("achievement-info-first-journey");
    await icon.scrollIntoViewIfNeeded();
    await icon.click();
    const popover = page.getByTestId("achievement-popover-first-journey");
    await expect(popover).toContainText("How to unlock it");
    await expect(popover).toContainText("Discover 5 different countries");
    const box = (await popover.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await page.mouse.click(5, 5);
    await expect(popover).toHaveCount(0);
  });

  test("keyboard users can open it with Enter", async ({ page }) => {
    await page.goto("/fr/collection/");
    const icon = page.getByTestId("achievement-info-globe-trotter");
    await icon.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("achievement-popover-globe-trotter")).toContainText("50 pays différents");
  });
});

test.describe("a wrong country submitted twice", () => {
  test("costs one mistake the first time and nothing afterwards", async ({ page }) => {
    await serve(page, custom("FRA", "PRT"));
    const attempts = page.getByTestId("attempts").first();
    const total = Number(await attempts.getAttribute("data-left"));
    await type(page, "Japon");
    await expect(page.getByTestId("toast")).toContainText("Incorrect");
    await expect(attempts).toHaveAttribute("data-left", String(total - 1));
    await type(page, "Japon");
    await expect(page.getByTestId("toast")).toContainText("Déjà essayé");
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
    await expect(attempts).toHaveAttribute("data-left", String(total - 1)); // unchanged
    await type(page, "Japon");
    await expect(attempts).toHaveAttribute("data-left", String(total - 1));
    await type(page, "Brésil"); // a different wrong country still counts
    await expect(attempts).toHaveAttribute("data-left", String(total - 2));
    // the game goes on and can still be won
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
  });
});

test.describe("the game panel", () => {
  test("shows progress, then the input, then a one-line hints row; the rules are collapsed unless there is more than the basic rule", async ({ page }, info) => {
    await serve(page, custom("FRA", "PRT"));
    if (info.project.name === "mobile") {
      // collapsed sheet: the input is there, the rest is not
      await expect(page.getByRole("combobox").first()).toBeVisible();
      await expect(page.getByTestId("hint-letter")).toBeHidden();
    }
    await expandSheet(page);
    const route = (await page.getByTestId("route-wrap").boundingBox())!;
    const input = (await page.getByRole("combobox").first().boundingBox())!;
    const hints = ["letter", "borders", "reveal"].map((k) => page.getByTestId(`hint-${k}`));
    const boxes = await Promise.all(hints.map((h) => h.boundingBox()));
    expect(route.y).toBeLessThan(input.y); // progress, then the thing to do
    expect(boxes[0]!.y).toBeGreaterThan(input.y); // help after the input
    expect(Math.abs(boxes[0]!.y - boxes[2]!.y)).toBeLessThan(4); // the three hints share one line
    for (const h of hints) expect(Number((await h.boundingBox())!.height)).toBeLessThan(80);
    await expect(hints[0]).toContainText("75");
    await expect(hints[1]).toContainText("150");
    await expect(hints[2]).toContainText("300");

    const toggle = page.getByTestId("constraints-toggle");
    await expect(toggle).toHaveAttribute("aria-expanded", "false"); // a plain land-only game: nothing worth showing
    await expect(page.getByTestId("constraints-body")).toHaveCount(0);
    await toggle.click();
    await expect(page.getByTestId("constraints-body")).toBeVisible();
    await toggle.click();
    await expect(page.getByTestId("constraints-body")).toHaveCount(0);
  });

  test("a challenge with real constraints shows them right away", async ({ page }) => {
    await serve(page, custom("FRA", "PRT", "easy", { mandatory: ["CHE"] }));
    await expandSheet(page);
    await expect(page.getByTestId("constraints-toggle")).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("constraints-body")).toContainText("Suisse");
  });
});
