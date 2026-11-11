import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/account/reservations/[id]/cancel/route";
import { connectToDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import User from "@/models/User";
import { makeRequest, readJson, routeParams } from "../../../../helpers/http";
import { asAnonymous, asUser } from "../../../../helpers/session";
import { createCreation, createReservation as createAnyReservation, newId } from "../../../../helpers/account-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

const cancel = async (id: unknown, body: unknown = {}) =>
  readJson(
    await PATCH(
      makeRequest(`/api/account/reservations/${id}/cancel`, { method: "PATCH", body }),
      routeParams({ id: String(id) })
    )
  );

// Seule une réservation en attente et non payée est annulable par le client
const createReservation = (overrides: Record<string, unknown> = {}) =>
  createAnyReservation({ paymentStatus: "pending", ...overrides });

const mails = () => vi.mocked(sendEmail).mock.calls.map(([m]) => m);
const buyerMail = () => mails().find((m) => m.to === "client@example.com")!;
const sellerMail = () => mails().find((m) => m.to === "vendeur@example.com")!;

async function reservedCreation(overrides: Record<string, unknown> = {}) {
  return createCreation({
    reserved: true,
    reservedName: "Client",
    reservedContact: "client@example.com",
    reservedMessage: "msg",
    reservedAt: new Date(),
    ...overrides,
  });
}

describe("PATCH /api/account/reservations/[id]/cancel", () => {
  beforeEach(async () => {
    await connectToDatabase();
    vi.stubEnv("SELLER_EMAIL", "vendeur@example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://boutique.example.com");
  });

  describe("contrôle d'accès", () => {
    it("refuse un visiteur non connecté", async () => {
      asAnonymous();
      const r = await createReservation();
      const { status, body } = await cancel(r._id);
      expect(status).toBe(401);
      expect(body.error).toBe("Unauthorized");
      expect((await Reservation.findById(r._id)).status).toBe("pending");
    });

    it("répond 404 pour une réservation inexistante", async () => {
      asUser();
      const { status, body } = await cancel(newId());
      expect(status).toBe(404);
      expect(body.error).toBe("Reservation not found");
    });

    it("refuse d'annuler la réservation d'un autre utilisateur", async () => {
      const r = await createReservation({ contact: "autre@example.com", userId: newId() });
      asUser("client@example.com", { id: newId().toString() });
      const { status, body } = await cancel(r._id);
      expect(status).toBe(403);
      expect(body.error).toBe("Forbidden");
      expect((await Reservation.findById(r._id)).status).toBe("pending");
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("refuse quand la réservation n'a ni userId ni le bon email", async () => {
      const r = await createReservation({ contact: "autre@example.com" });
      asUser();
      expect((await cancel(r._id)).status).toBe(403);
    });

    it("autorise le propriétaire identifié par son userId même si l'email diffère", async () => {
      const userId = newId();
      const r = await createReservation({ contact: "ancien@example.com", userId });
      asUser("client@example.com", { id: userId.toString() });
      expect((await cancel(r._id)).status).toBe(200);
      expect((await Reservation.findById(r._id)).status).toBe("cancelled");
    });

    it("autorise le propriétaire identifié par son email", async () => {
      const r = await createReservation();
      asUser();
      expect((await cancel(r._id)).status).toBe(200);
    });
  });

  it.each(["validated", "preparing", "shipped", "delivered", "cancelled"])(
    "refuse d'annuler une réservation au statut « %s »",
    async (status) => {
      const r = await createReservation({ status, creationId: (await createCreation())._id });
      asUser();
      const res = await cancel(r._id);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/ne peut plus être annulée/);
      expect((await Reservation.findById(r._id)).status).toBe(status);
      expect(sendEmail).not.toHaveBeenCalled();
    }
  );

  it("refuse d'annuler une réservation payée, même encore « pending »", async () => {
    const r = await createAnyReservation({ status: "pending", paymentStatus: "paid" });
    asUser();
    expect((await cancel(r._id)).status).toBe(400);
    expect((await Reservation.findById(r._id)).status).toBe("pending");
  });

  it("une réservation déjà annulée ne relibère pas la pièce verrouillée depuis par un autre acheteur", async () => {
    const creation = await reservedCreation();
    const r = await createReservation({ creationId: creation._id });
    await Creation.updateOne({ _id: creation._id }, { $set: { reservedByReservationId: r._id } });
    asUser();
    expect((await cancel(r._id)).status).toBe(200);

    // Un autre acheteur verrouille la pièce, puis le client renvoie l'annulation
    const otherOwner = newId();
    await Creation.updateOne(
      { _id: creation._id },
      { $set: { reserved: true, reservedContact: "autre@example.com", reservedByReservationId: otherOwner } }
    );
    expect((await cancel(r._id)).status).toBe(400);

    const locked = (await Creation.findById(creation._id).lean()) as any;
    expect(locked.reserved).toBe(true);
    expect(locked.reservedByReservationId.toString()).toBe(otherOwner.toString());
  });

  it("ne libère pas une pièce dont le verrou appartient à une autre réservation", async () => {
    const creation = await reservedCreation({ reservedByReservationId: newId() });
    const r = await createReservation({ creationId: creation._id });
    asUser();
    expect((await cancel(r._id)).status).toBe(200);
    expect(((await Creation.findById(creation._id).lean()) as any).reserved).toBe(true);
  });

  it("deux annulations simultanées n'en appliquent qu'une", async () => {
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    const statuses = (await Promise.all([cancel(r._id), cancel(r._id)])).map((x) => x.status).sort();
    expect(statuses).toEqual([200, 400]);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("annule, libère la création et prévient acheteur et vendeur", async () => {
    const reservationId = newId();
    const creation = await reservedCreation({
      images: ["/a.jpg", "/b.jpg"],
      imageUrl: "/old.jpg",
      reservedByReservationId: reservationId,
    });
    const r = await createReservation({ _id: reservationId, creationId: creation._id, name: "Client <b>" });
    asUser();

    const { status, body } = await cancel(r._id, { reason: "Trop cher" });
    expect(status).toBe(200);
    expect(body).toEqual({ ok: true });

    const saved = await Reservation.findById(r._id);
    expect(saved).toMatchObject({ status: "cancelled", cancelReason: "Trop cher", cancelledBy: "user" });

    const freed = (await Creation.findById(creation._id).lean()) as any;
    expect(freed.reserved).toBe(false);
    for (const key of ["reservedName", "reservedContact", "reservedMessage", "reservedAt", "reservedByReservationId"]) {
      expect(freed).not.toHaveProperty(key);
    }

    expect(sendEmail).toHaveBeenCalledTimes(2);
    const buyer = buyerMail();
    expect(buyer.subject).toBe("❌ Vous avez annulé votre réservation");
    expect(buyer.html).toContain("Client &lt;b&gt;");
    expect(buyer.html).not.toContain("Client <b>");
    expect(buyer.html).toContain("Trop cher");
    expect(buyer.html).toContain('src="/a.jpg"');
    expect(buyer.html).toContain("Couleur : <strong>Rouge</strong>");
    expect(buyer.html).toContain("30 €");
    expect(buyer.html).toContain("https://boutique.example.com/account/orders");

    const seller = sellerMail();
    expect(seller.subject).toBe("❌ Réservation annulée par l'acheteur : Bonnet");
    expect(seller.html).toContain("Client &lt;b&gt;");
    expect(seller.html).toContain("(client@example.com)");
    expect(seller.html).toContain("Trop cher");
  });

  it("échappe la raison d'annulation et la fiche dans les emails", async () => {
    const r = await createReservation({
      creationId: (await createCreation({ title: "<i>Bonnet</i>", color: "<b>Rouge</b>" }))._id,
    });
    asUser();
    await cancel(r._id, { reason: '<a href="x">clic</a>' });
    expect(buyerMail().html).toContain("&lt;a href=&quot;x&quot;&gt;clic&lt;/a&gt;");
    expect(buyerMail().html).toContain("&lt;i&gt;Bonnet&lt;/i&gt;");
    expect(buyerMail().html).not.toContain("<b>Rouge</b>");
    expect(sellerMail().html).not.toContain('<a href="x">');
  });

  it("ne libère pas une création déjà vendue", async () => {
    const creation = await reservedCreation({ sold: true });
    const r = await createReservation({ creationId: creation._id });
    asUser();
    expect((await cancel(r._id)).status).toBe(200);
    const after = (await Creation.findById(creation._id).lean()) as any;
    expect(after).toMatchObject({ reserved: true, sold: true, reservedName: "Client" });
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("n'envoie aucun email quand la création n'existe plus", async () => {
    const r = await createReservation({ creationId: newId() });
    asUser();
    expect((await cancel(r._id)).status).toBe(200);
    expect((await Reservation.findById(r._id)).status).toBe("cancelled");
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("enregistre une raison vide quand aucune n'est fournie", async () => {
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    await cancel(r._id);
    expect((await Reservation.findById(r._id)).cancelReason).toBe("");
    expect(buyerMail().html).toContain("Aucune raison précisée.");
  });

  it("affiche « Aucune raison précisée. » pour une raison faite d'espaces", async () => {
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    await cancel(r._id, { reason: "   " });
    expect(buyerMail().html).toContain("Aucune raison précisée.");
  });

  it.each([false, 42, { texte: "x" }])("refuse une raison qui n'est pas une chaîne (%s) sans rien modifier", async (reason) => {
    const creation = await reservedCreation();
    const r = await createReservation({ creationId: creation._id });
    asUser();
    const { status, body } = await cancel(r._id, { reason });
    expect(status).toBe(400);
    expect(body.error).toBe("Raison invalide");
    expect((await Reservation.findById(r._id)).status).toBe("pending");
    expect(((await Creation.findById(creation._id).lean()) as any).reserved).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("accepte une raison nulle", async () => {
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    expect((await cancel(r._id, { reason: null })).status).toBe(200);
    expect((await Reservation.findById(r._id)).cancelReason).toBe("");
  });

  it("utilise imageUrl à défaut d'images, sans couleur ni prix", async () => {
    const { insertedId } = await Creation.collection.insertOne({
      title: "Écharpe",
      images: [],
      imageUrl: "/legacy.jpg",
      price: null,
    });
    const r = await createReservation({ creationId: insertedId });
    asUser();
    await cancel(r._id);
    const html = buyerMail().html;
    expect(html).toContain('src="/legacy.jpg"');
    expect(html).toContain("Prix sur demande");
    expect(html).not.toContain("Couleur :");
    expect(sellerMail().html).not.toContain("Couleur :");
  });

  it("n'affiche pas d'image quand la création n'en a aucune", async () => {
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    await cancel(r._id);
    expect(buyerMail().html).not.toContain(`alt="Bonnet"`);
    expect(sellerMail().html).not.toContain(`alt="Bonnet"`);
  });

  it("n'écrit pas à l'acheteur qui a coupé les notifications", async () => {
    await User.create({ email: "client@example.com", emailNotifications: false });
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    await cancel(r._id);
    expect(mails().map((m) => m.to)).toEqual(["vendeur@example.com"]);
  });

  it("n'écrit pas au vendeur sans SELLER_EMAIL", async () => {
    vi.stubEnv("SELLER_EMAIL", "");
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    await cancel(r._id);
    expect(mails().map((m) => m.to)).toEqual(["client@example.com"]);
  });

  it("réussit même si un email échoue, en journalisant l'erreur", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error("resend down"));
    const r = await createReservation({ creationId: (await createCreation())._id });
    asUser();
    const { status } = await cancel(r._id);
    expect(status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith("[cancel] Email non envoyé:", expect.any(Error));
  });

  it("répond 404 pour un identifiant invalide", async () => {
    asUser();
    const { status, body } = await cancel("pas-un-id");
    expect(status).toBe(404);
    expect(body.error).toBe("Reservation not found");
  });

  it("répond 500 quand la base est indisponible", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Reservation, "findById").mockRejectedValueOnce(new Error("db down"));
    asUser();
    const { status, body } = await cancel(newId());
    expect(status).toBe(500);
    expect(body.error).toBe("Server error");
  });
});
