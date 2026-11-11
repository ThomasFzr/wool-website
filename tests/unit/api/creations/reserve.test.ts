import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { POST } from "@/app/api/creations/[id]/reserve/route";
import { connectToDatabase } from "@/lib/db";
import { sendEmail } from "@/lib/sendEmail";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import User from "@/models/User";
import { makeRequest, readJson, routeParams } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";
import { createCreation } from "../../../helpers/stripe-fake";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/sendEmail", () => ({ sendEmail: vi.fn() }));

const USER_ID = new mongoose.Types.ObjectId().toString();

const reserve = (id: unknown, body: unknown = { name: "Alice", message: "Pour Noël" }) =>
  POST(makeRequest(`/api/creations/${id}/reserve`, { method: "POST", body }), routeParams({ id: String(id) }));

const emailTo = (to: string) => vi.mocked(sendEmail).mock.calls.filter(([a]) => a.to === to).map(([a]) => a);

describe("POST /api/creations/[id]/reserve", () => {
  beforeEach(async () => {
    await connectToDatabase();
    vi.mocked(sendEmail).mockResolvedValue({ data: { id: "email" }, error: null } as any);
    vi.stubEnv("SELLER_EMAIL", "vendeuse@example.com");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://maillemum.example");
    asUser("client@example.com", { id: USER_ID });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("contrôles", () => {
    it("refuse un visiteur non connecté", async () => {
      asAnonymous();
      const creation = await createCreation();
      expect((await reserve(creation._id)).status).toBe(401);
      expect((await Creation.findById(creation._id))!.reserved).toBe(false);
    });

    it("répond 404 pour une création inexistante", async () => {
      const res = await reserve(new mongoose.Types.ObjectId());
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("Création introuvable");
    });

    it("répond 500 pour un identifiant mal formé", async () => {
      // Pas de validation de l'id : l'erreur de cast Mongoose finit en 500 plutôt qu'en 400/404
      expect((await reserve("pas-un-id")).status).toBe(500);
    });

    it("refuse une pièce unique déjà réservée", async () => {
      const creation = await createCreation({ reserved: true, reservedContact: "autre@example.com" });
      const res = await reserve(creation._id);
      expect(res.status).toBe(409);
      expect(await res.text()).toBe("Déjà réservé");
      expect((await Creation.findById(creation._id))!.reservedContact).toBe("autre@example.com");
      expect(await Reservation.countDocuments()).toBe(0);
    });

    it("refuse une pièce déjà vendue", async () => {
      const creation = await createCreation({ sold: true });
      expect((await reserve(creation._id)).status).toBe(409);
    });

    it("n'accorde la pièce qu'à un seul de deux clients simultanés", async () => {
      const creation = await createCreation();
      const statuses = await Promise.all([reserve(creation._id), reserve(creation._id)]).then((r) =>
        r.map((x) => x.status).sort()
      );
      expect(statuses).toEqual([201, 409]);
      expect(await Reservation.countDocuments()).toBe(1);
    });

    it("répond 500 sur un corps JSON invalide", async () => {
      const creation = await createCreation();
      expect((await reserve(creation._id, "{pas du json")).status).toBe(500);
      expect((await Creation.findById(creation._id))!.reserved).toBe(false);
    });
  });

  describe("réservation", () => {
    it("réserve la pièce et crée la réservation au nom de la session", async () => {
      const creation = await createCreation();

      const { status, body } = await readJson(
        await reserve(creation._id, { name: "Alice", message: "Pour Noël", contact: "pirate@example.com" })
      );

      expect(status).toBe(201);
      expect(body).toMatchObject({
        creationId: creation._id.toString(),
        userId: USER_ID,
        name: "Alice",
        contact: "client@example.com",
        message: "Pour Noël",
        status: "preparing",
      });
      const reserved = (await Creation.findById(creation._id))!;
      expect(reserved.reserved).toBe(true);
      expect(reserved.reservedName).toBe("Alice");
      // L'adresse fournie par le client est ignorée au profit de celle de la session
      expect(reserved.reservedContact).toBe("client@example.com");
      expect(reserved.reservedMessage).toBe("Pour Noël");
      expect(reserved.reservedAt).toBeInstanceOf(Date);
      expect(revalidatePath).toHaveBeenCalledWith("/");
      expect(emailTo("pirate@example.com")).toHaveLength(0);
    });

    it("tronque le nom et le message, et ignore les valeurs non textuelles", async () => {
      const creation = await createCreation();
      await reserve(creation._id, { name: "a".repeat(150), message: "b".repeat(1500) });
      const reservation = (await Reservation.findOne())!;
      expect(reservation.name).toHaveLength(100);
      expect(reservation.message).toHaveLength(1000);

      const other = await createCreation({ title: "Autre" });
      const { body } = await readJson(await reserve(other._id, { name: 42, message: { x: 1 } }));
      expect(body.name).toBe("");
      expect(body.message).toBe("");
    });

    it("libère la pièce quand la réservation ne peut pas être enregistrée", async () => {
      asUser("client@example.com", { id: "pas-un-object-id" });
      const creation = await createCreation();

      expect((await reserve(creation._id)).status).toBe(500);

      const released = (await Creation.findById(creation._id))!;
      expect(released.reserved).toBe(false);
      expect(released.reservedContact).toBeUndefined();
      expect(released.reservedMessage).toBeUndefined();
      expect(sendEmail).not.toHaveBeenCalled();
    });
  });

  describe("emails", () => {
    it("envoie la confirmation à l'acheteur et le détail à la vendeuse", async () => {
      const creation = await createCreation();
      await reserve(creation._id);

      const [buyer] = emailTo("client@example.com");
      expect(buyer.subject).toBe("✅ Votre réservation chez MailleMum est enregistrée");
      expect(buyer.html).toContain("Bonjour <strong>Alice</strong>");
      expect(buyer.html).toContain('<img src="https://img.example.com/bonnet.jpg"');
      expect(buyer.html).toContain("Couleur : <strong>Rose</strong>");
      expect(buyer.html).toContain("Prix : <strong>40 €</strong>");
      expect(buyer.html).toContain("Votre message :<br/>Pour Noël");
      expect(buyer.html).toContain("https://maillemum.example/account/orders");

      const [seller] = emailTo("vendeuse@example.com");
      expect(seller.subject).toBe("🧶 Nouvelle réservation : Bonnet Mérinos");
      expect(seller.html).toContain("<strong>Alice</strong> (client@example.com) a réservé");
      expect(seller.html).toContain("Message de l'acheteur :<br/>Pour Noël");
      expect(seller.html).toContain(`https://maillemum.example/admin/reservations?creationId=${creation._id}`);
      expect(seller.html).toContain("Réservation créée le :");
    });

    it("gère une fiche sans image principale, sans couleur, sans prix et sans message", async () => {
      const { insertedId } = await Creation.collection.insertOne({
        title: "Ancienne",
        imageUrl: "https://img.example.com/legacy.jpg",
        images: [],
        price: null,
      });
      await reserve(insertedId, {});

      const [buyer] = emailTo("client@example.com");
      expect(buyer.html).toContain("👋");
      expect(buyer.html).toContain('<img src="https://img.example.com/legacy.jpg"');
      expect(buyer.html).toContain("Prix sur demande");
      expect(buyer.html).not.toContain("Couleur");
      expect(buyer.html).not.toContain("Votre message");
      const [seller] = emailTo("vendeuse@example.com");
      expect(seller.html).not.toContain("Couleur");
      expect(seller.html).not.toContain("Message de l'acheteur");
    });

    it("n'insère aucune image quand la fiche n'en a pas", async () => {
      const { insertedId } = await Creation.collection.insertOne({ title: "Nue", price: 10, color: "Bleu" });
      await reserve(insertedId);
      expect(emailTo("client@example.com")[0].html).not.toContain("<img src=\"https://img");
      expect(emailTo("vendeuse@example.com")[0].html).not.toContain("<img src=\"https://img");
    });

    it("échappe le nom et le message de l'acheteur", async () => {
      const creation = await createCreation({ title: "<i>Bonnet</i>" });
      await reserve(creation._id, { name: "<b>Alice</b>", message: "<script>alert(1)</script>" });
      for (const { html } of vi.mocked(sendEmail).mock.calls.map(([a]) => a)) {
        expect(html).not.toContain("<script>");
        expect(html).not.toContain("<b>Alice</b>");
        expect(html).toContain("&lt;i&gt;Bonnet&lt;/i&gt;");
      }
    });

    it("respecte la désactivation des notifications de l'acheteur", async () => {
      await User.create({ email: "client@example.com", emailNotifications: false });
      const creation = await createCreation();
      await reserve(creation._id);
      expect(emailTo("client@example.com")).toHaveLength(0);
      expect(emailTo("vendeuse@example.com")).toHaveLength(1);
    });

    it("prévient l'acheteur qui a gardé les notifications", async () => {
      await User.create({ email: "client@example.com", emailNotifications: true });
      const creation = await createCreation();
      await reserve(creation._id);
      expect(emailTo("client@example.com")).toHaveLength(1);
    });

    it("n'écrit pas à la vendeuse quand SELLER_EMAIL n'est pas configuré", async () => {
      vi.stubEnv("SELLER_EMAIL", "");
      const creation = await createCreation();
      await reserve(creation._id);
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("confirme la réservation même si l'envoi des emails échoue", async () => {
      vi.mocked(sendEmail).mockRejectedValue(new Error("Resend indisponible"));
      const creation = await createCreation();
      expect((await reserve(creation._id)).status).toBe(201);
      expect(console.error).toHaveBeenCalledWith("[reserve] Email non envoyé:", expect.any(Error));
    });
  });
});
