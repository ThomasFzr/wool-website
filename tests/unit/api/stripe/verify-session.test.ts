import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/stripe/verify-session/route";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";
import { createCreation, installFakeStripe, paidSession, type FakeStripe } from "../../../helpers/stripe-fake";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

let stripe: FakeStripe;

const verify = (query = "?session_id=cs_test_1") => GET(makeRequest(`/api/stripe/verify-session${query}`));

/** Les attentes entre deux tentatives sont exécutées immédiatement. */
function skipRetryDelay() {
  return vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
    fn();
    return 0;
  }) as any);
}

async function seedPendingOrder() {
  const creation = await createCreation({ reserved: true, reservedContact: "client@example.com" });
  await Reservation.create({
    creationId: creation._id,
    name: "Alice",
    contact: "client@example.com",
    paymentStatus: "pending",
    status: "preparing",
    stripeCheckoutSessionId: "cs_test_1",
  });
  return creation;
}

describe("GET /api/stripe/verify-session", () => {
  beforeEach(async () => {
    await connectToDatabase();
    stripe = installFakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession());
    vi.mocked(sendEmail).mockResolvedValue({ data: { id: "email" }, error: null } as any);
    asUser();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("répond 500 quand Stripe n'est pas configuré", async () => {
    vi.mocked(getStripeInstance).mockImplementation(() => {
      throw new Error("STRIPE_SECRET_KEY n'est pas définie");
    });
    const { status, body } = await readJson(await verify());
    expect(status).toBe(500);
    expect(body).toEqual({ valid: false });
  });

  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    const { status, body } = await readJson(await verify());
    expect(status).toBe(401);
    expect(body).toEqual({ valid: false });
  });

  it("exige le paramètre session_id", async () => {
    expect((await verify("")).status).toBe(400);
  });

  it("refuse la session d'un autre client sans rien traiter", async () => {
    await seedPendingOrder();
    asUser("intrus@example.com");
    const { status, body } = await readJson(await verify());
    expect(status).toBe(403);
    expect(body).toEqual({ valid: false });
    expect((await Reservation.findOne())!.paymentStatus).toBe("pending");
  });

  it("finalise la commande payée et renvoie le récapitulatif", async () => {
    const creation = await seedPendingOrder();
    stripe.checkout.sessions.listLineItems.mockResolvedValue({
      data: [
        {
          description: "Bonnet Mérinos",
          amount_total: 4000,
          quantity: 1,
          price: { product: { images: ["https://img.example.com/bonnet.jpg"] } },
        },
        { description: "Frais de livraison", amount_total: 500, quantity: 1, price: { product: {} } },
        { description: "Sans prix", amount_total: 0, quantity: 1, price: null },
      ],
    });

    const { status, body } = await readJson(await verify());

    expect(status).toBe(200);
    expect(body).toEqual({
      valid: true,
      session: {
        id: "cs_test_1",
        amountTotal: 4500,
        currency: "eur",
        paymentStatus: "paid",
        customerEmail: "client@example.com",
        lineItems: [
          { description: "Bonnet Mérinos", amount: 4000, quantity: 1, image: "https://img.example.com/bonnet.jpg" },
          { description: "Frais de livraison", amount: 500, quantity: 1, image: null },
          { description: "Sans prix", amount: 0, quantity: 1, image: null },
        ],
      },
    });
    expect(stripe.checkout.sessions.listLineItems).toHaveBeenCalledWith("cs_test_1", {
      expand: ["data.price.product"],
    });
    expect((await Reservation.findOne())!.paymentStatus).toBe("paid");
    expect((await Creation.findById(creation._id))!.sold).toBe(true);
    // Les liens des emails pointent vers le site visité
    const buyer = vi.mocked(sendEmail).mock.calls.find(([a]) => a.to === "client@example.com")!;
    expect(buyer[0].html).toContain("http://localhost:3000/account/orders");
  });

  it("reste valide au rechargement de la page sans renvoyer d'email (idempotence)", async () => {
    await seedPendingOrder();
    await verify();
    const emailsAfterFirst = vi.mocked(sendEmail).mock.calls.length;

    const { body } = await readJson(await verify());

    expect(body.valid).toBe(true);
    expect(vi.mocked(sendEmail).mock.calls.length).toBe(emailsAfterFirst);
  });

  it("conclut à un échec définitif sans réessayer pour une session expirée", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ payment_status: "unpaid", status: "expired" }));
    const { status, body } = await readJson(await verify());
    expect(status).toBe(200);
    expect(body).toEqual({ valid: false, pending: false });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledTimes(1);
  });

  it("réessaie trois fois puis demande au client de repoller", async () => {
    const timer = skipRetryDelay();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ payment_status: "unpaid", status: "open" }));

    const { body } = await readJson(await verify());

    expect(body).toEqual({ valid: false, pending: true });
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledTimes(3);
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 1200);
  });

  it("aboutit quand Stripe finalise la session entre deux tentatives", async () => {
    skipRetryDelay();
    await seedPendingOrder();
    stripe.checkout.sessions.retrieve
      .mockResolvedValueOnce(paidSession({ payment_status: "unpaid", status: "open" }))
      .mockResolvedValueOnce(paidSession());

    const { body } = await readJson(await verify());

    expect(body.valid).toBe(true);
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledTimes(2);
    expect((await Reservation.findOne())!.paymentStatus).toBe("paid");
  });

  it("répond 500 quand Stripe ne trouve pas la session", async () => {
    stripe.checkout.sessions.retrieve.mockRejectedValue(new Error("No such checkout.session"));
    const { status, body } = await readJson(await verify("?session_id=cs_inconnu"));
    expect(status).toBe(500);
    expect(body).toEqual({ valid: false });
  });
});
