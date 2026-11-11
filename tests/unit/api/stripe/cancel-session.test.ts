import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/stripe/cancel-session/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { readJson } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";
import { createCreation, installFakeStripe, type FakeStripe } from "../../../helpers/stripe-fake";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));

let stripe: FakeStripe;

/** Pièce verrouillée par une réservation en attente de paiement. */
async function pendingOrder(sessionId: string, contact = "client@example.com") {
  const creation = await createCreation({ reserved: true });
  const reservation = await Reservation.create({
    creationId: creation._id,
    contact,
    paymentStatus: "pending",
    status: "preparing",
    stripeCheckoutSessionId: sessionId,
  });
  await Creation.updateOne({ _id: creation._id }, { reservedByReservationId: reservation._id });
  return { creation, reservation };
}

describe("POST /api/stripe/cancel-session", () => {
  beforeEach(async () => {
    await connectToDatabase();
    stripe = installFakeStripe();
    stripe.checkout.sessions.expire.mockImplementation(async (id: string) => ({ id, metadata: {} }));
  });

  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    expect((await POST()).status).toBe(401);
  });

  it("expire les sessions ouvertes du client et libère ses pièces tout de suite", async () => {
    const mine = await pendingOrder("cs_mine");
    const other = await pendingOrder("cs_other", "autre@example.com");
    asUser();

    const { status, body } = await readJson(await POST());
    expect(status).toBe(200);
    expect(body).toEqual({ released: 1 });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_mine");
    expect((await Creation.findById(mine.creation._id))!.reserved).toBe(false);
    expect((await Reservation.findById(mine.reservation._id))!.paymentStatus).toBe("failed");
    expect((await Creation.findById(other.creation._id))!.reserved).toBe(true);
  });

  it("laisse suivre son cours une session que Stripe refuse d'expirer (déjà payée)", async () => {
    const { creation } = await pendingOrder("cs_paid");
    stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error("Only open sessions can be expired"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    asUser();

    const { body } = await readJson(await POST());
    expect(body).toEqual({ released: 0 });
    expect((await Creation.findById(creation._id))!.reserved).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it("journalise une erreur Stripe sans message", async () => {
    await pendingOrder("cs_x");
    stripe.checkout.sessions.expire.mockRejectedValueOnce("refus");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    asUser();
    await POST();
    expect(warn).toHaveBeenCalledWith("[CANCEL-SESSION] Session cs_x non expirée :", "refus");
  });

  it("répond 500 si la base échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Reservation, "distinct").mockRejectedValueOnce(new Error("db down"));
    asUser();
    expect((await POST()).status).toBe(500);
  });
});
