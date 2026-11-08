import { defineConfig, devices } from "@playwright/test";

const launchOptions = { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"] };

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1, // software WebGL (SwiftShader) is CPU-heavy: parallel workers cause timing flakes
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173", storageState: "e2e/.state/tutorial-done.json", trace: "retain-on-failure", launchOptions },
  // Serves the static export (npm run build first).
  webServer: { command: "npx serve out -l 4173 --no-clipboard", url: "http://localhost:4173/fr/", reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions } },
  ],
});
