import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { releaseStaleLocks } from "@/lib/stale-locks";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { createCreation, installFakeStripe, paidSession, type FakeStripe } from "../../helpers/stripe-fake";

vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }));

let stripe: FakeStripe;
const OLD = new Date(Date.now() - 60 * 60 * 1000);

/** Pièce verrouillée depuis une heure par une réservation (créée avec `reservation`). */
async function staleLock(reservation: Record<string, unknown> = {}, creation: Record<string, unknown> = {}) {
  const reservationId = new mongoose.Types.ObjectId();
  const c = await createCreation({
    reserved: true,
    reservedContact: "client@example.com",
    reservedAt: OLD,
    reservedByReservationId: reservationId,
    ...creation,
  });
  const r = await Reservation.create({
    _id: reservationId,
    creationId: c._id,
    name: "Alice",
    contact: "client@example.com",
    status: "preparing",
    paymentStatus: "pending",
    stripeCheckoutSessionId: "cs_test_1",
    ...reservation,
  });
  return { creation: c, reservation: r };
}

const fresh = async (id: unknown) => (await Creation.findById(id))!;

describe("releaseStaleLocks", () => {
  beforeEach(async () => {
    await connectToDatabase();
    stripe = installFakeStripe();
    vi.mocked(sendEmail).mockResolvedValue({ data: { id: "email" }, error: null } as any);
    vi.mocked(after).mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("ne touche pas à un verrou récent", async () => {
    const { creation } = await staleLock({}, { reservedAt: new Date() });
    const report = await releaseStaleLocks();
    expect(report.checked).toBe(0);
    expect((await fresh(creation._id)).reserved).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("libère la pièce d'une session expirée dont le webhook n'est pas passé", async () => {
    const { creation, reservation } = await staleLock();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ status: "expired", payment_status: "unpaid" }));

    const report = await releaseStaleLocks();

    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith("cs_test_1");
    expect(report).toMatchObject({ checked: 1, expired: 1 });
    expect((await fresh(creation._id)).reserved).toBe(false);
    expect((await Reservation.findById(reservation._id))!.paymentStatus).toBe("failed");
  });

  it("enregistre la commande d'une session payée dont le webhook a été manqué", async () => {
    const { creation, reservation } = await staleLock();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession());

    const report = await releaseStaleLocks();

    expect(report.fulfilled).toBe(1);
    expect((await fresh(creation._id)).sold).toBe(true);
    expect((await Reservation.findById(reservation._id))!.paymentStatus).toBe("paid");
  });

  it("ne compte pas une session « complete » au paiement non abouti", async () => {
    await staleLock();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ payment_status: "unpaid" }));
    expect((await releaseStaleLocks()).fulfilled).toBe(0);
  });

  it("laisse une session encore ouverte", async () => {
    const { creation } = await staleLock();
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ status: "open", payment_status: "unpaid" }));
    const report = await releaseStaleLocks();
    expect(report).toEqual({ checked: 1, expired: 0, fulfilled: 0, sold: 0, released: 0 });
    expect((await fresh(creation._id)).reserved).toBe(true);
  });

  it("marque vendue une pièce dont la réservation est payée mais la vente non enregistrée", async () => {
    const { creation } = await staleLock({ paymentStatus: "paid", status: "validated" }, { salesCount: 2 });

    const report = await releaseStaleLocks();

    expect(report.sold).toBe(1);
    const doc = await fresh(creation._id);
    expect(doc).toMatchObject({ sold: true, reserved: false, salesCount: 3 });
    expect(doc.reservedByReservationId).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("ne compte pas une vente marquée entre-temps", async () => {
    await staleLock({ paymentStatus: "paid", status: "validated" });
    vi.spyOn(Creation, "updateOne").mockResolvedValueOnce({ modifiedCount: 0 } as any);
    expect((await releaseStaleLocks()).sold).toBe(0);
  });

  it.each([
    ["failed", "cancelled"],
    ["paid", "cancelled"],
  ])("lève le verrou d'une réservation %s/%s", async (paymentStatus, status) => {
    const { creation } = await staleLock({ paymentStatus, status });
    const report = await releaseStaleLocks();
    expect(report.released).toBe(1);
    expect((await fresh(creation._id)).reserved).toBe(false);
  });

  it("ne compte pas un verrou levé entre-temps", async () => {
    await staleLock({ paymentStatus: "failed", status: "cancelled" });
    vi.spyOn(Creation, "updateOne").mockResolvedValueOnce({ modifiedCount: 0 } as any);
    expect((await releaseStaleLocks()).released).toBe(0);
  });

  it("ignore une réservation en attente sans session Stripe", async () => {
    await staleLock({ stripeCheckoutSessionId: "" });
    await releaseStaleLocks();
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled();
  });

  it("verrou sans détenteur : se fie aux checkouts en attente sur la pièce", async () => {
    const { creation } = await staleLock();
    await Creation.updateOne({ _id: creation._id }, { $unset: { reservedByReservationId: "" } });
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ status: "expired", payment_status: "unpaid" }));

    const report = await releaseStaleLocks();

    expect(report).toMatchObject({ expired: 1, released: 1 });
    expect((await fresh(creation._id)).reserved).toBe(false);
  });

  it("verrou sans détenteur : attend que tous ses checkouts soient clos", async () => {
    const { creation } = await staleLock();
    await Creation.updateOne({ _id: creation._id }, { $unset: { reservedByReservationId: "" } });
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ status: "open", payment_status: "unpaid" }));

    expect((await releaseStaleLocks()).released).toBe(0);
    expect((await fresh(creation._id)).reserved).toBe(true);
  });

  it("verrou sans détenteur : ne compte pas une pièce libérée entre-temps", async () => {
    const { creation } = await staleLock();
    await Creation.updateOne({ _id: creation._id }, { $unset: { reservedByReservationId: "" } });
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession({ status: "expired", payment_status: "unpaid" }));
    vi.spyOn(Creation, "updateOne").mockResolvedValue({ modifiedCount: 0 } as any);
    expect((await releaseStaleLocks()).released).toBe(0);
  });

  it("ne touche jamais à une réservation posée à la main (sans détenteur ni checkout)", async () => {
    const manual = await createCreation({ reserved: true, reservedAt: OLD, reservedName: "Cliente fidèle" });
    const report = await releaseStaleLocks();
    expect(report).toMatchObject({ checked: 1, expired: 0, released: 0, sold: 0 });
    expect((await fresh(manual._id)).reserved).toBe(true);
  });

  it("continue avec les autres pièces quand Stripe échoue sur l'une", async () => {
    await staleLock({ stripeCheckoutSessionId: "cs_ko" });
    const { creation } = await staleLock({ stripeCheckoutSessionId: "cs_test_1" });
    stripe.checkout.sessions.retrieve.mockImplementation(async (id: string) => {
      if (id === "cs_ko") throw new Error("Stripe indisponible");
      return paidSession({ status: "expired", payment_status: "unpaid" });
    });

    const report = await releaseStaleLocks();

    expect(report).toMatchObject({ checked: 2, expired: 1 });
    expect((await fresh(creation._id)).reserved).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[STALE-LOCKS] Pièce"), expect.any(Error));
  });
});
