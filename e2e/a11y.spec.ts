import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "fr-FR" });

async function audit(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
  // Let entrance animations and theme transitions finish: axe would otherwise measure a half-transparent frame.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(400);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .exclude("canvas") // the WebGL map is described by its aria-label and the text route summary
    .analyze();
  const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`)).toEqual([]);
}

const pages: [string, string][] = [
  ["home", "/fr/"],
  ["game", "/fr/game/?mode=classic&difficulty=easy&seed=ax1"],
  ["collection", "/fr/collection/"],
  ["stats", "/fr/stats/"],
  ["settings", "/fr/settings/"],
];

for (const theme of ["light", "dark"] as const) {
  for (const [name, url] of pages) {
    test(`${name} has no serious accessibility violation (${theme})`, async ({ page }) => {
      await page.goto(url);
      await page.waitForLoadState("networkidle");
      await audit(page, theme);
    });
  }
  test(`configuration modal (${theme})`, async ({ page }) => {
    await page.goto("/fr/");
    await page.getByTestId("free-classic").click();
    await expect(page.getByTestId("config-modal")).toBeVisible();
    await audit(page, theme);
  });
}
