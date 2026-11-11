import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { GET, POST } from "@/app/api/admin/reservations/route";
import { GET as countReservations } from "@/app/api/admin/reservations/count/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { makeRequest, readJson } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import {
  createCreation,
  createReservation,
  createUser,
  expectAdminOnly,
  failSession,
} from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const list = (query = "") => GET(makeRequest(`/api/admin/reservations${query}`));
const create = (body: unknown) => POST(makeRequest("/api/admin/reservations", { method: "POST", body }));
const unknownId = () => new mongoose.Types.ObjectId().toString();

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/admin/reservations", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => list());
  });

  it("ne montre que les commandes payées ou manuelles, les plus récentes d'abord", async () => {
    const creation = await createCreation({ title: "Gilet" });
    await createReservation({ name: "Payée", stripeCheckoutSessionId: "cs_1", paymentStatus: "paid", creationId: creation._id, createdAt: new Date("2024-01-02") });
    await createReservation({ name: "Manuelle", createdAt: new Date("2024-01-01") });
    await createReservation({ name: "Manuelle null", stripeCheckoutSessionId: null, createdAt: new Date("2024-01-03") });
    await createReservation({ name: "Abandonnée", stripeCheckoutSessionId: "cs_2", paymentStatus: "pending" });
    asAdmin();

    const { status, body } = await readJson(await list());
    expect(status).toBe(200);
    expect(body.reservations.map((r: any) => r.name)).toEqual(["Manuelle null", "Payée", "Manuelle"]);
    expect(body.reservations[1].creationId.title).toBe("Gilet");
    expect(body).toMatchObject({ page: 1, total: 3, totalPages: 1 });
  });

  it("pagine les résultats", async () => {
    for (let i = 0; i < 5; i++) {
      await createReservation({ name: `R${i}`, createdAt: new Date(2024, 0, i + 1) });
    }
    asAdmin();

    const { body } = await readJson(await list("?page=2&limit=2"));
    expect(body.reservations.map((r: any) => r.name)).toEqual(["R2", "R1"]);
    expect(body).toMatchObject({ page: 2, total: 5, totalPages: 3 });
  });

  it("filtre par statut, création et recherche textuelle", async () => {
    const creation = await createCreation();
    await createReservation({ name: "Cible", status: "shipped", creationId: creation._id, message: "taille (M)" });
    await createReservation({ name: "Autre statut", status: "pending", creationId: creation._id, message: "taille (M)" });
    await createReservation({ name: "Autre création", status: "shipped", message: "taille (M)" });
    await createReservation({ name: "Autre texte", status: "shipped", creationId: creation._id, message: "taille L" });
    asAdmin();

    const query = `?status=shipped&creationId=${creation.id}&search=${encodeURIComponent("(m)")}`;
    const { body } = await readJson(await list(query));
    expect(body.reservations.map((r: any) => r.name)).toEqual(["Cible"]);
  });

  it("recherche aussi dans le nom et le contact, sans tenir compte de la casse", async () => {
    await createReservation({ name: "Martine", contact: "m@example.com" });
    await createReservation({ name: "Zoé", contact: "zoe@exemple.fr" });
    await createReservation({ name: "Paul", contact: "paul@example.com" });
    asAdmin();

    const byName = await readJson(await list("?search=MARTINE"));
    expect(byName.body.reservations.map((r: any) => r.name)).toEqual(["Martine"]);
    const byContact = await readJson(await list("?search=exemple.fr"));
    expect(byContact.body.reservations.map((r: any) => r.name)).toEqual(["Zoé"]);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    const { status, body } = await readJson(await list());
    expect(status).toBe(500);
    expect(body.error).toBe("Server error");
  });
});

describe("POST /api/admin/reservations", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => create({}));
  });

  it("exige un utilisateur", async () => {
    asAdmin();
    const { status, body } = await readJson(await create({ creationIds: [unknownId()] }));
    expect(status).toBe(400);
    expect(body.error).toBe("L'utilisateur est requis");
  });

  it.each([[undefined], ["un-id"], [[]]])("exige au moins une création (%j)", async (creationIds) => {
    asAdmin();
    const { status, body } = await readJson(await create({ userId: unknownId(), creationIds }));
    expect(status).toBe(400);
    expect(body.error).toBe("Au moins une création est requise");
  });

  it("répond 404 si l'utilisateur n'existe pas", async () => {
    const creation = await createCreation();
    asAdmin();
    const { status, body } = await readJson(await create({ userId: unknownId(), creationIds: [creation.id] }));
    expect(status).toBe(404);
    expect(body.error).toBe("Utilisateur introuvable");
  });

  it("répond 404 si une des créations n'existe pas", async () => {
    const user = await createUser();
    const creation = await createCreation();
    asAdmin();
    const { status, body } = await readJson(
      await create({ userId: user.id, creationIds: [creation.id, unknownId()] })
    );
    expect(status).toBe(404);
    expect(body.error).toBe("Certaines créations n'existent pas");
    expect(await Reservation.countDocuments()).toBe(0);
  });

  it("crée une commande payée groupée et marque les créations vendues", async () => {
    const user = await createUser({ name: "Claire" });
    const neuve = await createCreation({ title: "Neuve" });
    const dejaVendue = await createCreation({ title: "Déjà vendue", sold: true, salesCount: 3 });
    asAdmin();

    const { status, body } = await readJson(
      await create({ userId: user.id, creationIds: [neuve.id, dejaVendue.id], message: "Remise en main propre" })
    );
    expect(status).toBe(201);
    expect(body.message).toBe("2 réservation(s) créée(s) avec succès");

    const reservations = await Reservation.find().lean<any[]>();
    expect(reservations).toHaveLength(2);
    const sessionIds = new Set(reservations.map((r) => r.stripeCheckoutSessionId));
    expect(sessionIds.size).toBe(1);
    expect([...sessionIds][0]).toMatch(/^admin_\d+_[a-z0-9]+$/);
    for (const r of reservations) {
      expect(r).toMatchObject({
        userId: user._id,
        name: "Claire",
        contact: "client@example.com",
        userEmail: "client@example.com",
        message: "Remise en main propre",
        status: "preparing",
        paymentStatus: "paid",
        seenByAdmin: true,
      });
      expect(r.paidAt).toBeInstanceOf(Date);
    }

    const neuveApres = await Creation.findById(neuve._id).lean<any>();
    expect(neuveApres).toMatchObject({ sold: true, reserved: true, reservedName: "Claire", salesCount: 1 });
    const neuveReservation = reservations.find((r) => String(r.creationId) === neuve.id)!;
    expect(String(neuveApres.reservedByReservationId)).toBe(String(neuveReservation._id));
    // salesCount n'est pas réincrémenté pour une création déjà vendue
    expect((await Creation.findById(dejaVendue._id).lean<any>()).salesCount).toBe(3);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("utilise le nom, le contact et le statut fournis", async () => {
    const user = await createUser({ name: "Claire" });
    const creation = await createCreation();
    asAdmin();

    await create({
      userId: user.id,
      creationIds: [creation.id],
      name: "Nom saisi",
      contact: "06 00 00 00 00",
      status: "validated",
    });
    const reservation = await Reservation.findOne().lean<any>();
    expect(reservation).toMatchObject({ name: "Nom saisi", contact: "06 00 00 00 00", status: "validated", message: "" });
    expect((await Creation.findById(creation._id).lean<any>()).reservedMessage).toBe("");
  });

  it("se rabat sur l'email quand l'utilisateur n'a pas de nom", async () => {
    const user = await createUser();
    const creation = await createCreation();
    asAdmin();

    await create({ userId: user.id, creationIds: [creation.id] });
    expect((await Reservation.findOne().lean<any>()).name).toBe("client@example.com");
  });

  it("répond 500 pour un identifiant utilisateur invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await readJson(await create({ userId: "pas-un-id", creationIds: ["x"] }));
    expect(status).toBe(500);
    expect(body.error).toBe("Erreur serveur");
  });
});

describe("GET /api/admin/reservations/count", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => countReservations());
  });

  it("compte les commandes (sessions distinctes) nouvelles et à traiter", async () => {
    // Commande A : 2 articles payés non vus, en préparation
    await createReservation({ stripeCheckoutSessionId: "A", paymentStatus: "paid", status: "preparing" });
    await createReservation({ stripeCheckoutSessionId: "A", paymentStatus: "paid", status: "preparing" });
    // Commande B : vue, en attente
    await createReservation({ stripeCheckoutSessionId: "B", paymentStatus: "paid", status: "pending", seenByAdmin: true });
    // Commande C : non vue, expédiée
    await createReservation({ stripeCheckoutSessionId: "C", paymentStatus: "paid", status: "shipped" });
    // Non payée : ignorée
    await createReservation({ stripeCheckoutSessionId: "D", paymentStatus: "pending", status: "pending" });
    // Payée sans session : ignorée
    await createReservation({ paymentStatus: "paid", status: "pending" });
    asAdmin();

    const { status, body } = await readJson(await countReservations());
    expect(status).toBe(200);
    expect(body).toEqual({ new: 2, pending: 2 });
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await countReservations()).status).toBe(500);
  });
});
