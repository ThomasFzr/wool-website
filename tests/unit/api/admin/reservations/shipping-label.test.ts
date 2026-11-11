import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GET } from "@/app/api/admin/reservations/[id]/shipping-label/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { makeRequest, routeParams } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import { createCreation, createReservation, expectAdminOnly, failSession } from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const label = (id: string) =>
  GET(makeRequest(`/api/admin/reservations/${id}/shipping-label`), routeParams({ id }));
const unknownId = () => new mongoose.Types.ObjectId().toString();

const fullAddress = {
  name: "Alice Martin",
  line1: "12 rue des Pelotes",
  line2: "Bât. B",
  postalCode: "69001",
  city: "Lyon",
  country: "France",
};

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/admin/reservations/[id]/shipping-label", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => label(unknownId()));
  });

  it("répond 404 pour une commande inexistante", async () => {
    asAdmin();
    const res = await label(unknownId());
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Commande non trouvée");
  });

  it("refuse une commande en retrait sur place", async () => {
    const reservation = await createReservation({ deliveryMode: "pickup" });
    asAdmin();
    const res = await label(reservation.id);
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Cette commande n'est pas en mode livraison");
  });

  it("génère un bordereau texte téléchargeable avec tous les articles de la commande", async () => {
    vi.stubEnv("SHIPPING_SENDER_NAME", "Atelier Laine");
    vi.stubEnv("SHIPPING_SENDER_ADDRESS", "3 place du Tricot");
    vi.stubEnv("SHIPPING_SENDER_CITY", "Annecy");
    vi.stubEnv("SHIPPING_SENDER_POSTAL_CODE", "74000");
    vi.stubEnv("SHIPPING_SENDER_COUNTRY", "Suisse");
    const pull = await createCreation({ title: "Pull", color: "Vert", price: 80 });
    const bonnet = await createCreation({ title: "Bonnet", price: 0 });
    await Creation.collection.updateOne({ _id: bonnet._id }, { $unset: { color: "" } });
    const supprimee = await createCreation({ title: "Supprimée" });
    const sansTitre = await createCreation();
    await Creation.collection.updateOne({ _id: sansTitre._id }, { $unset: { title: "" } });
    const reservation = await createReservation({
      deliveryMode: "shipping",
      stripeCheckoutSessionId: "cs_42",
      creationId: pull._id,
      shippingAddress: fullAddress,
      trackingNumber: "6A0001",
    });
    await createReservation({ stripeCheckoutSessionId: "cs_42", creationId: bonnet._id });
    await createReservation({ stripeCheckoutSessionId: "cs_42", creationId: supprimee._id });
    await createReservation({ stripeCheckoutSessionId: "cs_42", creationId: sansTitre._id });
    await createReservation({ stripeCheckoutSessionId: "autre", creationId: pull._id });
    await Creation.deleteOne({ _id: supprimee._id });
    asAdmin();

    const res = await label(reservation.id);
    expect(res.status).toBe(200);
    const suffix = reservation.id.slice(-8);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(`attachment; filename="bordereau-${suffix}.txt"`);

    const text = await res.text();
    expect(text).toContain("Atelier Laine\n3 place du Tricot\n74000 Annecy\nSuisse");
    expect(text).toContain("Alice Martin\n12 rue des Pelotes\nBât. B\n69001 Lyon\nFrance");
    expect(text).toContain("Pull - Vert (80 €)\nBonnet\nArticle supprimé\nArticle - Bleu (50 €)");
    expect(text).toContain("🔢 NUMÉRO DE SUIVI : 6A0001");
    expect(text).toContain(`COMMANDE N° : ${suffix}`);
    expect(text).toContain(`DATE D'EXPÉDITION : ${new Date().toLocaleDateString("fr-FR")}`);
  });

  it("utilise l'expéditeur par défaut et la seule réservation hors session Stripe", async () => {
    const creation = await createCreation({ title: "Écharpe" });
    const reservation = await createReservation({
      deliveryMode: "shipping",
      creationId: creation._id,
      shippingAddress: { line1: "1 rue Seule", city: "Nantes" },
    });
    asAdmin();

    const text = await (await label(reservation.id)).text();
    expect(text).toContain("📦 EXPÉDITEUR :\nMailleMum\n\n \nFrance");
    expect(text).toContain("📬 DESTINATAIRE :\n1 rue Seule\nNantes\n");
    expect(text).toContain("📋 CONTENU DU COLIS :\nÉcharpe - Bleu (50 €)\n");
    expect(text).not.toContain("NUMÉRO DE SUIVI");
  });

  it("reprend l'adresse portée par un autre article de la commande", async () => {
    const reservation = await createReservation({ deliveryMode: "shipping", stripeCheckoutSessionId: "cs_7" });
    await createReservation({ stripeCheckoutSessionId: "cs_7", shippingAddress: fullAddress });
    asAdmin();

    const text = await (await label(reservation.id)).text();
    expect(text).toContain("Alice Martin");
  });

  it("indique une adresse non disponible quand aucun article n'en porte", async () => {
    const reservation = await createReservation({ deliveryMode: "shipping" });
    asAdmin();

    const text = await (await label(reservation.id)).text();
    expect(text).toContain("📬 DESTINATAIRE :\nAdresse non disponible\n");
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    const res = await label(unknownId());
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Erreur serveur" });
  });
});
