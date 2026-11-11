import { beforeEach, describe, expect, it, vi } from "vitest";
import { revalidatePath } from "next/cache";
import { GET, POST } from "@/app/api/settings/route";
import { connectToDatabase } from "@/lib/db";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";
import Settings from "@/models/Settings";
import { makeRequest, readJson } from "../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const post = (body: unknown) => POST(makeRequest("/api/settings", { method: "POST", body }));

const DEFAULT_PICKUP = { enabled: false, minimumAmount: 0, allowedPostalCodes: [], message: "" };

beforeEach(async () => {
  await connectToDatabase();
});

describe("GET /api/settings", () => {
  it("renvoie les valeurs par défaut sans le prompt interne au visiteur", async () => {
    asAnonymous();
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body).toMatchObject({
      _id: "main",
      title: "Les créations de maman",
      types: ["bonnet", "tour de cou", "bandeau"],
      shippingCost: 5,
      pickupConditions: DEFAULT_PICKUP,
    });
    expect(body.colors).toContain("Bleu marine");
    expect(body).not.toHaveProperty("systemPrompt");
  });

  it("ajoute le prompt par défaut pour l'admin", async () => {
    asAdmin();
    const { body } = await readJson(await GET());
    expect(body.systemPrompt).toBe(DEFAULT_SYSTEM_PROMPT);
  });

  it("renvoie les réglages enregistrés et cache le prompt aux non-admins", async () => {
    await Settings.create({
      _id: "main",
      title: "Ma boutique",
      subtitle: "Sous-titre",
      colors: ["Vert"],
      types: ["écharpe"],
      shippingCost: 7,
      pickupConditions: { enabled: true, minimumAmount: 20, allowedPostalCodes: ["75001"], message: "Paris" },
      systemPrompt: "Prompt perso",
    });

    asUser();
    const pub = await readJson(await GET());
    expect(pub.body).toEqual({
      _id: "main",
      title: "Ma boutique",
      subtitle: "Sous-titre",
      colors: ["Vert"],
      types: ["écharpe"],
      shippingCost: 7,
      pickupConditions: { enabled: true, minimumAmount: 20, allowedPostalCodes: ["75001"], message: "Paris" },
    });

    asAdmin();
    expect((await readJson(await GET())).body.systemPrompt).toBe("Prompt perso");
  });

  it("complète un document incomplet avec les valeurs par défaut", async () => {
    await Settings.collection.insertOne({ _id: "main" } as any);
    asAdmin();
    const { body } = await readJson(await GET());
    expect(body).toMatchObject({
      title: "Les créations de maman",
      subtitle: "Clique sur une création pour voir toutes les photos.",
      types: ["bonnet", "tour de cou", "bandeau"],
      shippingCost: 5,
      pickupConditions: DEFAULT_PICKUP,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
    });
    expect(body.colors).toHaveLength(15);
  });

  it("renvoie les valeurs par défaut publiques si la base échoue", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Settings, "findById").mockImplementation(() => {
      throw new Error("boom");
    });
    const { status, body } = await readJson(await GET());
    expect(status).toBe(200);
    expect(body.title).toBe("Les créations de maman");
    expect(body).not.toHaveProperty("systemPrompt");
  });
});

describe("POST /api/settings", () => {
  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    expect((await post({ title: "x" })).status).toBe(401);
  });

  it("refuse un utilisateur non admin", async () => {
    asUser();
    expect((await post({ title: "x" })).status).toBe(401);
    expect(await Settings.countDocuments()).toBe(0);
  });

  it("enregistre les réglages et invalide la page d'accueil", async () => {
    asAdmin();
    const { status, body } = await readJson(
      await post({
        title: "Nouveau",
        subtitle: "Sous",
        colors: ["Rouge"],
        types: ["bonnet"],
        shippingCost: 4,
        systemPrompt: "P",
        pickupConditions: { enabled: true, minimumAmount: 15, allowedPostalCodes: ["69001"], message: "Lyon" },
      })
    );
    expect(status).toBe(200);
    expect(body).toMatchObject({ _id: "main", title: "Nouveau", shippingCost: 4, systemPrompt: "P" });
    const doc = (await Settings.findById("main").lean()) as any;
    expect(doc.pickupConditions).toEqual({
      enabled: true,
      minimumAmount: 15,
      allowedPostalCodes: ["69001"],
      message: "Lyon",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("complète des conditions de retrait partielles", async () => {
    asAdmin();
    await post({ title: "x", pickupConditions: {} });
    const doc = (await Settings.findById("main").lean()) as any;
    expect(doc.pickupConditions).toEqual(DEFAULT_PICKUP);
  });

  it("remet les conditions de retrait par défaut si elles sont absentes", async () => {
    await Settings.create({ _id: "main", pickupConditions: { enabled: true, minimumAmount: 50 } });
    asAdmin();
    await post({ title: "x" });
    const doc = (await Settings.findById("main").lean()) as any;
    expect(doc.pickupConditions).toEqual(DEFAULT_PICKUP);
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("{oops")).status).toBe(500);
  });
});
