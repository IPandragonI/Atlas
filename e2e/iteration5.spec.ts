import { expect, test, type Page } from "@playwright/test";
import { createHint, hintCandidates } from "../src/engine/hints";
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

test.describe("hint 3 — the full name of a valid next country", () => {
  const ch = custom("FRA", "AUT");

  test("is locked until hints 1 and 2 are used, costs 300 (shown before confirming), names a valid country and plays nothing", async ({ page }) => {
    await serve(page, ch);
    await expandSheet(page);
    const reveal = page.getByTestId("hint-reveal");
    await expect(reveal).toBeDisabled();
    await expect(reveal).toContainText("−300");
    await page.getByTestId("hint-letter").click();
    await page.getByTestId("hint-confirm").click();
    await expect(reveal).toBeDisabled(); // hint 2 is still missing
    await page.getByTestId("hint-borders").click();
    await page.getByTestId("hint-confirm").click();
    await expect(reveal).toBeEnabled();

    await reveal.click();
    await expect(page.getByTestId("hint-confirm-box")).toContainText("300"); // the penalty is announced before it is applied
    await page.getByTestId("hint-cancel").click();
    await expect(page.getByTestId("hint-item-reveal")).toHaveCount(0); // cancelling costs nothing and reveals nothing
    await reveal.click();
    await page.getByTestId("hint-confirm").click();

    const text = (await page.getByTestId("hint-item-reveal").textContent()) ?? "";
    const valid = hintCandidates(graph, ch, ["FRA"]).map(fr);
    expect(valid.some((n) => text.includes(n)), `"${text}" should name one of ${valid.join(", ")}`).toBe(true);
    await expect(reveal).toBeDisabled(); // once per game
    await expect(page.getByTestId("attempts").first()).toHaveAttribute("data-left", String(ch.attempts)); // no attempt consumed
    await expect.poll(() => routeOf(page)).toBe("FRA"); // nothing was entered for the player
  });

  test("the three hints describe the same country, and following the hint is accepted", async ({ page }) => {
    const ch = custom("FRA", "GRC"); // far enough that the hinted country does not end the game
    await serve(page, ch);
    await expandSheet(page);
    for (const k of ["letter", "borders", "reveal"]) {
      await page.getByTestId(`hint-${k}`).click();
      await page.getByTestId("hint-confirm").click();
    }
    const id = createHint(graph, ch, ["FRA"], "reveal", [])!.countryId;
    await expect(page.getByTestId("hint-item-reveal")).toContainText(fr(id));
    await type(page, fr(id));
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
    await expect(page.getByTestId("hint-item-reveal")).toHaveAttribute("data-liveness", /followed|live/);
  });

  test("works with a change of direction: from a dead end it proposes the way back out, which is then accepted", async ({ page }) => {
    const far = custom("FRA", "GRC");
    await serve(page, far);
    await expandSheet(page);
    await type(page, fr("ESP"));
    await type(page, fr("PRT")); // dead end
    for (const k of ["letter", "borders", "reveal"]) {
      await page.getByTestId(`hint-${k}`).click();
      await page.getByTestId("hint-confirm").click();
    }
    const id = createHint(graph, far, ["FRA", "ESP", "PRT"], "reveal", [])!.countryId;
    expect(resolveMove(graph, far, ["FRA", "ESP", "PRT"], id).from).toBeLessThan(2); // it is a change of direction
    await expect(page.getByTestId("hint-item-reveal")).toContainText(fr(id));
    await type(page, fr(id));
    await expect(page.getByTestId("route-wrap")).toHaveAttribute("data-branched", "true");
    await expect(page.getByTestId("toast")).not.toContainText("Incorrect");
  });

  test("a hint about a route the player has left is shown as outdated, never as guidance", async ({ page }) => {
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
            if (!resolveMove(graph, c, ["FRA", g], h).valid) return { c, a, g };
          }
        }
      }
      return null;
    };
    const found = find();
    test.skip(!found, "no such situation in the sampled pairs");
    const { c, a, g } = found!;
    await serve(page, c);
    await expandSheet(page);
    await type(page, fr(a));
    await page.getByTestId("hint-letter").click();
    await page.getByTestId("hint-confirm").click();
    await expect(page.getByTestId("hint-item-letter")).toHaveAttribute("data-liveness", "live");
    await type(page, fr(g)); // change of direction from France
    await expect(page.getByTestId("route-wrap")).toHaveAttribute("data-branched", "true");
    await expect(page.getByTestId("hint-item-letter")).toHaveAttribute("data-liveness", "outdated");
    await expect(page.getByTestId("hint-item-letter")).toContainText("ne correspond plus");
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
