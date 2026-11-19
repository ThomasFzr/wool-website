// Suite e2e branchée sur le vrai Stripe en mode test (ports distincts de tests/e2e).
export { E2E_ADMIN, E2E_CLIENT, E2E_CREATIONS } from "../e2e/data";

export const STRIPE_E2E_APP_PORT = 3200;
export const STRIPE_E2E_CONTROL_PORT = 3201;
export const STRIPE_E2E_APP_URL = `http://localhost:${STRIPE_E2E_APP_PORT}`;
export const STRIPE_E2E_CONTROL_URL = `http://localhost:${STRIPE_E2E_CONTROL_PORT}`;
export const STRIPE_E2E_HIBP_PORT = 3202;

/** Fichier (ignoré par git) qui contient STRIPE_SECRET_KEY=sk_test_… */
export const STRIPE_TEST_ENV_FILE = ".env.stripe-test.local";

/** Cartes de test Stripe : https://docs.stripe.com/testing */
export const TEST_CARDS = {
  success: "4242424242424242",
  declined: "4000000000000002",
  threeDSecure: "4000002500003155",
} as const;
