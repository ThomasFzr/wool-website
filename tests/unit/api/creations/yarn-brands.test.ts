import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/creations/yarn-brands/route";
import { connectToDatabase } from "@/lib/db";
import YarnBrand from "@/models/YarnBrand";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../../helpers/session";
import { createCreation, insertRawCreation } from "../../../helpers/creations-fixtures";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const get = () => GET(makeRequest("/api/creations/yarn-brands"));

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/creations/yarn-brands", () => {
  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    expect((await get()).status).toBe(401);
  });

  it("refuse un utilisateur non admin", async () => {
    asUser();
    expect((await get()).status).toBe(401);
  });

  it("fusionne les marques enregistrées et celles des créations, triées", async () => {
    await YarnBrand.create({ brand: " Phildar ", pricePerHundredGrams: 4.5 });
    await YarnBrand.create({ brand: "Bergère de France", pricePerHundredGrams: 6 });
    await createCreation({ yarnBrand: "phildar" }); // doublon (casse différente) ignoré
    await createCreation({ yarnBrand: " Drops " });
    await createCreation({ yarnBrand: "   " }); // marque blanche ignorée
    await createCreation({ yarnBrand: "" });
    await createCreation();
    await insertRawCreation({ title: "x", price: 1, color: "x", type: "x", yarnBrand: 42 }); // valeur non textuelle ignorée
    asAdmin();

    const { status, body } = await readJson(await get());

    expect(status).toBe(200);
    expect(body).toEqual([
      { brand: "Bergère de France", price: 6 },
      { brand: "Drops" },
      { brand: "Phildar", price: 4.5 },
    ]);
  });

  it("répond 500 si la base échoue", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(YarnBrand, "find").mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("DB error");
  });
});
