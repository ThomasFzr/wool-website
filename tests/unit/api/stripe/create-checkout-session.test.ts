import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { POST } from "@/app/api/stripe/create-checkout-session/route";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";
import { createCreation, installFakeStripe, type FakeStripe } from "../../../helpers/stripe-fake";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));

const USER_ID = new mongoose.Types.ObjectId().toString();
let stripe: FakeStripe;

const checkout = (body: unknown) =>
  POST(makeRequest("/api/stripe/create-checkout-session", { method: "POST", body }));

const itemsOf = (...creations: { _id: unknown }[]) =>
  creations.map((c) => ({ creationId: String(c._id) }));

const createArgs = () => stripe.checkout.sessions.create.mock.calls[0][0];

function setPickupConditions(conditions: Record<string, unknown>, shippingCost = 5) {
  return Settings.create({ _id: "main", shippingCost, pickupConditions: { enabled: true, ...conditions } });
}

describe("POST /api/stripe/create-checkout-session", () => {
  beforeEach(async () => {
    await connectToDatabase();
    stripe = installFakeStripe();
    stripe.checkout.sessions.create.mockResolvedValue({ id: "cs_new", url: "https://checkout.stripe.test/cs_new" });
    asUser("client@example.com", { id: USER_ID, name: "Alice" });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("contrôles d'accès et validation", () => {
    it("répond 500 quand Stripe n'est pas configuré", async () => {
      vi.mocked(getStripeInstance).mockImplementation(() => {
        throw new Error("STRIPE_SECRET_KEY n'est pas définie");
      });
      const res = await checkout({ items: [] });
      expect(res.status).toBe(500);
      expect(await res.text()).toBe("STRIPE_SECRET_KEY n'est pas définie");
    });

    it("refuse un visiteur non connecté", async () => {
      asAnonymous();
      expect((await checkout({ items: [{ creationId: "x" }] })).status).toBe(401);
    });

    it.each([
      ["sans items", {}],
      ["items non tableau", { items: "abc" }],
      ["panier vide", { items: [] }],
    ])("refuse un panier invalide (%s)", async (_label, body) => {
      const res = await checkout(body);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Panier vide");
    });

    it("répond 404 quand une création n'existe pas", async () => {
      const creation = await createCreation();
      const res = await checkout({
        items: [...itemsOf(creation), { creationId: new mongoose.Types.ObjectId().toString() }],
      });
      expect(res.status).toBe(404);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
    });

    it("refuse une création sans prix", async () => {
      const { insertedId } = await Creation.collection.insertOne({ title: "Sans prix", price: null });
      const res = await checkout({ items: [{ creationId: insertedId.toString() }] });
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(/pas de prix/);
    });
  });

  describe("paiement en retrait sur place", () => {
    it("réserve la pièce, crée la session Stripe et la réservation pending", async () => {
      const creation = await createCreation();

      const { status, body } = await readJson(await checkout({ items: itemsOf(creation) }));

      expect(status).toBe(200);
      expect(body).toEqual({ url: "https://checkout.stripe.test/cs_new" });

      const args = createArgs();
      expect(args.mode).toBe("payment");
      expect(args.customer_email).toBe("client@example.com");
      expect(args.success_url).toBe("http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}");
      expect(args.cancel_url).toBe("http://localhost:3000/checkout/cancel");
      expect(args.shipping_address_collection).toBeUndefined();
      expect(args.expires_at - Math.floor(Date.now() / 1000)).toBeGreaterThanOrEqual(30 * 60);
      expect(args.line_items).toEqual([
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Bonnet Mérinos",
              description: "Couleur: Rose",
              images: ["https://img.example.com/bonnet.jpg"],
            },
            unit_amount: 4000,
          },
          quantity: 1,
        },
      ]);

      const reservation = (await Reservation.findOne())!;
      expect(reservation.stripeCheckoutSessionId).toBe("cs_new");
      expect(reservation.paymentStatus).toBe("pending");
      expect(reservation.status).toBe("preparing");
      expect(reservation.deliveryMode).toBe("pickup");
      expect(reservation.shippingCost).toBe(0);
      expect(reservation.userId!.toString()).toBe(USER_ID);
      expect(reservation.name).toBe("Alice");
      expect(args.metadata).toEqual({
        userId: USER_ID,
        reservationIds: JSON.stringify([reservation._id.toString()]),
        deliveryMode: "pickup",
        shippingCost: "5",
      });

      const locked = (await Creation.findById(creation._id))!;
      expect(locked.reserved).toBe(true);
      expect(locked.reservedContact).toBe("client@example.com");
      expect(locked.reservedName).toBe("Alice");
      // Le verrou est au nom de la réservation : elle seule pourra le libérer
      expect(locked.reservedByReservationId!.toString()).toBe(reservation._id.toString());
    });

    it("utilise l'image historique ou aucune image, et omet la description sans couleur", async () => {
      const { insertedId: legacy } = await Creation.collection.insertOne({
        title: "Ancienne",
        price: 10.555,
        imageUrl: "https://img.example.com/legacy.jpg",
        images: [],
        color: "",
      });
      const { insertedId: bare } = await Creation.collection.insertOne({ title: "Nue", price: 0 });
      asUser("client@example.com"); // sans nom ni id

      await checkout({ items: [{ creationId: legacy.toString() }, { creationId: bare.toString() }] });

      const [first, second] = createArgs().line_items;
      expect(first.price_data.product_data).toEqual({
        name: "Ancienne",
        description: undefined,
        images: ["https://img.example.com/legacy.jpg"],
      });
      expect(first.price_data.unit_amount).toBe(1056);
      expect(second.price_data.product_data.images).toBeUndefined();
      expect(second.price_data.unit_amount).toBe(0);
      expect((await Creation.findById(legacy))!.reservedName).toBe("");
      expect((await Reservation.findOne({ creationId: legacy }))!.name).toBe("");
    });

    it("ignore les conditions de retrait quand elles sont désactivées", async () => {
      await Settings.create({ _id: "main", pickupConditions: { enabled: false, minimumAmount: 1000 } });
      const creation = await createCreation();
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(200);
    });

    it("refuse le retrait sous le montant minimum", async () => {
      await setPickupConditions({ minimumAmount: 50 });
      const creation = await createCreation();
      const res = await checkout({ items: itemsOf(creation), deliveryMode: "pickup" });
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(/montant minimum de 50\.00 €/);
      expect((await Creation.findById(creation._id))!.reserved).toBe(false);
    });

    it("accepte le retrait quand le minimum est atteint ou nul", async () => {
      await setPickupConditions({ minimumAmount: 40 });
      const creation = await createCreation();
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(200);
    });

    it("ignore un montant minimum à zéro", async () => {
      await setPickupConditions({ minimumAmount: 0, allowedPostalCodes: [] });
      const creation = await createCreation();
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(200);
    });

    it("exige un code postal dans le profil quand des codes sont imposés", async () => {
      await setPickupConditions({ allowedPostalCodes: ["69"] });
      const creation = await createCreation();
      const res = await checkout({ items: itemsOf(creation) });
      expect(res.status).toBe(400);
      expect(await res.text()).toMatch(/renseigner votre code postal/);
    });

    it("refuse un code postal hors zone", async () => {
      await setPickupConditions({ allowedPostalCodes: ["69", "38200"] });
      await User.create({ email: "client@example.com", postalCode: "75001" });
      const creation = await createCreation();
      const res = await checkout({ items: itemsOf(creation) });
      expect(res.status).toBe(400);
      expect(await res.text()).toBe(
        "La remise en main propre n'est pas disponible pour le code postal 75001. Codes autorisés : 69, 38200"
      );
    });

    it.each([
      ["correspondance exacte", " 69001 ", ["69001"]],
      ["préfixe autorisé", "69001", [" 69 "]],
      ["code utilisateur préfixe du code autorisé", "69", ["69001"]],
      ["insensible à la casse", "l-1234", ["L-1234"]],
    ])("accepte un code postal autorisé (%s)", async (_label, userCode, allowed) => {
      await setPickupConditions({ allowedPostalCodes: allowed });
      await User.create({ email: "client@example.com", postalCode: userCode });
      const creation = await createCreation();
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(200);
    });
  });

  describe("paiement avec livraison", () => {
    it("ajoute les frais de port une seule fois et collecte l'adresse", async () => {
      await setPickupConditions({ minimumAmount: 1000 }, 6.9);
      const a = await createCreation({ title: "A" });
      const b = await createCreation({ title: "B" });

      const res = await checkout({ items: itemsOf(a, b), deliveryMode: "shipping" });

      // Les conditions de retrait ne s'appliquent pas à la livraison
      expect(res.status).toBe(200);
      const args = createArgs();
      expect(args.line_items).toHaveLength(3);
      expect(args.line_items[2]).toEqual({
        price_data: {
          currency: "eur",
          product_data: { name: "Frais de livraison", description: "Envoi postal" },
          unit_amount: 690,
        },
        quantity: 1,
      });
      expect(args.shipping_address_collection).toEqual({
        allowed_countries: ["FR", "BE", "CH", "LU", "MC"],
      });
      expect(args.metadata.deliveryMode).toBe("shipping");
      expect(args.metadata.shippingCost).toBe("6.9");

      const reservations = await Reservation.find().sort({ _id: 1 });
      expect(reservations.map((r) => r.shippingCost)).toEqual([6.9, 0]);
      expect(reservations.every((r) => r.deliveryMode === "shipping")).toBe(true);
    });

    it("applique 5 € par défaut sans réglages", async () => {
      const creation = await createCreation();
      await checkout({ items: itemsOf(creation), deliveryMode: "shipping" });
      expect(createArgs().line_items[1].price_data.unit_amount).toBe(500);
    });

    it("n'ajoute pas de ligne de frais quand la livraison est offerte", async () => {
      await Settings.create({ _id: "main", shippingCost: 0 });
      const creation = await createCreation();
      await checkout({ items: itemsOf(creation), deliveryMode: "shipping" });
      expect(createArgs().line_items).toHaveLength(1);
      expect((await Reservation.findOne())!.shippingCost).toBe(0);
    });
  });

  describe("pièces uniques déjà prises", () => {
    it("refuse une pièce déjà vendue", async () => {
      const creation = await createCreation({ sold: true });
      const res = await checkout({ items: itemsOf(creation) });
      expect(res.status).toBe(409);
      expect(await res.text()).toMatch(/« Bonnet Mérinos » n'est plus disponible/);
      expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
      expect(await Reservation.countDocuments()).toBe(0);
    });

    it("refuse une pièce réservée par un autre client et libère les autres articles du panier", async () => {
      const free = await createCreation({ title: "Libre" });
      const taken = await createCreation({ title: "Prise", reserved: true, reservedContact: "autre@example.com" });

      const res = await checkout({ items: itemsOf(free, taken) });

      expect(res.status).toBe(409);
      expect(await res.text()).toMatch(/« Prise »/);
      const released = (await Creation.findById(free._id))!;
      expect(released.reserved).toBe(false);
      expect(released.reservedContact).toBeUndefined();
      expect((await Creation.findById(taken._id))!.reservedContact).toBe("autre@example.com");
    });

    it("ne passe pas par-dessus une réservation manuelle du même client", async () => {
      const creation = await createCreation({ reserved: true, reservedContact: "client@example.com" });
      // Réservation manuelle : pas de session Stripe
      await Reservation.create({ creationId: creation._id, contact: "client@example.com", paymentStatus: "pending" });
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(409);
    });

    it("reprend le verrou d'un checkout abandonné du même client et expire l'ancienne session", async () => {
      const staleId = new mongoose.Types.ObjectId();
      const creation = await createCreation({
        reserved: true,
        reservedContact: "client@example.com",
        reservedByReservationId: staleId,
      });
      const stale = await Reservation.create({
        _id: staleId,
        creationId: creation._id,
        contact: "client@example.com",
        paymentStatus: "pending",
        status: "preparing",
        stripeCheckoutSessionId: "cs_old",
      });

      const res = await checkout({ items: itemsOf(creation) });

      expect(res.status).toBe(200);
      expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_old");
      const old = (await Reservation.findById(stale._id))!;
      expect(old.status).toBe("cancelled");
      expect(old.paymentStatus).toBe("failed");
      expect(old.cancelReason).toBe("Remplacée par une nouvelle session de paiement");
      const fresh = (await Reservation.findOne({ stripeCheckoutSessionId: "cs_new", paymentStatus: "pending" }))!;
      // Le verrou passe à la nouvelle réservation
      expect((await Creation.findById(creation._id))!.reservedByReservationId!.toString()).toBe(
        fresh._id.toString()
      );
    });

    it("ignore l'échec d'expiration d'une ancienne session déjà close", async () => {
      const staleId = new mongoose.Types.ObjectId();
      const creation = await createCreation({
        reserved: true,
        reservedContact: "client@example.com",
        reservedByReservationId: staleId,
      });
      await Reservation.create({
        _id: staleId,
        creationId: creation._id,
        contact: "client@example.com",
        paymentStatus: "pending",
        stripeCheckoutSessionId: "cs_old",
      });
      stripe.checkout.sessions.expire.mockRejectedValue(new Error("already expired"));
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(200);
    });

    it("n'expire aucune session quand l'ancien identifiant de session est vide", async () => {
      const staleId = new mongoose.Types.ObjectId();
      const creation = await createCreation({
        reserved: true,
        reservedContact: "client@example.com",
        reservedByReservationId: staleId,
      });
      await Reservation.create({
        _id: staleId,
        creationId: creation._id,
        contact: "client@example.com",
        paymentStatus: "pending",
        stripeCheckoutSessionId: "",
      });
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(200);
      expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
    });

    it("refuse quand le client a un ancien checkout mais que la pièce est verrouillée par quelqu'un d'autre", async () => {
      // Le verrou appartient à une autre réservation que l'ancien checkout du client
      const creation = await createCreation({
        reserved: true,
        reservedContact: "autre@example.com",
        reservedByReservationId: new mongoose.Types.ObjectId(),
      });
      const stale = await Reservation.create({
        creationId: creation._id,
        contact: "client@example.com",
        paymentStatus: "pending",
        stripeCheckoutSessionId: "cs_old",
      });
      expect((await checkout({ items: itemsOf(creation) })).status).toBe(409);
      expect(stripe.checkout.sessions.expire).not.toHaveBeenCalled();
      expect((await Reservation.findById(stale._id))!.paymentStatus).toBe("pending");
      expect((await Creation.findById(creation._id))!.reservedContact).toBe("autre@example.com");
    });
  });

  describe("pannes en aval", () => {
    it("libère les pièces quand Stripe refuse de créer la session", async () => {
      const creation = await createCreation();
      stripe.checkout.sessions.create.mockRejectedValue(new Error("Stripe indisponible"));

      const res = await checkout({ items: itemsOf(creation) });

      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Stripe indisponible");
      expect((await Creation.findById(creation._id))!.reserved).toBe(false);
      expect(await Reservation.countDocuments()).toBe(0);
    });

    it("répond « Server error » sur une erreur sans message, même si la libération échoue", async () => {
      const creation = await createCreation();
      stripe.checkout.sessions.create.mockRejectedValue({});
      vi.spyOn(Creation, "updateOne").mockRejectedValueOnce(new Error("db down"));

      const res = await checkout({ items: itemsOf(creation) });

      expect(res.status).toBe(500);
      expect(await res.text()).toBe("Server error");
      expect(console.error).toHaveBeenCalledWith(
        "[CHECKOUT] Échec de la libération des créations réservées:",
        expect.any(Error)
      );
    });

    it("annule tout quand l'enregistrement des réservations échoue", async () => {
      // Un id utilisateur non ObjectId fait échouer l'insertion des réservations
      asUser("client@example.com", { id: "pas-un-object-id" });
      const creation = await createCreation();

      const res = await checkout({ items: itemsOf(creation) });

      expect(res.status).toBe(500);
      expect(await Reservation.countDocuments()).toBe(0);
      expect((await Creation.findById(creation._id))!.reserved).toBe(false);
      expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_new");
    });

    it("journalise les échecs du nettoyage sans masquer l'erreur d'origine", async () => {
      asUser("client@example.com", { id: "pas-un-object-id" });
      const creation = await createCreation();
      vi.spyOn(Reservation, "deleteMany").mockRejectedValueOnce(new Error("delete ko"));
      stripe.checkout.sessions.expire.mockRejectedValue(new Error("expire ko"));

      const res = await checkout({ items: itemsOf(creation) });

      expect(res.status).toBe(500);
      expect(console.error).toHaveBeenCalledWith("[CHECKOUT] Échec du nettoyage des réservations:", expect.any(Error));
      expect(console.error).toHaveBeenCalledWith(
        "[CHECKOUT] Échec de l'expiration de la session Stripe:",
        expect.any(Error)
      );
    });
  });
});
