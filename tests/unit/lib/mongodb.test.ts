import { afterAll, describe, expect, it, vi } from "vitest";
import type { MongoClient } from "mongodb";

const g = global as any;
const clients: MongoClient[] = [];

async function load() {
  vi.resetModules();
  return (await import("@/lib/mongodb")).getClientPromise;
}

afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
});

describe("getClientPromise (lib/mongodb)", () => {
  it("refuse de se connecter sans MONGODB_URI", async () => {
    vi.stubEnv("MONGODB_URI", "");
    const getClientPromise = await load();
    expect(() => getClientPromise()).toThrow("Missing MONGODB_URI");
  });

  it("vide le cache après un échec de connexion et retente à l'appel suivant", async () => {
    const realUri = process.env.MONGODB_URI!;
    vi.stubEnv("MONGODB_URI", "mongodb://127.0.0.1:1/?serverSelectionTimeoutMS=200");
    const getClientPromise = await load();
    await expect(getClientPromise()).rejects.toThrow(/ECONNREFUSED/);
    expect(g._mongoClientPromise).toBeNull();

    // Même module chargé (cas de l'adaptateur NextAuth) : la base revient, l'appel suivant réussit
    vi.stubEnv("MONGODB_URI", realUri);
    const client = await getClientPromise();
    clients.push(client);
    expect(await client.db().command({ ping: 1 })).toMatchObject({ ok: 1 });
    g._mongoClientPromise = null;
  });

  it("se connecte à la base et partage le client entre appels et rechargements du module", async () => {
    const getClientPromise = await load();
    const promise = getClientPromise();
    const client = await promise;
    clients.push(client);
    expect(await client.db().command({ ping: 1 })).toMatchObject({ ok: 1 });

    expect(getClientPromise()).toBe(promise);
    expect((await load())()).toBe(promise);
  });
});
