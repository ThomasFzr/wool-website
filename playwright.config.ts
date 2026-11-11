import { defineConfig, devices } from "@playwright/test";
import { E2E_APP_PORT } from "./tests/e2e/data";

// Les tests partagent une seule base (remise à zéro avant chaque test) : exécution en série.
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `next dev` compile chaque page à la première visite
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${E2E_APP_PORT}`,
    locale: "fr-FR",
    trace: "retain-on-failure",
    navigationTimeout: 45_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx tests/e2e/server/start.ts",
    url: `http://localhost:${E2E_APP_PORT}/api/version`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
  },
});
