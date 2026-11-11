import { vi } from "vitest";
import { getStripeInstance } from "@/lib/stripe";
import Creation from "@/models/Creation";

// À utiliser dans un fichier qui déclare :
//   vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));

/** Faux client Stripe : seules les méthodes utilisées par le tunnel de paiement. */
export function makeFakeStripe() {
  return {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
        expire: vi.fn().mockResolvedValue({}),
        listLineItems: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
    refunds: {
      create: vi.fn().mockResolvedValue({ id: "re_test", status: "succeeded" }),
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({ id: "pi_test", status: "succeeded" }),
    },
    webhooks: {
      constructEvent: vi.fn(),
    },
  };
}

export type FakeStripe = ReturnType<typeof makeFakeStripe>;

/** Installe un faux client Stripe neuf et le renvoie. */
export function installFakeStripe(): FakeStripe {
  const fake = makeFakeStripe();
  vi.mocked(getStripeInstance).mockReturnValue(fake as any);
  return fake;
}

/** Session Checkout payée et complète, surchargeable. */
export function paidSession(overrides: Record<string, any> = {}): any {
  return {
    id: "cs_test_1",
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    payment_intent: "pi_test",
    customer: "cus_test",
    customer_email: "client@example.com",
    amount_total: 4500,
    currency: "eur",
    metadata: {},
    ...overrides,
  };
}

/** Crée une pièce unique en base. */
export function createCreation(overrides: Record<string, any> = {}) {
  return Creation.create({
    title: "Bonnet Mérinos",
    price: 40,
    color: "Rose",
    type: "bonnet",
    images: ["https://img.example.com/bonnet.jpg"],
    ...overrides,
  });
}
