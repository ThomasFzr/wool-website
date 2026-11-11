import { beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { GET } from "@/app/api/creations/availability/route";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { makeRequest, readJson } from "../../../helpers/http";
import { createCreation } from "../../../helpers/stripe-fake";

const check = (query: string) => GET(makeRequest(`/api/creations/availability${query}`));

describe("GET /api/creations/availability", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("renvoie une liste vide sans paramètre", async () => {
    const { status, body } = await readJson(await check(""));
    expect(status).toBe(200);
    expect(body).toEqual({ available: [] });
  });

  it("ignore les identifiants mal formés", async () => {
    const { body } = await readJson(await check("?ids=abc,,123"));
    expect(body).toEqual({ available: [] });
  });

  it("ne garde que les pièces encore achetables", async () => {
    const free = await createCreation({ title: "Libre" });
    const reserved = await createCreation({ title: "En cours de paiement", reserved: true });
    const sold = await createCreation({ title: "Vendue", sold: true });
    const hidden = await createCreation({ title: "Cachée", hidden: true });
    const deleted = new mongoose.Types.ObjectId();

    const ids = [free, reserved, sold, hidden].map((c) => c._id.toString()).concat(deleted.toString());
    const { body } = await readJson(await check(`?ids=${ids.join(" , ")},pas-un-id`));

    // Une pièce réservée reste dans le panier : c'est peut-être l'acheteur lui-même qui paie
    expect(body.available.sort()).toEqual([free._id.toString(), reserved._id.toString()].sort());
  });

  it("renvoie null (indéterminé) en cas d'erreur, pour ne rien purger", async () => {
    const creation = await createCreation();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Creation, "find").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const { status, body } = await readJson(await check(`?ids=${creation._id}`));
    expect(status).toBe(200);
    expect(body).toEqual({ available: null });
  });
});
