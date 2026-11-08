import { expect, test, type Page } from "@playwright/test";
import { custom, expandSheet, fr, serve, type } from "./helpers";

test.use({ locale: "fr-FR" });

/**
 * Records every sparkle canvas that is added to the page and every victory-jingle note (1046.5 Hz).
 * The sparkles and the sound must follow a GENUINE win, once, and nothing else.
 */
async function spy(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __fx: { bursts: number; notes: number } };
    w.__fx = { bursts: 0, notes: 0 };
    const proto = OscillatorNode.prototype;
    const start = proto.start;
    proto.start = function (this: OscillatorNode, ...args: [number?]) {
      if (Math.abs(this.frequency.value - 1046.5) < 0.02) w.__fx.notes++;
      return start.apply(this, args);
    };
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if ((n as HTMLElement).dataset?.testid === "victory-burst") w.__fx.bursts++;
    }).observe(document, { childList: true, subtree: true });
  });
}
const fx = (page: Page) => page.evaluate(() => (window as unknown as { __fx: { bursts: number; notes: number } }).__fx);

const win = async (page: Page) => {
  await serve(page, custom("FRA", "PRT"));
  await type(page, fr("ESP"));
  await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
  await expect.poll(async () => (await fx(page)).bursts).toBe(1);
};

test.describe("victory sparkles and sound: only after a genuine win", () => {
  test("restarting IMMEDIATELY after a victory shows no sparkles and plays no second jingle", async ({ page }) => {
    await spy(page);
    await win(page);
    await expandSheet(page);
    await page.getByTestId("replay-same").click(); // straight away, while the first burst is still playing
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("combobox").first()).toBeEnabled();
    await expect(page.getByTestId("results")).toHaveCount(0);
    await expect(page.getByTestId("victory-burst")).toHaveCount(0); // the old burst is gone ...
    await page.waitForTimeout(1500);
    const r = await fx(page);
    expect(r.bursts).toBe(1); // ... and no new one was created
    expect(r.notes).toBe(2); // one jingle (C6 + the C5 overtone), not two
    await expect(page.getByTestId("victory-burst")).toHaveCount(0);
  });

  test("starting ANOTHER game from the results (the next daily) shows nothing", async ({ page }) => {
    await spy(page);
    await win(page);
    await expandSheet(page);
    await page.getByTestId("next-daily").click(); // a different challenge, started straight from the results
    await expect(page.getByRole("combobox").first()).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByTestId("results")).toHaveCount(0);
    await page.waitForTimeout(1500);
    const r = await fx(page);
    expect(r.bursts).toBe(1);
    expect(r.notes).toBe(2);
  });

  test("a restart does not carry over the previous game's toast or hint state", async ({ page }) => {
    await spy(page);
    await serve(page, custom("FRA", "PRT"));
    await expandSheet(page);
    await type(page, "Japon"); // a mistake: toast + one attempt used
    await page.getByTestId("hint-letter").click();
    await type(page, fr("ESP"));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expandSheet(page);
    await page.getByTestId("replay-same").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("combobox").first()).toBeEnabled();
    await expect(page.getByTestId("toast")).toHaveText(""); // no stale toast
    await expandSheet(page);
    await expect(page.getByTestId("hint-letter")).toHaveAttribute("data-status", "available"); // hints are fresh
    await expect(page.getByRole("combobox").first()).toHaveAttribute("placeholder", "Tape le nom d’un pays…"); // no stale hint text
  });

  test("a defeat followed by a restart never shows sparkles", async ({ page }) => {
    await spy(page);
    await serve(page, custom("FRA", "PRT"));
    await expandSheet(page);
    await page.getByRole("button", { name: "Abandonner" }).click();
    await page.getByRole("button", { name: "Confirmer" }).click();
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "lost");
    await page.getByTestId("replay-same").click();
    await expect(page.getByTestId("game-screen")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    expect(await fx(page)).toMatchObject({ bursts: 0, notes: 0 });
  });

  test("opening a previously completed daily shows no sparkles and no sound (it is restored, not won)", async ({ page }) => {
    await spy(page);
    await win(page); // completes the (fake) daily of that date
    await page.goto("/fr/");
    await page.goto("/fr/game/?daily=2099-01-01&mode=classic"); // the same daily again: restored as completed
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await page.waitForTimeout(1500);
    // the spy is installed again by the new page load: nothing may have fired in it
    expect(await fx(page)).toMatchObject({ bursts: 0, notes: 0 });
  });

  test("reloading the page after a victory shows no sparkles and no sound", async ({ page }) => {
    await spy(page);
    await win(page);
    await page.reload();
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await page.waitForTimeout(1500);
    expect(await fx(page)).toMatchObject({ bursts: 0, notes: 0 });
  });

  test("resuming a saved game in progress shows nothing; winning it afterwards celebrates once", async ({ page }) => {
    await spy(page);
    await serve(page, custom("FRA", "BGR"));
    await type(page, fr("DEU"));
    await page.goto("/fr/"); // leave mid-game
    await page.goto("/fr/game/?daily=2099-01-01&mode=classic"); // resume
    await expect(page.getByRole("combobox").first()).toBeEnabled();
    await page.waitForTimeout(1200);
    expect(await fx(page)).toMatchObject({ bursts: 0, notes: 0 });
    for (const g of ["AUT", "HUN", "ROU"]) await type(page, fr(g));
    await expect(page.getByTestId("results")).toHaveAttribute("data-status", "won");
    await expect.poll(async () => (await fx(page)).bursts).toBe(1);
    await page.waitForTimeout(800);
    expect((await fx(page)).notes).toBe(2);
  });

  test("changing mode or configuration on the home screen never triggers the effects", async ({ page }) => {
    await spy(page);
    await page.goto("/fr/");
    for (const id of ["free-classic", "free-constraints", "free-regional"]) {
      await page.getByTestId(id).click();
      await expect(page.getByTestId("config-modal")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    expect(await fx(page)).toMatchObject({ bursts: 0, notes: 0 });
  });
});
