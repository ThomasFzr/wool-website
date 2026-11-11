import { afterAll, describe, expect, it, vi } from "vitest";
import type { MongoClient } from "mongodb";

const g = global as any;
const clients: MongoClient[] = [];

// Renvoie le module (et non son export par défaut) : une fonction async qui renverrait
// directement la promesse du client l'attendrait implicitement.
async function load() {
  vi.resetModules();
  return import("@/lib/mongodb");
}

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
});

describe("clientPromise (lib/mongodb)", () => {
  it("refuse de se charger sans MONGODB_URI", async () => {
    vi.stubEnv("MONGODB_URI", "");
    await expect(load()).rejects.toThrow("Missing MONGODB_URI");
  });

  it("vide le cache après un échec de connexion pour permettre une nouvelle tentative", async () => {
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200");
    const { default: promise } = await load();
    await expect(promise).rejects.toThrow(/ECONNREFUSED/);
    expect(g._mongoClientPromise).toBeNull();
  });

  it("se connecte à la base et partage le client entre rechargements du module", async () => {
    const { default: promise } = await load();
    const client = await promise;
    clients.push(client);
    expect(await client.db().command({ ping: 1 })).toMatchObject({ ok: 1 });

    const { default: again } = await load();
    expect(again).toBe(promise);
  });
});
