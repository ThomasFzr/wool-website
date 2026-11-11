import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/account/reservations/route";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import { makeRequest, readJson } from "../../../../helpers/http";
import { asAnonymous, asUser } from "../../../../helpers/session";
import { createCreation, createReservation } from "../../../../helpers/account-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const get = async (query = "") => readJson(await GET(makeRequest(`/api/account/reservations${query}`)));

/** Crée des réservations à des dates croissantes (la dernière est la plus récente). */
async function createSeries(items: Record<string, unknown>[]) {
  const base = Date.now() - items.length * 1000;
  for (const [i, item] of items.entries()) {
    const r = await createReservation(item);
    await Reservation.collection.updateOne({ _id: r._id }, { $set: { createdAt: new Date(base + i * 1000) } });
  }
}

describe("GET /api/account/reservations", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    const { status, body } = await get();
    expect(status).toBe(401);
    expect(body.error).toBe("Non authentifié");
  });

  it("ne renvoie que les commandes payées de l'utilisateur, les plus récentes d'abord", async () => {
    await createSeries([
      { message: "ancienne" },
      { message: "autre client", contact: "autre@example.com" },
      { message: "non payée", paymentStatus: "pending" },
      { message: "récente" },
    ]);
    asUser();
    const { status, body } = await get();
    expect(status).toBe(200);
    expect(body.reservations.map((r: any) => r.message)).toEqual(["récente", "ancienne"]);
    expect(body).toMatchObject({ page: 1, total: 2, totalPages: 1 });
  });

  it("pagine selon page et limit", async () => {
    await createSeries([1, 2, 3, 4, 5].map((i) => ({ message: `c${i}` })));
    asUser();
    const { body } = await get("?page=2&limit=2");
    expect(body.reservations.map((r: any) => r.message)).toEqual(["c3", "c2"]);
    expect(body).toMatchObject({ page: 2, total: 5, totalPages: 3 });
  });

  it("filtre par statut", async () => {
    await createSeries([{ message: "a", status: "shipped" }, { message: "b", status: "pending" }]);
    asUser();
    const { body } = await get("?status=shipped");
    expect(body.reservations.map((r: any) => r.message)).toEqual(["a"]);
  });

  it("cherche dans le nom et le message sans tenir compte de la casse", async () => {
    await createSeries([
      { name: "Marie", message: "x" },
      { name: "Paul", message: "Pour MARIE" },
      { name: "Jean", message: "rien" },
    ]);
    asUser();
    const { body } = await get("?search=marie");
    expect(body.reservations.map((r: any) => r.name)).toEqual(["Paul", "Marie"]);
  });

  it("traite la recherche comme du texte littéral (pas de regex)", async () => {
    await createSeries([{ message: "a.b" }, { message: "axb" }]);
    asUser();
    const { body } = await get(`?search=${encodeURIComponent("a.b")}`);
    expect(body.reservations.map((r: any) => r.message)).toEqual(["a.b"]);
  });

  it("joint la création avec ses champs publics uniquement", async () => {
    const creation = await createCreation({ yarnBrand: "Secret", yarnPrice: 3, imageUrl: "/img.jpg" });
    await createReservation({ creationId: creation._id });
    asUser();
    const { body } = await get();
    const joined = body.reservations[0].creationId;
    expect(joined).toMatchObject({ title: "Bonnet", price: 30, color: "Rouge", imageUrl: "/img.jpg" });
    expect(joined).not.toHaveProperty("yarnBrand");
    expect(joined).not.toHaveProperty("yarnPrice");
  });

  it("renvoie une liste vide sans commande", async () => {
    asUser();
    const { body } = await get();
    expect(body).toEqual({ reservations: [], page: 1, total: 0, totalPages: 0 });
  });

  it("ramène page et limit invalides aux valeurs par défaut", async () => {
    await createSeries([1, 2, 3].map((i) => ({ message: `c${i}` })));
    asUser();
    for (const query of ["?page=-1&limit=0", "?page=abc&limit=abc", "?page=1.5&limit=-3"]) {
      const { status, body } = await get(query);
      expect(status).toBe(200);
      expect(body).toMatchObject({ page: 1, total: 3, totalPages: 1 });
      expect(body.reservations).toHaveLength(3);
    }
  });

  it("borne limit à 100", async () => {
    await createSeries([{ message: "a" }]);
    asUser();
    const { body } = await get("?limit=100000");
    expect(body).toMatchObject({ total: 1, totalPages: 1 });
  });

  it("répond 500 si la base échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Reservation, "countDocuments").mockRejectedValueOnce(new Error("db down"));
    asUser();
    const { status, body } = await get();
    expect(status).toBe(500);
    expect(body.error).toBe("Server error");
  });
});
