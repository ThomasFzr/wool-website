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

  it("vise le faux serveur Stripe des tests e2e quand STRIPE_API_BASE_URL est définie", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_API_BASE_URL", "http://localhost:3101");
    const getStripeInstance = await load();
    const config = (getStripeInstance() as any)._api;
    expect(config).toMatchObject({ host: "localhost", port: "3101", protocol: "http" });
  });

  it("accepte une URL https", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_API_BASE_URL", "https://stripe-mock.example.com:12112");
    const getStripeInstance = await load();
    expect((getStripeInstance() as any)._api).toMatchObject({
      host: "stripe-mock.example.com",
      protocol: "https",
    });
  });

  it("ignore STRIPE_API_BASE_URL en production", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
    vi.stubEnv("STRIPE_API_BASE_URL", "http://localhost:3101");
    vi.stubEnv("NODE_ENV", "production");
    const getStripeInstance = await load();
    expect((getStripeInstance() as any)._api.host).toBe("api.stripe.com");
  });
});
