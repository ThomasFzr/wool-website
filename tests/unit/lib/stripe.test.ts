import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";

async function load() {
  return (await import("@/lib/stripe")).getStripeInstance;
}

describe("getStripeInstance", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("refuse de fonctionner sans clé secrète", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    const getStripeInstance = await load();
    expect(() => getStripeInstance()).toThrow(/STRIPE_SECRET_KEY/);
  });

  it("crée un client Stripe unique réutilisé par tous les appels", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    const getStripeInstance = await load();
    const first = getStripeInstance();
    expect(first).toBeInstanceOf(Stripe);
    expect(getStripeInstance()).toBe(first);
  });
});
