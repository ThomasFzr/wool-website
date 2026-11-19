import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { DELETE, PATCH } from "@/app/api/admin/reservations/[id]/route";
import { connectToDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { makeRequest, readJson, routeParams } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import {
  createCreation,
  createReservation,
  createUser,
  expectAdminOnly,
  failSession,
} from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

const patch = (id: string, body: unknown) =>
  PATCH(makeRequest(`/api/admin/reservations/${id}`, { method: "PATCH", body }), routeParams({ id }));
const del = (id: string, query = "") =>
  DELETE(makeRequest(`/api/admin/reservations/${id}${query}`, { method: "DELETE" }), routeParams({ id }));
const unknownId = () => new mongoose.Types.ObjectId().toString();
const emailsTo = (to: string) => vi.mocked(sendEmail).mock.calls.filter(([e]) => e.to === to).map(([e]) => e);

/** Réservation liée à une création, avec acheteur enregistré. */
async function orderFixture(reservation: Record<string, unknown> = {}, creation: Record<string, unknown> = {}) {
  const c = await createCreation({ title: "Pull <b>", color: "Rouge", images: ["https://img/1.jpg"], ...creation });
  const r = await createReservation({
    name: "Alice <script>",
    contact: "client@example.com",
    creationId: c._id,
    paymentStatus: "paid",
    ...reservation,
  });
  return { creation: c, reservation: r };
}

beforeEach(async () => {
  await connectToDatabase();
  vi.mocked(sendEmail).mockResolvedValue({ data: { id: "ok" }, error: null } as any);
  vi.stubEnv("SELLER_EMAIL", "vendeuse@example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://boutique.test");
});

describe("PATCH /api/admin/reservations/[id]", () => {
  it("est réservé aux admins", async () => {
    const { reservation } = await orderFixture();
    await expectAdminOnly(() => patch(reservation.id, { seenByAdmin: true }));
  });

  it("répond 404 pour une réservation inexistante", async () => {
    asAdmin();
    const { status, body } = await readJson(await patch(unknownId(), { status: "validated" }));
    expect(status).toBe(404);
    expect(body.error).toBe("Not found");
  });

  it("répond 404 si la réservation disparaît pendant la mise à jour", async () => {
    const { reservation } = await orderFixture();
    asAdmin();
    vi.spyOn(Reservation, "findByIdAndUpdate").mockReturnValueOnce({ populate: async () => null } as any);
    expect((await patch(reservation.id, { seenByAdmin: true })).status).toBe(404);
  });

  it("ne met à jour que les champs autorisés", async () => {
    const { reservation } = await orderFixture({ paymentStatus: "pending" });
    asAdmin();
    const { status, body } = await readJson(
      await patch(reservation.id, {
        trackingNumber: "6A123",
        deliveryMode: "shipping",
        shippingCost: 5,
        seenByAdmin: true,
        name: "Bob",
        contact: "bob@example.com",
        message: "merci",
        paymentStatus: "paid",
        userEmail: "pirate@example.com",
      })
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ trackingNumber: "6A123", deliveryMode: "shipping", shippingCost: 5, seenByAdmin: true, name: "Bob" });
    const stored = await Reservation.findById(reservation.id).lean<any>();
    expect(stored.paymentStatus).toBe("pending");
    expect(stored.userEmail).toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("date l'expédition au passage en « shipped »", async () => {
    const { reservation } = await orderFixture();
    asAdmin();
    const before = Date.now();
    const { body } = await readJson(await patch(reservation.id, { status: "shipped" }));
    expect(body.status).toBe("shipped");
    expect(new Date(body.shippedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  describe("expédition", () => {
    it("prévient l'acheteur (et pas la vendeuse) avec le numéro de suivi échappé", async () => {
      const { reservation } = await orderFixture({ status: "validated" });
      asAdmin();
      await patch(reservation.id, { status: "shipped", trackingNumber: "6A<b>12" });
      const [email] = emailsTo("client@example.com");
      expect(email.subject).toBe("📦 Votre commande a été expédiée");
      expect(email.html).toContain("Numéro de suivi");
      expect(email.html).toContain("6A&lt;b&gt;12");
      expect(email.html).toContain("Alice &lt;script&gt;");
      expect(email.html).toContain("Pull &lt;b&gt;");
      expect(email.html).toContain("https://boutique.test/account/orders");
      expect(emailsTo("vendeuse@example.com")).toHaveLength(0);
    });

    it("omet le bloc de suivi sans numéro", async () => {
      const { reservation } = await orderFixture({ status: "validated" });
      asAdmin();
      await patch(reservation.id, { status: "shipped" });
      const [email] = emailsTo("client@example.com");
      expect(email.html).not.toContain("Numéro de suivi");
    });

    it("ne renvoie pas l'email au retour « en cours de livraison » → « expédiée » ni sans changement", async () => {
      const back = await orderFixture({ status: "in_transit", shippedAt: new Date("2026-11-01") });
      const same = await orderFixture({ status: "shipped" });
      asAdmin();
      await patch(back.reservation.id, { status: "shipped" });
      await patch(same.reservation.id, { status: "shipped" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("respecte la préférence de l'acheteur", async () => {
      await createUser({ email: "client@example.com", emailNotifications: false });
      const { reservation } = await orderFixture({ status: "validated" });
      asAdmin();
      await patch(reservation.id, { status: "shipped", trackingNumber: "6A1" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("réussit même si l'envoi échoue", async () => {
      const { reservation } = await orderFixture({ status: "validated" });
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      asAdmin();
      expect((await patch(reservation.id, { status: "shipped" })).status).toBe(200);
    });
  });

  it("conserve la date d'expédition fournie", async () => {
    const { reservation } = await orderFixture();
    asAdmin();
    const { body } = await readJson(
      await patch(reservation.id, { status: "shipped", shippedAt: "2024-05-01T00:00:00.000Z" })
    );
    expect(body.shippedAt).toBe("2024-05-01T00:00:00.000Z");
  });

  describe("validation de la commande", () => {
    it("marque la création vendue, invalide le cache et prévient acheteur et vendeuse", async () => {
      const { reservation, creation } = await orderFixture();
      await createUser();
      asAdmin();

      const { status, body } = await readJson(await patch(reservation.id, { status: "validated" }));
      expect(status).toBe(200);
      expect(body.status).toBe("validated");
      expect(await Creation.findById(creation._id).lean<any>()).toMatchObject({ sold: true, salesCount: 1 });
      expect(revalidatePath).toHaveBeenCalledWith("/");

      const [buyer] = emailsTo("client@example.com");
      expect(buyer.subject).toBe("🎉 Votre commande a été validée");
      expect(buyer.html).toContain("Alice &lt;script&gt;");
      expect(buyer.html).not.toContain("<script>");
      expect(buyer.html).toContain('src="https://img/1.jpg"');
      expect(buyer.html).toContain("Couleur : <strong>Rouge</strong>");
      expect(buyer.html).toContain("50 €");
      expect(buyer.html).toContain("https://boutique.test/account/orders");

      const [seller] = emailsTo("vendeuse@example.com");
      expect(seller.subject).toBe("✅ Commande validée : Pull <b>");
      expect(seller.html).toContain("(client@example.com)");
      expect(seller.html).toContain("Pull &lt;b&gt;");
    });

    it("passe aussi en vente au statut « preparing »", async () => {
      const { reservation, creation } = await orderFixture();
      asAdmin();
      await patch(reservation.id, { status: "preparing" });
      expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(true);
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("n'a aucun effet de bord si le statut ne change pas", async () => {
      const { reservation, creation } = await orderFixture({ status: "validated" });
      asAdmin();
      await patch(reservation.id, { status: "validated" });
      expect((await Creation.findById(creation._id).lean<any>()).salesCount).toBe(0);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("n'incrémente pas les ventes d'une création déjà vendue", async () => {
      const { reservation, creation } = await orderFixture({}, { sold: true, salesCount: 4 });
      asAdmin();
      await patch(reservation.id, { status: "validated" });
      expect((await Creation.findById(creation._id).lean<any>()).salesCount).toBe(4);
    });

    it("respecte la préférence de l'acheteur et l'absence d'email vendeuse", async () => {
      const { reservation } = await orderFixture();
      await createUser({ emailNotifications: false });
      vi.stubEnv("SELLER_EMAIL", "");
      asAdmin();
      await patch(reservation.id, { status: "validated" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("utilise imageUrl et omet couleur et prix absents", async () => {
      const { reservation, creation } = await orderFixture({}, { images: [], imageUrl: "https://img/legacy.jpg" });
      await Creation.collection.updateOne({ _id: creation._id }, { $unset: { color: "", price: "" } });
      asAdmin();
      await patch(reservation.id, { status: "validated" });
      const [buyer] = emailsTo("client@example.com");
      expect(buyer.html).toContain('src="https://img/legacy.jpg"');
      expect(buyer.html).not.toContain("Couleur");
      expect(buyer.html).toContain("Prix sur demande");
      expect(emailsTo("vendeuse@example.com")[0].html).not.toContain("Couleur");
    });

    it("omet l'image quand la création n'en a aucune", async () => {
      const { reservation } = await orderFixture({}, { images: [] });
      asAdmin();
      await patch(reservation.id, { status: "validated" });
      for (const email of vi.mocked(sendEmail).mock.calls.map(([e]) => e)) {
        expect(email.html).not.toContain(`alt="Pull &lt;b&gt;"`);
      }
    });

    it("réussit même si l'envoi d'un email échoue", async () => {
      const { reservation } = await orderFixture();
      vi.mocked(sendEmail).mockRejectedValueOnce(new Error("Resend en panne"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      asAdmin();
      expect((await patch(reservation.id, { status: "validated" })).status).toBe(200);
      expect(errors).toHaveBeenCalledWith("[admin/reservations] Email non envoyé:", expect.any(Error));
    });

    it("ignore les effets de bord si la création a été supprimée", async () => {
      const { reservation, creation } = await orderFixture();
      await Creation.deleteOne({ _id: creation._id });
      asAdmin();
      const { status, body } = await readJson(await patch(reservation.id, { status: "validated" }));
      expect(status).toBe(200);
      expect(body.creationId).toBeNull();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("annulation de la commande", () => {
    it("remet la création en vente, note l'annulation admin et prévient les deux parties", async () => {
      const { reservation, creation } = await orderFixture({ status: "validated" }, { sold: true });
      asAdmin();

      const { status, body } = await readJson(
        await patch(reservation.id, { status: "cancelled", cancelReason: "Rupture <de laine>" })
      );
      expect(status).toBe(200);
      expect(body).toMatchObject({ status: "cancelled", cancelledBy: "admin", cancelReason: "Rupture <de laine>" });
      expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(false);
      expect((await Reservation.findById(reservation.id).lean<any>()).cancelledBy).toBe("admin");
      expect(revalidatePath).toHaveBeenCalledWith("/");

      const [buyer] = emailsTo("client@example.com");
      expect(buyer.subject).toBe("❌ Votre commande a été annulée");
      expect(buyer.html).toContain("Rupture &lt;de laine&gt;");
      expect(buyer.html).toContain("Couleur : <strong>Rouge</strong>");
      const [seller] = emailsTo("vendeuse@example.com");
      expect(seller.subject).toBe("❌ Commande annulée : Pull <b>");
      expect(seller.html).toContain("Rupture &lt;de laine&gt;");
    });

    it("libère aussi le verrou d'une commande saisie par l'admin", async () => {
      const { reservation, creation } = await orderFixture({ status: "preparing" }, { sold: true });
      await Creation.updateOne(
        { _id: creation._id },
        { $set: { reserved: true, reservedName: "Claire", reservedContact: "c@example.com", reservedByReservationId: reservation._id } }
      );
      asAdmin();
      await patch(reservation.id, { status: "cancelled" });
      const freed = await Creation.findById(creation._id).lean<any>();
      expect(freed).toMatchObject({ sold: false, reserved: false });
      for (const key of ["reservedName", "reservedContact", "reservedAt", "reservedByReservationId"]) {
        expect(freed).not.toHaveProperty(key);
      }
    });

    it("ne remet pas en vente une pièce revendue depuis à un autre acheteur", async () => {
      const { reservation, creation } = await orderFixture({ status: "validated" }, { sold: true });
      await createReservation({ creationId: creation._id, contact: "autre@example.com", paymentStatus: "paid", status: "preparing" });
      asAdmin();
      await patch(reservation.id, { status: "cancelled" });
      expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(true);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("une ancienne commande payée puis annulée ne bloque pas la remise en vente", async () => {
      const { reservation, creation } = await orderFixture({ status: "validated" }, { sold: true });
      await createReservation({ creationId: creation._id, paymentStatus: "paid", status: "cancelled" });
      asAdmin();
      await patch(reservation.id, { status: "cancelled" });
      expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(false);
    });

    it("pour une réservation non payée, ne lève que son propre verrou", async () => {
      const mine = await orderFixture({ paymentStatus: "pending", status: "preparing" });
      await Creation.updateOne({ _id: mine.creation._id }, { $set: { reserved: true, reservedByReservationId: mine.reservation._id } });
      const other = await orderFixture({ paymentStatus: "pending", status: "preparing" });
      await Creation.updateOne({ _id: other.creation._id }, { $set: { reserved: true, reservedByReservationId: new mongoose.Types.ObjectId() } });
      asAdmin();

      await patch(mine.reservation.id, { status: "cancelled" });
      await patch(other.reservation.id, { status: "cancelled" });

      expect((await Creation.findById(mine.creation._id).lean<any>()).reserved).toBe(false);
      expect((await Creation.findById(other.creation._id).lean<any>()).reserved).toBe(true);
    });

    it("utilise la raison déjà enregistrée ou un texte par défaut", async () => {
      const { reservation } = await orderFixture();
      asAdmin();
      await patch(reservation.id, { status: "cancelled" });
      expect(emailsTo("client@example.com")[0].html).toContain("Aucune raison précisée.");

      vi.mocked(sendEmail).mockClear();
      const other = await orderFixture({ cancelReason: "Demande de la cliente" });
      await patch(other.reservation.id, { status: "cancelled", cancelReason: "" });
      // La raison vide envoyée écrase celle en base : le texte par défaut est utilisé
      expect(emailsTo("client@example.com")[0].html).toContain("Aucune raison précisée.");
    });

    it("omet image et couleur et respecte les préférences", async () => {
      const { reservation, creation } = await orderFixture({}, { images: [] });
      await Creation.collection.updateOne({ _id: creation._id }, { $unset: { color: "" } });
      asAdmin();
      await patch(reservation.id, { status: "cancelled" });
      for (const email of vi.mocked(sendEmail).mock.calls.map(([e]) => e)) {
        expect(email.html).not.toContain(`alt="Pull &lt;b&gt;"`);
        expect(email.html).not.toContain("Couleur");
      }

      vi.mocked(sendEmail).mockClear();
      const other = await orderFixture({ contact: "muet@example.com" });
      await createUser({ email: "muet@example.com", emailNotifications: false });
      vi.stubEnv("SELLER_EMAIL", "");
      await patch(other.reservation.id, { status: "cancelled" });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("affiche l'image dans les emails d'annulation", async () => {
      const { reservation } = await orderFixture();
      asAdmin();
      await patch(reservation.id, { status: "cancelled" });
      expect(emailsTo("vendeuse@example.com")[0].html).toContain('src="https://img/1.jpg"');
    });

    it("réussit même si l'envoi d'un email échoue", async () => {
      const { reservation } = await orderFixture();
      vi.mocked(sendEmail).mockRejectedValue(new Error("Resend en panne"));
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      asAdmin();
      expect((await patch(reservation.id, { status: "cancelled" })).status).toBe(200);
      expect(errors).toHaveBeenCalledTimes(2);
    });

    it("n'a aucun effet de bord sans création ou sans changement de statut", async () => {
      const orphan = await createReservation({ status: "pending" });
      const already = await orderFixture({ status: "cancelled" }, { sold: true });
      asAdmin();
      expect((await patch(orphan.id, { status: "cancelled" })).status).toBe(200);
      await patch(already.reservation.id, { status: "cancelled" });
      expect((await Creation.findById(already.creation._id).lean<any>()).sold).toBe(true);
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("action sur toute la commande (wholeOrder)", () => {
    /** Commande de trois articles : deux à traiter, un déjà annulé. */
    async function threeItemOrder() {
      const a = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "preparing" }, { title: "Bonnet" });
      const b = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "preparing" }, { title: "Snood", images: [] });
      const c = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "cancelled" }, { title: "Bandeau" });
      const other = await orderFixture({ stripeCheckoutSessionId: "cs_2", status: "preparing" });
      return { a, b, c, other };
    }
    const statusOf = async (id: unknown) => (await Reservation.findById(id).lean<any>()).status;

    it("met à jour tous les articles et n'envoie qu'un email par destinataire", async () => {
      const { a, b, c, other } = await threeItemOrder();
      asAdmin();
      const { status, body } = await readJson(
        await patch(a.reservation.id, { status: "shipped", trackingNumber: "6A1", wholeOrder: true })
      );
      expect(status).toBe(200);
      expect(body._id).toBe(a.reservation.id);
      for (const r of [a, b]) {
        expect(await Reservation.findById(r.reservation._id).lean<any>()).toMatchObject({ status: "shipped", trackingNumber: "6A1" });
      }
      // Un article déjà annulé n'est pas rouvert ; les autres commandes ne bougent pas
      expect(await statusOf(c.reservation._id)).toBe("cancelled");
      expect(await statusOf(other.reservation._id)).toBe("preparing");
      // Un seul email d'expédition listant les deux articles, avec le suivi
      const emails = emailsTo("client@example.com");
      expect(emails).toHaveLength(1);
      expect(emails[0].html).toContain("Bonnet");
      expect(emails[0].html).toContain("Snood");
      expect(emails[0].html).not.toContain("Bandeau");
      expect(emails[0].html).toContain("6A1");
    });

    it("valide la commande avec un seul email listant tous les articles", async () => {
      const { a, b } = await threeItemOrder();
      await Reservation.updateMany({ stripeCheckoutSessionId: "cs_1", status: "preparing" }, { status: "pending" });
      asAdmin();
      await patch(b.reservation.id, { status: "validated", wholeOrder: true });

      const buyer = emailsTo("client@example.com");
      expect(buyer).toHaveLength(1);
      expect(buyer[0].html).toContain("Bonnet");
      expect(buyer[0].html).toContain("Snood");
      expect(buyer[0].html).not.toContain("Bandeau");
      const seller = emailsTo("vendeuse@example.com");
      expect(seller).toHaveLength(1);
      expect(seller[0].subject).toBe("✅ Commande validée : Bonnet et 1 autre article");
      for (const r of [a, b]) {
        expect((await Creation.findById(r.creation._id).lean<any>()).sold).toBe(true);
      }
    });

    it("annule la commande avec un seul email et remet chaque pièce en vente", async () => {
      const a = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "validated" }, { title: "Bonnet", sold: true });
      const b = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "validated" }, { title: "Snood", sold: true });
      const d = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "validated" }, { title: "Mitaines", sold: true });
      asAdmin();
      await patch(a.reservation.id, { status: "cancelled", cancelReason: "Rupture", wholeOrder: true });

      for (const r of [a, b, d]) {
        expect(await Reservation.findById(r.reservation._id).lean<any>()).toMatchObject({ status: "cancelled", cancelledBy: "admin", cancelReason: "Rupture" });
        expect((await Creation.findById(r.creation._id).lean<any>()).sold).toBe(false);
      }
      const [buyer] = emailsTo("client@example.com");
      expect(buyer.html).toContain("les articles suivants");
      expect(buyer.html).toContain("Rupture");
      expect(emailsTo("vendeuse@example.com")[0].subject).toBe("❌ Commande annulée : Bonnet et 2 autres articles");
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("se limite à la réservation sans session de paiement", async () => {
      const solo = await orderFixture({ status: "preparing" });
      const other = await orderFixture({ status: "preparing" });
      asAdmin();
      await patch(solo.reservation.id, { status: "shipped", wholeOrder: true });
      expect(await statusOf(solo.reservation._id)).toBe("shipped");
      expect(await statusOf(other.reservation._id)).toBe("preparing");
    });
  });

  it("répond 400 pour un identifiant mal formé", async () => {
    asAdmin();
    const { status, body } = await readJson(await patch("pas-un-id", { status: "validated" }));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Identifiant invalide.", champ: "id" });
  });
});

describe("DELETE /api/admin/reservations/[id]", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => del(unknownId()));
  });

  it("répond 404 pour une réservation inexistante", async () => {
    asAdmin();
    expect((await del(unknownId())).status).toBe(404);
  });

  it("supprime la réservation et remet la création en vente", async () => {
    const { reservation, creation } = await orderFixture({}, { sold: true });
    asAdmin();
    expect((await del(reservation.id)).status).toBe(204);
    expect(await Reservation.countDocuments()).toBe(0);
    expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("ne touche pas à la pièce en supprimant une commande déjà annulée", async () => {
    // La pièce a été revendue après l'annulation : la supprimer ne doit rien rouvrir
    const { reservation, creation } = await orderFixture({ status: "cancelled" }, { sold: true });
    asAdmin();
    expect((await del(reservation.id)).status).toBe(204);
    expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ne remet pas en vente une pièce détenue par une autre commande payée", async () => {
    const { reservation, creation } = await orderFixture({}, { sold: true });
    await createReservation({ creationId: creation._id, paymentStatus: "paid", status: "delivered" });
    asAdmin();
    expect((await del(reservation.id)).status).toBe(204);
    expect((await Creation.findById(creation._id).lean<any>()).sold).toBe(true);
  });

  it("supprime toute la commande avec wholeOrder=1, en ne rouvrant que les articles non annulés", async () => {
    const a = await orderFixture({ stripeCheckoutSessionId: "cs_1" }, { sold: true });
    const b = await orderFixture({ stripeCheckoutSessionId: "cs_1", status: "cancelled" }, { sold: true });
    const other = await orderFixture({ stripeCheckoutSessionId: "cs_2" }, { sold: true });
    asAdmin();
    expect((await del(a.reservation.id, "?wholeOrder=1")).status).toBe(204);
    expect(await Reservation.find().distinct("stripeCheckoutSessionId")).toEqual(["cs_2"]);
    expect((await Creation.findById(a.creation._id).lean<any>()).sold).toBe(false);
    expect((await Creation.findById(b.creation._id).lean<any>()).sold).toBe(true);
    expect((await Creation.findById(other.creation._id).lean<any>()).sold).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("sans wholeOrder, ne supprime que l'article ; sans session, ignore wholeOrder", async () => {
    const a = await orderFixture({ stripeCheckoutSessionId: "cs_1" });
    await orderFixture({ stripeCheckoutSessionId: "cs_1" });
    const solo = await orderFixture({ status: "cancelled" });
    asAdmin();
    await del(a.reservation.id);
    expect(await Reservation.countDocuments({ stripeCheckoutSessionId: "cs_1" })).toBe(1);
    await del(solo.reservation.id, "?wholeOrder=1");
    expect(await Reservation.countDocuments()).toBe(1);
  });

  it("supprime une réservation sans création liée", async () => {
    const reservation = await createReservation();
    asAdmin();
    expect((await del(reservation.id)).status).toBe(204);
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await del(unknownId())).status).toBe(500);
  });
});
