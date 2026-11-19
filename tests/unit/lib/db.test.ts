import { describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const g = global as any;

async function load() {
  vi.resetModules();
  return (await import("@/lib/db")).connectToDatabase;
}

describe("connectToDatabase", () => {
  it("refuse de se charger sans MONGODB_URI", async () => {
    vi.stubEnv("MONGODB_URI", "");
    await expect(load()).rejects.toThrow("Missing MONGODB_URI");
  });

  it("n'emprisonne pas une connexion échouée dans le cache et permet de réessayer", async () => {
    const connectToDatabase = await load();
    const connect = vi.spyOn(mongoose, "connect").mockRejectedValueOnce(new Error("réseau coupé"));

    await expect(connectToDatabase()).rejects.toThrow("réseau coupé");
    expect(g.mongoose.promise).toBeNull();
    expect(g.mongoose.conn).toBeNull();

    // Nouvelle tentative : une vraie connexion est relancée
    const conn = await connectToDatabase();
    expect(conn).toBe(mongoose);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it("réutilise la connexion en cache, y compris après rechargement du module", async () => {
    const connectToDatabase = await load();
    const connect = vi.spyOn(mongoose, "connect");
    const conn = await connectToDatabase();
    expect(conn).toBe(mongoose);
    expect(connect).not.toHaveBeenCalled();
  });

  it("partage une même tentative entre appels concurrents", async () => {
    g.mongoose = undefined;
    await mongoose.disconnect();
    const connectToDatabase = await load();
    const connect = vi.spyOn(mongoose, "connect");
    const [a, b] = await Promise.all([connectToDatabase(), connectToDatabase()]);
    expect(a).toBe(b);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(mongoose.connection.readyState).toBe(1);
  });
});

describe("sanitizeFilter (anti injection d'opérateur, A03)", () => {
  it("est activé dès le chargement de lib/db", async () => {
    await load();
    expect(mongoose.get("sanitizeFilter")).toBe(true);
  });

  it("neutralise un opérateur injecté et laisse passer ceux marqués mongoose.trusted()", async () => {
    const connectToDatabase = await load();
    await connectToDatabase();
    const Sample =
      mongoose.models.SanitizeSample ??
      mongoose.model("SanitizeSample", new mongoose.Schema({ email: String, hidden: Boolean }));
    await Sample.create([{ email: "a@exemple.fr" }, { email: "b@exemple.fr", hidden: true }]);

    // Saisie malveillante : `{ "$ne": null }` matcherait le premier document sans sanitizeFilter
    const injected = JSON.parse('{"$ne": null}');
    await expect(Sample.findOne({ email: injected })).rejects.toThrow(/Cast to string failed/);
    await expect(Sample.find({ $where: "true" })).rejects.toThrow(/not allowed with sanitizeFilter/);

    // Opérateur écrit volontairement dans le code
    const visible = await Sample.find({ hidden: mongoose.trusted({ $ne: true }) });
    expect(visible.map((d) => d.email)).toEqual(["a@exemple.fr"]);
  });
});
