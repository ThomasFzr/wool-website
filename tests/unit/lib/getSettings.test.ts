import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings } from "@/lib/getSettings";
import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";

describe("getSettings", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("renvoie null quand aucun réglage n'existe", async () => {
    expect(await getSettings()).toBeNull();
  });

  it("renvoie les réglages en objet simple, avec les valeurs par défaut du schéma", async () => {
    await Settings.create({ title: "MailleMum", subtitle: "Fait main" });
    const settings = await getSettings();
    expect(settings).toMatchObject({
      title: "MailleMum",
      subtitle: "Fait main",
      shippingCost: 5,
      types: ["bonnet", "tour de cou", "bandeau"],
      pickupConditions: { enabled: false, minimumAmount: 0, allowedPostalCodes: [], message: "" },
    });
    expect(settings!.colors).toContain("Bleu marine");
    expect(settings).not.toHaveProperty("_id");
  });

  it("complète des conditions de retrait incomplètes et omet celles absentes", async () => {
    await Settings.collection.insertOne({ _id: "main" as any, pickupConditions: {} });
    expect((await getSettings())!.pickupConditions).toEqual({
      enabled: false,
      minimumAmount: 0,
      allowedPostalCodes: [],
      message: "",
    });

    await Settings.collection.deleteMany({});
    await Settings.collection.insertOne({ _id: "main" as any, title: "Sans retrait" });
    const settings = await getSettings();
    expect(settings!.title).toBe("Sans retrait");
    expect(settings!.pickupConditions).toBeUndefined();
  });

  it("renvoie null en cas d'erreur de base", async () => {
    vi.spyOn(Settings, "findOne").mockImplementation(() => {
      throw new Error("base indisponible");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await getSettings()).toBeNull();
    expect(error).toHaveBeenCalled();
  });
});
