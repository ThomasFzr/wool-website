import { defineConfig, devices } from "@playwright/test";
import { STRIPE_E2E_APP_URL } from "./tests/e2e-stripe/data";

// Suite e2e sur le vrai Stripe (mode test) : `npm run test:e2e:stripe`.
// Prérequis : CLI `stripe` installée et .env.stripe-test.local (STRIPE_SECRET_KEY=sk_test_…).
export default defineConfig({
  testDir: "tests/e2e-stripe",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Vraie page Stripe Checkout + webhooks relayés : plus lent que le faux Stripe
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: "list",
  use: {
    baseURL: STRIPE_E2E_APP_URL,
    locale: "fr-FR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npx tsx tests/e2e-stripe/server/start.ts",
    url: `${STRIPE_E2E_APP_URL}/api/version`,
    timeout: 240_000,
    reuseExistingServer: true,
    stdout: "pipe",
    stderr: "pipe",
  },
});
