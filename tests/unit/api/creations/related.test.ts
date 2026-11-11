import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GET } from "@/app/api/creations/related/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { makeRequest, readJson } from "../../../helpers/http";
import { createCreation, insertRawCreation } from "../../../helpers/creations-fixtures";

const get = (ids?: string) =>
  GET(makeRequest(ids === undefined ? "/api/creations/related" : `/api/creations/related?ids=${ids}`));

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/creations/related", () => {
  it("renvoie une liste vide sans paramètre ids", async () => {
    const { status, body } = await readJson(await get());
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });

  it("ignore les identifiants mal formés", async () => {
    expect((await readJson(await get("abc, ,123"))).body).toEqual([]);
  });

  it("renvoie les articles liés disponibles, dédupliqués et hors panier", async () => {
    const dispo = await createCreation({ title: "Dispo", images: ["https://img/a.jpg"], imageUrl: "https://img/a.jpg" });
    const masque = await createCreation({ title: "Masqué", hidden: true });
    const vendu = await createCreation({ title: "Vendu", sold: true });
    const reserve = await createCreation({ title: "Réservé", reserved: true });
    const autre = await createCreation({ title: "Autre" });
    const panier2 = await createCreation({ title: "Panier 2", relatedCreations: [dispo._id, autre._id] });
    const panier1 = await createCreation({
      title: "Panier 1",
      relatedCreations: [dispo._id, masque._id, vendu._id, reserve._id, panier2._id],
    });

    const { body } = await readJson(await get(` ${panier1._id},${panier2._id}`));

    expect(body.map((r: any) => r.title).sort()).toEqual(["Autre", "Dispo"]);
    expect(body.find((r: any) => r.title === "Dispo")).toEqual({
      _id: dispo._id.toString(),
      title: "Dispo",
      price: 30,
      images: ["https://img/a.jpg"],
      imageUrl: "https://img/a.jpg",
      slug: dispo.slug,
      type: "bonnet",
      sold: false,
    });
  });

  it("limite le résultat à 4 articles", async () => {
    const liees = await Promise.all([1, 2, 3, 4, 5].map((n) => createCreation({ title: `Lié ${n}` })));
    const panier1 = await createCreation({ relatedCreations: liees.map((l) => l._id) });
    const panier2 = await createCreation({ relatedCreations: [liees[4]._id] });
    const { body } = await readJson(await get(`${panier1._id},${panier2._id}`));
    expect(body).toHaveLength(4);
  });

  it("tolère une création du panier sans champ relatedCreations", async () => {
    const id = await insertRawCreation({ title: "Ancien", price: 1, color: "Noir", type: "bonnet" });
    const { body } = await readJson(await get(id.toString()));
    expect(body).toEqual([]);
  });

  it("ignore les entrées vides parmi les articles liés", async () => {
    const lie = await createCreation({ title: "Lié" });
    vi.spyOn(Creation, "find").mockReturnValue({
      select: () => ({
        populate: () => ({
          lean: async () => [{ relatedCreations: [null, { title: "Sans id" }, lie.toObject()] }],
        }),
      }),
    } as any);
    const { body } = await readJson(await get(new mongoose.Types.ObjectId().toString()));
    expect(body.map((r: any) => r.title)).toEqual(["Lié"]);
  });

  it("renvoie une liste vide si la base échoue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "find").mockImplementation(() => {
      throw new Error("boom");
    });
    const { status, body } = await readJson(await get(new mongoose.Types.ObjectId().toString()));
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
