import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GET as listBrandsFromCreations } from "@/app/api/admin/yarn-brands/route";
import { DELETE, GET, POST } from "@/app/api/admin/yarn-brands/manage/route";
import { connectToDatabase } from "@/lib/db";
import YarnBrand from "@/models/YarnBrand";
import { makeRequest, readJson } from "../../../../helpers/http";
import { asAdmin } from "../../../../helpers/session";
import { createCreation, expectAdminOnly, failSession } from "../../../../helpers/admin-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const post = (body: unknown) =>
  POST(makeRequest("/api/admin/yarn-brands/manage", { method: "POST", body }));
const del = (query: string) =>
  DELETE(makeRequest(`/api/admin/yarn-brands/manage${query}`, { method: "DELETE" }));

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/admin/yarn-brands", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => listBrandsFromCreations());
  });

  it("agrège les marques des créations avec le prix moyen au kilo, triées par nom", async () => {
    await createCreation({ yarnBrand: "Phildar ", yarnPrice: 4 });
    await createCreation({ yarnBrand: "Phildar", yarnPrice: 6 });
    await createCreation({ yarnBrand: "Bergère de France", yarnPrice: 3 });
    await createCreation({ yarnBrand: "   ", yarnPrice: 9 }); // marque vide ignorée
    await createCreation({ yarnBrand: "Sans prix" }); // pas de prix : exclue
    await createCreation({ yarnPrice: 2 }); // pas de marque : exclue
    asAdmin();

    const { status, body } = await readJson(await listBrandsFromCreations());
    expect(status).toBe(200);
    expect(body).toEqual([
      { brand: "Bergère de France", pricePerKg: 30, count: 1 },
      { brand: "Phildar", pricePerKg: 50, count: 2 },
    ]);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await listBrandsFromCreations()).status).toBe(500);
  });
});

describe("GET /api/admin/yarn-brands/manage", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => GET());
  });

  it("fusionne les marques enregistrées et celles des créations, sans doublon de casse", async () => {
    const katia = await YarnBrand.create({ brand: "Katia", pricePerHundredGrams: 5 });
    await createCreation({ yarnBrand: "katia", yarnPrice: 99 }); // déjà enregistrée : ignorée
    await createCreation({ yarnBrand: " Drops ", yarnPrice: 2 });
    await createCreation({ yarnBrand: "drops", yarnPrice: 7 }); // doublon : le premier gagne
    await createCreation({ yarnBrand: " ", yarnPrice: 1 }); // marque vide ignorée
    asAdmin();

    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body).toEqual([
      { brand: "Drops", pricePerHundredGrams: 2, fromCreations: true },
      { _id: katia.id, brand: "Katia", pricePerHundredGrams: 5 },
    ]);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await GET()).status).toBe(500);
  });
});

describe("POST /api/admin/yarn-brands/manage", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => post({}));
  });

  it.each([
    [{ pricePerHundredGrams: 3 }],
    [{ brand: "Katia" }],
    [{ brand: "Katia", pricePerHundredGrams: 0 }],
  ])("refuse une marque ou un prix manquant (%j)", async (body) => {
    asAdmin();
    const res = await readJson(await post(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Marque et prix requis");
  });

  it("crée une nouvelle marque avec un nom nettoyé", async () => {
    asAdmin();
    const { status, body } = await readJson(await post({ brand: "  Katia  ", pricePerHundredGrams: 4.5 }));
    expect(status).toBe(200);
    expect(body).toMatchObject({ brand: "Katia", pricePerHundredGrams: 4.5 });
    expect(await YarnBrand.countDocuments({ brand: "Katia" })).toBe(1);
  });

  it("met à jour le prix d'une marque existante", async () => {
    await YarnBrand.create({ brand: "Katia", pricePerHundredGrams: 4 });
    asAdmin();
    const { body } = await readJson(await post({ brand: "Katia ", pricePerHundredGrams: 6 }));
    expect(body.pricePerHundredGrams).toBe(6);
    expect(await YarnBrand.countDocuments()).toBe(1);
    expect((await YarnBrand.findOne({ brand: "Katia" }))!.pricePerHundredGrams).toBe(6);
  });

  it("répond 400 sur un corps qui n'est pas du JSON", async () => {
    asAdmin();
    expect((await post("{pas du json")).status).toBe(400);
  });
});

describe("DELETE /api/admin/yarn-brands/manage", () => {
  it("est réservé aux admins", async () => {
    await expectAdminOnly(() => del(`?id=${new mongoose.Types.ObjectId()}`));
  });

  it.each(["", "?id=pas-un-id"])("refuse un identifiant absent ou invalide (%s)", async (query) => {
    asAdmin();
    const { status, body } = await readJson(await del(query));
    expect(status).toBe(400);
    expect(body).toEqual({ error: "Identifiant invalide.", champ: "id" });
  });

  it("répond 404 pour une marque inexistante", async () => {
    asAdmin();
    expect((await del(`?id=${new mongoose.Types.ObjectId()}`)).status).toBe(404);
  });

  it("supprime la marque", async () => {
    const brand = await YarnBrand.create({ brand: "Katia", pricePerHundredGrams: 4 });
    asAdmin();
    const { status, body } = await readJson(await del(`?id=${brand.id}`));
    expect(status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(await YarnBrand.countDocuments()).toBe(0);
  });

  it("répond 500 en cas d'erreur", async () => {
    failSession();
    expect((await del("?id=x")).status).toBe(500);
  });
});
