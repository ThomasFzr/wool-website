import mongoose from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { headers } from "next/headers";
import { POST } from "@/app/api/stripe/webhook/route";
import { GET as verifySession } from "@/app/api/stripe/verify-session/route";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { makeRequest, readJson } from "../../../helpers/http";
import { asUser } from "../../../helpers/session";
import { createCreation, installFakeStripe, paidSession, type FakeStripe } from "../../../helpers/stripe-fake";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

const RAW_BODY = '{"id":"evt_1"}';
let stripe: FakeStripe;

function setIncomingHeaders(values: Record<string, string>) {
  vi.mocked(headers).mockResolvedValue(new Headers({ host: "localhost:3000", ...values }) as any);
}

const sendWebhook = () =>
  POST(makeRequest("/api/stripe/webhook", { method: "POST", body: RAW_BODY }));

function nextEvent(type: string, object: Record<string, unknown> = paidSession()) {
  stripe.webhooks.constructEvent.mockReturnValue({ id: "evt_1", type, data: { object } });
}

async function seedPendingOrder(creationOverrides: Record<string, unknown> = {}) {
  // Pièce verrouillée au nom de la réservation pending, comme le fait le checkout
  const reservationId = new mongoose.Types.ObjectId();
  const creation = await createCreation({
    reserved: true,
    reservedContact: "client@example.com",
    reservedByReservationId: reservationId,
    ...creationOverrides,
  });
  await Reservation.create({
    _id: reservationId,
    creationId: creation._id,
    name: "Alice",
    contact: "client@example.com",
    paymentStatus: "pending",
    status: "preparing",
    stripeCheckoutSessionId: "cs_test_1",
  });
  return creation;
}

describe("POST /api/stripe/webhook", () => {
  beforeEach(async () => {
    await connectToDatabase();
    stripe = installFakeStripe();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession());
    vi.mocked(sendEmail).mockResolvedValue({ data: { id: "email" }, error: null } as any);
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
    vi.stubEnv("SELLER_EMAIL", "vendeuse@example.com");
    setIncomingHeaders({ "stripe-signature": "t=1,v1=abc" });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("sécurité", () => {
    it("répond 500 quand Stripe n'est pas configuré", async () => {
      vi.mocked(getStripeInstance).mockImplementation(() => {
        throw new Error("STRIPE_SECRET_KEY n'est pas définie");
      });
      const res = await sendWebhook();
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Webhook Error: STRIPE_SECRET_KEY n'est pas définie");
    });

    it("répond 500 quand le secret du webhook manque", async () => {
      vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
      const res = await sendWebhook();
      expect(res.status).toBe(500);
      expect(await res.text()).toMatch(/STRIPE_WEBHOOK_SECRET n'est pas configurée/);
    });

    it("refuse une requête sans signature Stripe", async () => {
      setIncomingHeaders({});
      const res = await sendWebhook();
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Missing stripe-signature header");
      expect(stripe.webhooks.constructEvent).not.toHaveBeenCalled();
    });

    it("refuse une signature invalide sans rien traiter", async () => {
      await seedPendingOrder();
      stripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error("No signatures found matching the expected signature");
      });
      const res = await sendWebhook();
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Webhook Error: No signatures found matching the expected signature");
      expect((await Reservation.findOne())!.paymentStatus).toBe("pending");
    });

    it("vérifie la signature sur le corps brut avec le secret configuré", async () => {
      nextEvent("customer.created", {});
      await sendWebhook();
      expect(stripe.webhooks.constructEvent).toHaveBeenCalledWith(RAW_BODY, "t=1,v1=abc", "whsec_test");
    });
  });

  describe("checkout.session.completed", () => {
    it("finalise la commande à partir de la session complète récupérée chez Stripe", async () => {
      const creation = await seedPendingOrder();
      // L'événement ne porte que l'id : l'adresse vient de la session récupérée
      nextEvent("checkout.session.completed", { id: "cs_test_1" });
      stripe.checkout.sessions.retrieve.mockResolvedValue(
        paidSession({
          metadata: { deliveryMode: "shipping", shippingCost: "5" },
          shipping_details: { name: "Alice", address: { line1: "1 rue", city: "Lyon", postal_code: "69001", country: "FR" } },
        })
      );

      const { status, body } = await readJson(await sendWebhook());

      expect(status).toBe(200);
      expect(body).toEqual({ received: true });
      expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_1");
      const reservation = (await Reservation.findOne())!;
      expect(reservation.paymentStatus).toBe("paid");
      expect(reservation.shippingCost).toBe(5);
      expect(reservation.shippingAddress!.city).toBe("Lyon");
      expect((await Creation.findById(creation._id))!.sold).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("accuse réception sans rien valider quand le paiement n'est pas abouti", async () => {
      await seedPendingOrder();
      nextEvent("checkout.session.completed");
      stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ payment_status: "unpaid" }));
      expect((await sendWebhook()).status).toBe(200);
      expect((await Reservation.findOne())!.paymentStatus).toBe("pending");
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("répond 500 pour que Stripe réessaie quand le PaymentIntent n'a pas pu être vérifié", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      await seedPendingOrder();
      nextEvent("checkout.session.completed");
      stripe.paymentIntents.retrieve.mockRejectedValue(new Error("Stripe injoignable"));

      const res = await sendWebhook();

      expect(res.status).toBe(500);
      expect((await Reservation.findOne())!.paymentStatus).toBe("pending");
    });

    it("répond 500 tant que le PaymentIntent est en cours de traitement", async () => {
      await seedPendingOrder();
      nextEvent("checkout.session.completed");
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_test", status: "processing" });
      expect((await sendWebhook()).status).toBe(500);
    });

    it("ne traite qu'une fois un événement rejoué par Stripe", async () => {
      const creation = await seedPendingOrder();
      nextEvent("checkout.session.completed");

      await sendWebhook();
      const res = await sendWebhook();

      expect(res.status).toBe(200);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect((await Creation.findById(creation._id))!.salesCount).toBe(1);
    });

    it("ne renvoie pas les emails quand verify-session passe après le webhook", async () => {
      const creation = await seedPendingOrder();
      nextEvent("checkout.session.completed");
      asUser();

      await sendWebhook();
      const { body } = await readJson(await verifySession(makeRequest("/api/stripe/verify-session?session_id=cs_test_1")));

      expect(body.valid).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect((await Creation.findById(creation._id))!.salesCount).toBe(1);
    });

    it("ne renvoie pas les emails quand le webhook arrive après verify-session", async () => {
      const creation = await seedPendingOrder();
      nextEvent("checkout.session.completed");
      asUser();

      await verifySession(makeRequest("/api/stripe/verify-session?session_id=cs_test_1"));
      const res = await sendWebhook();

      expect(res.status).toBe(200);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect((await Creation.findById(creation._id))!.salesCount).toBe(1);
    });

    it("répond 500 pour que Stripe réessaie quand la session est introuvable", async () => {
      nextEvent("checkout.session.completed");
      stripe.checkout.sessions.retrieve.mockRejectedValue(new Error("Stripe indisponible"));
      const res = await sendWebhook();
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Webhook Error: Stripe indisponible");
    });
  });

  describe("checkout.session.expired", () => {
    it("annule les réservations pending et remet la pièce en vente", async () => {
      const creation = await seedPendingOrder();
      nextEvent("checkout.session.expired", paidSession({ status: "expired", payment_status: "unpaid" }));

      const { status, body } = await readJson(await sendWebhook());

      expect(status).toBe(200);
      expect(body).toEqual({ received: true });
      expect((await Reservation.findOne())!).toMatchObject({ status: "cancelled", paymentStatus: "failed" });
      expect((await Creation.findById(creation._id))!.reserved).toBe(false);
      expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
    });

    it("ne libère pas une pièce payée entre-temps", async () => {
      const creation = await seedPendingOrder();
      nextEvent("checkout.session.completed");
      await sendWebhook();

      nextEvent("checkout.session.expired");
      await sendWebhook();

      expect((await Reservation.findOne())!.paymentStatus).toBe("paid");
      expect((await Creation.findById(creation._id))!.sold).toBe(true);
    });
  });

  describe("charge.refunded", () => {
    /** Commande payée (deux pièces vendues) par le PaymentIntent pi_test. */
    async function seedPaidOrder() {
      const creations = [];
      for (const title of ["A", "B"]) {
        const creation = await createCreation({ title, sold: true, reserved: false });
        await Reservation.create({
          creationId: creation._id,
          contact: "client@example.com",
          paymentStatus: "paid",
          status: "validated",
          stripeCheckoutSessionId: "cs_test_1",
          stripePaymentIntentId: "pi_test",
        });
        creations.push(creation);
      }
      return creations;
    }
    const charge = (overrides: Record<string, unknown> = {}) => ({
      id: "ch_1",
      payment_intent: "pi_test",
      refunded: true,
      amount_refunded: 9000,
      ...overrides,
    });

    it("passe la commande remboursée et annulée, et remet les pièces en vente", async () => {
      const creations = await seedPaidOrder();
      nextEvent("charge.refunded", charge());

      expect((await sendWebhook()).status).toBe(200);
      for (const r of await Reservation.find()) {
        expect(r).toMatchObject({ paymentStatus: "refunded", status: "cancelled", cancelReason: "Commande remboursée" });
      }
      for (const c of creations) expect((await Creation.findById(c._id))!.sold).toBe(false);

      // Événement rejoué : rien de plus
      await sendWebhook();
      expect(await Reservation.countDocuments({ paymentStatus: "refunded" })).toBe(2);
    });

    it("accepte un PaymentIntent développé en objet", async () => {
      await seedPaidOrder();
      nextEvent("charge.refunded", charge({ payment_intent: { id: "pi_test" } }));
      await sendWebhook();
      expect(await Reservation.countDocuments({ paymentStatus: "refunded" })).toBe(2);
    });

    it("ne remet pas en vente une pièce revendue depuis", async () => {
      const [a] = await seedPaidOrder();
      await Reservation.create({ creationId: a._id, contact: "autre@example.com", paymentStatus: "paid", status: "preparing" });
      nextEvent("charge.refunded", charge());
      await sendWebhook();
      expect((await Creation.findById(a._id))!.sold).toBe(true);
    });

    it("ne touche à rien sur un remboursement partiel ou sans paiement lié", async () => {
      await seedPaidOrder();
      nextEvent("charge.refunded", charge({ refunded: false, amount_refunded: 500 }));
      await sendWebhook();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Remboursement partiel du paiement pi_test (5 €)"));
      nextEvent("charge.refunded", charge({ payment_intent: null }));
      await sendWebhook();
      expect(await Reservation.countDocuments({ paymentStatus: "paid" })).toBe(2);
    });

    it("ignore une réservation sans création liée", async () => {
      await Reservation.create({ contact: "client@example.com", paymentStatus: "paid", stripePaymentIntentId: "pi_test" });
      nextEvent("charge.refunded", charge());
      await sendWebhook();
      expect((await Reservation.findOne())!.paymentStatus).toBe("refunded");
    });

    it("ne compte pas une réservation remboursée entre-temps par un autre traitement", async () => {
      await seedPaidOrder();
      vi.spyOn(Reservation, "findOneAndUpdate").mockResolvedValue(null as any);
      nextEvent("charge.refunded", charge());
      await sendWebhook();
      expect(console.log).toHaveBeenCalledWith("[WEBHOOK] Remboursement ch_1: 0 réservation(s) remboursée(s)");
    });
  });

  it("ignore les autres événements", async () => {
    await seedPendingOrder();
    nextEvent("payment_intent.created", {});
    const { status, body } = await readJson(await sendWebhook());
    expect(status).toBe(200);
    expect(body).toEqual({ received: true });
    expect((await Reservation.findOne())!.paymentStatus).toBe("pending");
  });
});
