import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import {
  fulfillCheckoutSession,
  releaseExpiredCheckoutSession,
} from "@/lib/checkout-fulfillment";
import { connectToDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { createCreation, installFakeStripe, paidSession, type FakeStripe } from "../../helpers/stripe-fake";

vi.mock("@/lib/stripe", () => ({ getStripeInstance: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<object>()), after: vi.fn() }));

let stripe: FakeStripe;

/** Réservation "pending" rattachée à une session Checkout. */
function pendingReservation(creationId: unknown, overrides: Record<string, any> = {}) {
  return Reservation.create({
    creationId,
    name: "Alice",
    contact: "client@example.com",
    status: "preparing",
    paymentStatus: "pending",
    stripeCheckoutSessionId: "cs_test_1",
    ...overrides,
  });
}

const emailTo = (to: string) => vi.mocked(sendEmail).mock.calls.filter(([arg]) => arg.to === to);

describe("fulfillCheckoutSession", () => {
  beforeEach(async () => {
    await connectToDatabase();
    stripe = installFakeStripe();
    vi.mocked(sendEmail).mockResolvedValue({ data: { id: "email" }, error: null } as any);
    // Comportement réel hors requête Next : after() lève une erreur
    vi.mocked(after).mockImplementation(() => {
      throw new Error("`after` was called outside a request scope");
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("SELLER_EMAIL", "vendeuse@example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.example");
  });

  describe("paiement non finalisé", () => {
    it("ignore une session encore ouverte et la signale « pending »", async () => {
      const result = await fulfillCheckoutSession(paidSession({ payment_status: "unpaid", status: "open" }));
      expect(result).toEqual({ paid: false, processedCount: 0, pending: true });
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
    });

    it("ignore une session expirée sans la signaler « pending »", async () => {
      const result = await fulfillCheckoutSession(paidSession({ payment_status: "unpaid", status: "expired" }));
      expect(result).toEqual({ paid: false, processedCount: 0, pending: false });
    });

    it("ignore une session « paid » mais pas encore « complete »", async () => {
      const result = await fulfillCheckoutSession(paidSession({ status: "open" }));
      expect(result.paid).toBe(false);
    });

    it("attend un PaymentIntent encore en traitement", async () => {
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_test", status: "processing" });
      const result = await fulfillCheckoutSession(paidSession());
      expect(result).toEqual({ paid: false, processedCount: 0, pending: true });
    });

    it("refuse un PaymentIntent annulé sans le signaler « pending »", async () => {
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_test", status: "canceled" });
      const result = await fulfillCheckoutSession(paidSession());
      expect(result).toEqual({ paid: false, processedCount: 0, pending: false });
    });

    it("reste indéterminé si Stripe ne répond pas sur le PaymentIntent", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      stripe.paymentIntents.retrieve.mockRejectedValue(new Error("réseau"));
      const result = await fulfillCheckoutSession(paidSession());
      expect(result).toEqual({ paid: false, processedCount: 0, pending: true });
      expect((await Reservation.findOne())!.paymentStatus).toBe("pending");
    });

    it("lit l'identifiant d'un PaymentIntent déjà développé (objet)", async () => {
      stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_obj", status: "canceled" });
      await fulfillCheckoutSession(paidSession({ payment_intent: { id: "pi_obj" } }));
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_obj");
    });
  });

  describe("commande payée", () => {
    it("répond payé sans rien traiter quand aucune réservation ne correspond", async () => {
      const result = await fulfillCheckoutSession(paidSession());
      expect(result).toEqual({ paid: true, processedCount: 0, pending: false });
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it("valide la réservation, marque la pièce unique vendue et libère le verrou", async () => {
      const creation = await createCreation({
        reserved: true,
        reservedName: "Alice",
        reservedContact: "client@example.com",
        reservedAt: new Date(),
      });
      await pendingReservation(creation._id);

      const result = await fulfillCheckoutSession(paidSession());

      expect(result).toEqual({ paid: true, processedCount: 1, pending: false });
      const reservation = (await Reservation.findOne())!;
      expect(reservation.paymentStatus).toBe("paid");
      expect(reservation.status).toBe("validated");
      expect(reservation.stripePaymentIntentId).toBe("pi_test");
      expect(reservation.stripeCustomerId).toBe("cus_test");
      expect(reservation.paidAt).toBeInstanceOf(Date);
      expect(reservation.deliveryMode).toBe("pickup");
      expect(reservation.shippingCost).toBe(0);

      const sold = (await Creation.findById(creation._id))!;
      expect(sold.sold).toBe(true);
      expect(sold.reserved).toBe(false);
      expect(sold.salesCount).toBe(1);
      expect(sold.reservedContact).toBeUndefined();
      expect(sold.reservedName).toBeUndefined();

      expect(revalidatePath).toHaveBeenCalledWith("/");
      expect(revalidatePath).toHaveBeenCalledWith("/account/orders");
    });

    it("envoie l'email de confirmation à l'acheteur et l'alerte à la vendeuse", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);

      await fulfillCheckoutSession(paidSession(), { appUrl: "https://boutique.example" });

      const [buyer] = emailTo("client@example.com");
      expect(buyer[0].subject).toMatch(/Paiement confirmé/);
      expect(buyer[0].html).toContain("Bonjour <strong style=\"color:#0f172a;\">Alice</strong>");
      expect(buyer[0].html).toContain("Bonnet Mérinos");
      expect(buyer[0].html).toContain("Couleur : Rose");
      expect(buyer[0].html).toContain("40.00 €");
      expect(buyer[0].html).toContain('<img src="https://img.example.com/bonnet.jpg"');
      expect(buyer[0].html).toContain("https://boutique.example/account/orders");
      expect(buyer[0].html).toContain("cs_test_1");
      expect(buyer[0].html).not.toContain("Frais de livraison");

      const [seller] = emailTo("vendeuse@example.com");
      expect(seller[0].subject).toBe("💳 Nouvelle commande : 1 article");
      expect(seller[0].html).toContain("Prix : <strong>40 €</strong>");
      expect(seller[0].html).toContain("https://boutique.example/admin/reservations");
    });

    it("utilise l'URL de l'application de l'environnement par défaut", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      await fulfillCheckoutSession(paidSession());
      expect(emailTo("client@example.com")[0][0].html).toContain("https://maillemum.example/account/orders");
    });

    it("n'alerte pas la vendeuse quand SELLER_EMAIL n'est pas configuré", async () => {
      vi.stubEnv("SELLER_EMAIL", "");
      const creation = await createCreation();
      await pendingReservation(creation._id);
      await fulfillCheckoutSession(paidSession());
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("client@example.com");
    });

    it("retrouve les réservations via les metadata plutôt que par l'ID de session", async () => {
      const creation = await createCreation();
      // Réservation sans sessionId : seule la metadata permet de la retrouver
      const reservation = await pendingReservation(creation._id, { stripeCheckoutSessionId: undefined });

      const result = await fulfillCheckoutSession(
        paidSession({ metadata: { reservationIds: JSON.stringify([reservation._id.toString()]) } })
      );

      expect(result.processedCount).toBe(1);
      // Sans sessionId, le numéro de commande de l'email est l'ID de la réservation
      expect(emailTo("client@example.com")[0][0].html).toContain(reservation._id.toString());
    });

    it("traite une commande de plusieurs pièces et accorde le pluriel côté vendeuse", async () => {
      const a = await createCreation({ title: "Bonnet A", price: 30 });
      const b = await createCreation({ title: "Snood B", price: 25.5 });
      await pendingReservation(a._id);
      await pendingReservation(b._id);

      const result = await fulfillCheckoutSession(paidSession());

      expect(result.processedCount).toBe(2);
      expect(await Creation.countDocuments({ sold: true })).toBe(2);
      expect(emailTo("vendeuse@example.com")[0][0].subject).toBe("💳 Nouvelle commande : 2 articles");
      expect(emailTo("client@example.com")[0][0].html).toContain("55.50 €");
    });

    it("gère les fiches sans image principale, sans couleur ni prix", async () => {
      const { insertedId: withImageUrl } = await Creation.collection.insertOne({
        title: "Ancienne fiche",
        imageUrl: "https://img.example.com/ancienne.jpg",
        images: [],
        color: "",
        price: null,
      });
      const { insertedId: withoutImage } = await Creation.collection.insertOne({
        title: "Fiche nue",
        price: 12,
        color: "Bleu",
      });
      await pendingReservation(withImageUrl, { name: "" });
      await pendingReservation(withoutImage, { name: "" });

      await fulfillCheckoutSession(paidSession());

      const buyerHtml = emailTo("client@example.com")[0][0].html;
      expect(buyerHtml).toContain("https://img.example.com/ancienne.jpg");
      expect(buyerHtml).toContain("Prix sur demande");
      expect(buyerHtml).toContain("12.00 €");
      expect(buyerHtml).toContain("👋");
      expect(buyerHtml.match(/<img src="https:\/\/img/g)).toHaveLength(1);

      const sellerHtml = emailTo("vendeuse@example.com")[0][0].html;
      expect(sellerHtml).toContain("Prix sur demande");
      expect(sellerHtml).toContain("Prix : <strong>12 €</strong>");
      expect(sellerHtml).toContain("Couleur : <strong>Bleu</strong>");
    });

    it("échappe les données de l'acheteur et des fiches dans les emails", async () => {
      const creation = await createCreation({ title: "<b>Bonnet</b>" });
      await pendingReservation(creation._id, { name: "<script>x</script>" });
      await fulfillCheckoutSession(paidSession());
      const html = emailTo("client@example.com")[0][0].html;
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("&lt;b&gt;Bonnet&lt;/b&gt;");
    });

    it("accepte une session sans PaymentIntent (ni metadata)", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      const result = await fulfillCheckoutSession(paidSession({ payment_intent: null, metadata: undefined }));
      expect(result.processedCount).toBe(1);
      expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
      const reservation = (await Reservation.findOne())!;
      expect(reservation.stripePaymentIntentId).toBeUndefined();
      expect(reservation.deliveryMode).toBe("pickup");
    });
  });

  describe("livraison et retrait sur place", () => {
    it("enregistre les frais de port sur le premier article seulement et l'adresse de la session", async () => {
      const a = await createCreation({ title: "A" });
      const b = await createCreation({ title: "B" });
      const reservationA = await pendingReservation(a._id);
      const reservationB = await pendingReservation(b._id);

      await fulfillCheckoutSession(
        paidSession({
          metadata: {
            deliveryMode: "shipping",
            shippingCost: "6.5",
            reservationIds: JSON.stringify([reservationA._id.toString(), reservationB._id.toString()]),
          },
          shipping_details: {
            name: "Alice Martin",
            address: { line1: "1 rue des Mailles", line2: "Bât. B", city: "Lyon", postal_code: "69001", country: "FR" },
          },
        })
      );

      const [first, second] = await Promise.all([
        Reservation.findById(reservationA._id),
        Reservation.findById(reservationB._id),
      ]);
      expect(first!.deliveryMode).toBe("shipping");
      expect(first!.shippingCost).toBe(6.5);
      expect(second!.shippingCost).toBe(0);
      expect(first!.shippingAddress).toMatchObject({
        name: "Alice Martin",
        line1: "1 rue des Mailles",
        line2: "Bât. B",
        city: "Lyon",
        postalCode: "69001",
        country: "FR",
      });

      const html = emailTo("client@example.com")[0][0].html;
      expect(html).toContain("Frais de livraison");
      expect(html).toContain("6.50 €");
      expect(html).toContain("86.50 €");
    });

    it("lit l'adresse dans l'ancien champ `shipping` et complète les champs manquants", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      await fulfillCheckoutSession(
        paidSession({ metadata: { deliveryMode: "shipping" }, shipping: { address: { city: "Nantes" } } })
      );
      const reservation = (await Reservation.findOne())!;
      expect(reservation.shippingAddress).toMatchObject({
        name: "",
        line1: "",
        line2: "",
        city: "Nantes",
        postalCode: "",
        country: "",
      });
      // Livraison sans montant de frais en metadata : aucun frais
      expect(reservation.shippingCost).toBe(0);
    });

    it("se rabat sur l'adresse du PaymentIntent quand la session n'en a pas", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: "pi_test",
        status: "succeeded",
        shipping: { name: "Bob", address: { line1: "2 av. Laine", city: "Paris", postal_code: "75001", country: "FR" } },
      });
      await fulfillCheckoutSession(paidSession({ metadata: { deliveryMode: "shipping", shippingCost: "5" } }));
      expect((await Reservation.findOne())!.shippingAddress).toMatchObject({ name: "Bob", city: "Paris" });
      // Le PaymentIntent déjà récupéré est réutilisé
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
    });

    it("lit aussi `shipping_details` sur le PaymentIntent", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      stripe.paymentIntents.retrieve.mockResolvedValue({
        id: "pi_test",
        status: "succeeded",
        shipping_details: { name: "Chloé", address: { postal_code: "59000" } },
      });
      await fulfillCheckoutSession(paidSession());
      expect((await Reservation.findOne())!.shippingAddress).toMatchObject({ name: "Chloé", postalCode: "59000", city: "" });
    });

    it("n'enregistre ni frais ni adresse pour un retrait sur place", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      // Frais en metadata mais mode retrait : ils ne doivent pas être facturés dans l'email
      await fulfillCheckoutSession(paidSession({ metadata: { deliveryMode: "pickup", shippingCost: "5" } }));
      const reservation = (await Reservation.findOne())!;
      expect(reservation.deliveryMode).toBe("pickup");
      expect(reservation.shippingCost).toBe(0);
      expect(reservation.shippingAddress?.city).toBeUndefined();
      const html = emailTo("client@example.com")[0][0].html;
      expect(html).not.toContain("Frais de livraison");
      expect(html).toContain("40.00 €");
    });
  });

  describe("idempotence et cas limites", () => {
    it("ne traite et n'envoie les emails qu'une fois sur deux appels (webhook + verify-session)", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);

      const first = await fulfillCheckoutSession(paidSession());
      const second = await fulfillCheckoutSession(paidSession());

      expect(first.processedCount).toBe(1);
      expect(second).toEqual({ paid: true, processedCount: 0, pending: false });
      expect(sendEmail).toHaveBeenCalledTimes(2); // acheteur + vendeuse, une seule fois
      expect((await Creation.findById(creation._id))!.salesCount).toBe(1);
    });

    it("ne traite qu'une fois deux appels concurrents", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);

      const results = await Promise.all([
        fulfillCheckoutSession(paidSession()),
        fulfillCheckoutSession(paidSession()),
      ]);

      expect(results.map((r) => r.processedCount).sort()).toEqual([0, 1]);
      expect((await Creation.findById(creation._id))!.salesCount).toBe(1);
      expect(emailTo("client@example.com")).toHaveLength(1);
    });

    it("n'incrémente pas les ventes d'une pièce déjà vendue mais confirme quand même le paiement", async () => {
      const creation = await createCreation({ sold: true, salesCount: 1 });
      await pendingReservation(creation._id);

      const result = await fulfillCheckoutSession(paidSession());

      expect(result.processedCount).toBe(1);
      expect((await Creation.findById(creation._id))!.salesCount).toBe(1);
      expect(emailTo("client@example.com")).toHaveLength(1);
    });

    it("valide la réservation d'une création supprimée sans envoyer d'email", async () => {
      await pendingReservation(new mongoose.Types.ObjectId());

      const result = await fulfillCheckoutSession(paidSession());

      // BUG: la réservation passe à "paid" mais processedCount vaut 0 et aucun email
      // de confirmation ne part : l'acheteur a payé sans recevoir de confirmation.
      expect(result).toEqual({ paid: true, processedCount: 0, pending: false });
      expect((await Reservation.findOne())!.paymentStatus).toBe("paid");
      expect(sendEmail).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("ne fait jamais échouer le paiement quand un email échoue", async () => {
      const creation = await createCreation();
      await pendingReservation(creation._id);
      vi.mocked(sendEmail)
        .mockRejectedValueOnce(new Error("Resend indisponible"))
        .mockRejectedValueOnce("quota dépassé");

      const result = await fulfillCheckoutSession(paidSession());

      expect(result.processedCount).toBe(1);
      expect(console.error).toHaveBeenCalledWith("[FULFILL] Échec de l'email acheteur:", "Resend indisponible");
      expect(console.error).toHaveBeenCalledWith("[FULFILL] Échec de l'email vendeur:", "quota dépassé");
    });

    it("diffère les emails après la réponse HTTP quand after() est disponible", async () => {
      let task: (() => Promise<void>) | undefined;
      vi.mocked(after).mockImplementation((t: any) => {
        task = t;
      });
      const creation = await createCreation();
      await pendingReservation(creation._id);

      const result = await fulfillCheckoutSession(paidSession());

      expect(result.processedCount).toBe(1);
      expect(sendEmail).not.toHaveBeenCalled();
      await task!();
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });
  });
});

describe("releaseExpiredCheckoutSession", () => {
  beforeEach(async () => {
    await connectToDatabase();
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  /** Pièce verrouillée au nom de la réservation `reservationId`. */
  function lockedCreation(reservationId: mongoose.Types.ObjectId, overrides: Record<string, any> = {}) {
    return createCreation({
      reserved: true,
      reservedName: "Alice",
      reservedContact: "client@example.com",
      reservedAt: new Date(),
      reservedByReservationId: reservationId,
      ...overrides,
    });
  }

  it("annule les réservations pending de la session et libère leurs pièces", async () => {
    const reservationId = new mongoose.Types.ObjectId();
    const creation = await lockedCreation(reservationId);
    await pendingReservation(creation._id, { _id: reservationId });

    const result = await releaseExpiredCheckoutSession(paidSession({ status: "expired" }));

    expect(result).toEqual({ cancelledCount: 1 });
    const reservation = (await Reservation.findOne())!;
    expect(reservation.status).toBe("cancelled");
    expect(reservation.cancelReason).toBe("Session de paiement expirée");
    // Le paiement est clos : un événement rejoué ne retrouve plus cette réservation
    expect(reservation.paymentStatus).toBe("failed");
    const released = (await Creation.findById(creation._id))!;
    expect(released.reserved).toBe(false);
    expect(released.reservedContact).toBeUndefined();
    expect(released.reservedByReservationId).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("retrouve les réservations via les metadata", async () => {
    const reservationId = new mongoose.Types.ObjectId();
    const creation = await lockedCreation(reservationId);
    await pendingReservation(creation._id, { _id: reservationId, stripeCheckoutSessionId: "autre" });

    const result = await releaseExpiredCheckoutSession(
      paidSession({ metadata: { reservationIds: JSON.stringify([reservationId.toString()]) } })
    );

    expect(result.cancelledCount).toBe(1);
    expect((await Creation.findById(creation._id))!.reserved).toBe(false);
  });

  it("ne libère pas une pièce verrouillée depuis par un autre acheteur", async () => {
    const creation = await lockedCreation(new mongoose.Types.ObjectId(), {
      reservedContact: "autre@example.com",
    });
    await pendingReservation(creation._id);

    const result = await releaseExpiredCheckoutSession(paidSession({ status: "expired" }));

    expect(result.cancelledCount).toBe(1);
    const stillLocked = (await Creation.findById(creation._id))!;
    expect(stillLocked.reserved).toBe(true);
    expect(stillLocked.reservedContact).toBe("autre@example.com");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("un événement « expired » rejoué ne libère pas le verrou d'un nouvel acheteur", async () => {
    const firstId = new mongoose.Types.ObjectId();
    const creation = await lockedCreation(firstId);
    await pendingReservation(creation._id, { _id: firstId });
    await releaseExpiredCheckoutSession(paidSession({ status: "expired" }));

    // Un autre acheteur verrouille la pièce, puis Stripe rejoue l'événement
    const secondId = new mongoose.Types.ObjectId();
    await Creation.updateOne(
      { _id: creation._id },
      { $set: { reserved: true, reservedContact: "autre@example.com", reservedByReservationId: secondId } }
    );
    const replay = await releaseExpiredCheckoutSession(paidSession({ status: "expired" }));

    expect(replay).toEqual({ cancelledCount: 0 });
    const lockedAgain = (await Creation.findById(creation._id))!;
    expect(lockedAgain.reserved).toBe(true);
    expect(lockedAgain.reservedByReservationId!.toString()).toBe(secondId.toString());
  });

  it("ne traite pas une réservation basculée entre-temps par un appel concurrent", async () => {
    const reservationId = new mongoose.Types.ObjectId();
    const creation = await lockedCreation(reservationId);
    await pendingReservation(creation._id, { _id: reservationId });
    vi.spyOn(Reservation, "findOneAndUpdate").mockResolvedValueOnce(null);

    const result = await releaseExpiredCheckoutSession(paidSession());

    expect(result.cancelledCount).toBe(0);
    expect((await Creation.findById(creation._id))!.reserved).toBe(true);
  });

  it("ne libère pas une pièce déjà vendue", async () => {
    const reservationId = new mongoose.Types.ObjectId();
    const creation = await lockedCreation(reservationId, { sold: true });
    await pendingReservation(creation._id, { _id: reservationId });
    await releaseExpiredCheckoutSession(paidSession());
    expect((await Creation.findById(creation._id))!.reserved).toBe(true);
  });

  it("ne touche pas aux réservations déjà payées (idempotence)", async () => {
    const creation = await createCreation({ sold: true });
    await pendingReservation(creation._id, { paymentStatus: "paid", status: "validated" });

    const result = await releaseExpiredCheckoutSession(paidSession());

    expect(result).toEqual({ cancelledCount: 0 });
    expect((await Reservation.findOne())!.status).toBe("validated");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("n'invalide pas le catalogue quand aucune pièce n'est liée", async () => {
    await pendingReservation(undefined);
    const result = await releaseExpiredCheckoutSession(paidSession());
    expect(result.cancelledCount).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
