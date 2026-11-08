import { expect, test } from "@playwright/test";

test.use({ locale: "fr-FR" });

test.describe("the Atlas logo", () => {
  test("the header shows the stylized A (always) and the wordmark (from small screens up), named Atlas for assistive technology", async ({ page }, info) => {
    await page.goto("/fr/");
    const mark = page.getByTestId("brand-mark");
    await expect(mark).toBeVisible();
    const box = (await mark.boundingBox())!;
    expect(box.height).toBeGreaterThan(20);
    expect(box.width / box.height).toBeCloseTo(460 / 326, 1); // the real proportions of the artwork
    const maskUrl = await mark.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
    expect(maskUrl).toContain("/logo/mark.png");
    await expect(page.getByRole("link", { name: "Atlas" }).first()).toBeVisible();
    if (info.project.name === "mobile") await expect(page.getByTestId("brand-word")).toBeHidden();
    else {
      await expect(page.getByTestId("brand-word")).toBeVisible();
      expect(await page.getByTestId("brand-word").evaluate((el) => getComputedStyle(el).maskImage)).toContain("/logo/wordmark.png");
    }
    // the artwork really loaded (a failed mask would leave a solid rectangle): a PNG is served for both
    for (const url of ["/logo/mark.png", "/logo/wordmark.png"]) {
      const res = await page.request.get(url);
      expect(res.status(), url).toBe(200);
      expect(res.headers()["content-type"], url).toContain("image/png");
    }
  });

  test("the logo stays readable in both themes (3:1 against the header background)", async ({ page }) => {
    await page.goto("/fr/");
    const lum = (rgb: string) => {
      const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ["0", "0", "0"]).slice(0, 3).map((v) => Number(v) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const seen: string[] = [];
    for (const theme of ["light", "dark"]) {
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      const { fg, bg } = await page.getByTestId("brand-mark").evaluate((el) => ({
        fg: getComputedStyle(el).backgroundColor,
        bg: getComputedStyle(document.body).backgroundColor,
      }));
      seen.push(fg);
      const [a, b] = [lum(fg), lum(bg)];
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(3);
    }
    expect(new Set(seen).size).toBe(2); // a different tint per theme
  });
});

test.describe("favicon and app icons", () => {
  test("the page declares the A as its favicon (ico + PNG) and the Apple touch icon, and every file is served as an image", async ({ page }) => {
    await page.goto("/fr/");
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')).map((l) => l.getAttribute("href")));
    expect(hrefs).toEqual(expect.arrayContaining(["/favicon.ico", "/icons/favicon-32.png", "/icons/favicon-48.png", "/icons/apple-touch-icon.png"]));
    expect(hrefs.join(" ")).not.toContain(".svg"); // the old globe is gone
    for (const href of hrefs as string[]) {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
      expect(res.headers()["content-type"], href).toMatch(/image\//);
      expect((await res.body()).length, href).toBeGreaterThan(300);
    }
  });

  test("the web app manifest lists only the new icons, each served with the declared type", async ({ page }) => {
    const manifest = await (await page.request.get("/manifest.webmanifest")).json();
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`).sort()).toEqual(["192x192/any", "512x512/any", "512x512/maskable"]);
    for (const icon of manifest.icons as { src: string; type: string }[]) {
      const res = await page.request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()["content-type"], icon.src).toContain(icon.type);
    }
    expect((await page.request.get("/icons/icon.svg")).status()).toBe(404); // the old icon is no longer published
  });
});
