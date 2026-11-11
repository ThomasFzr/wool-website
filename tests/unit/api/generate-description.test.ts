import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/generate-description/route";
import { generateProductDescription } from "@/lib/gemini";
import { makeRequest, readJson } from "../../helpers/http";
import { asAdmin, asAnonymous, asUser } from "../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));
vi.mock("@/lib/gemini", () => ({ generateProductDescription: vi.fn() }));

const generate = vi.mocked(generateProductDescription);
const post = (body: unknown) => POST(makeRequest("/api/generate-description", { method: "POST", body }));
const valid = { type: "bonnet", color: "Rose", material: "laine", price: 25 };

describe("POST /api/generate-description", () => {
  it("refuse un visiteur non connecté sans appeler Gemini", async () => {
    asAnonymous();
    expect((await post(valid)).status).toBe(401);
    expect(generate).not.toHaveBeenCalled();
  });

  it("refuse un utilisateur non admin", async () => {
    asUser();
    const { status, body } = await readJson(await post(valid));
    expect(status).toBe(401);
    expect(body.error).toBe("Non autorisé");
    expect(generate).not.toHaveBeenCalled();
  });

  it.each([
    ["type", { ...valid, type: "" }],
    ["color", { ...valid, color: undefined }],
    ["material", { ...valid, material: "" }],
    ["price", { ...valid, price: undefined }],
  ])("répond 400 si %s manque", async (_field, body) => {
    asAdmin();
    const res = await readJson(await post(body));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/requis/);
  });

  it("répond 400 sur un prix non numérique", async () => {
    asAdmin();
    const res = await readJson(await post({ ...valid, price: "gratuit" }));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nombre valide/);
  });

  it("génère la description et convertit un prix textuel", async () => {
    asAdmin();
    generate.mockResolvedValue("Un joli bonnet");
    const { status, body } = await readJson(await post({ ...valid, price: "19.5" }));
    expect(status).toBe(200);
    expect(body).toEqual({ description: "Un joli bonnet" });
    expect(generate).toHaveBeenCalledWith({ type: "bonnet", color: "Rose", material: "laine", price: 19.5 });
  });

  it("accepte un prix numérique, y compris 0", async () => {
    asAdmin();
    generate.mockResolvedValue("ok");
    expect((await post({ ...valid, price: 0 })).status).toBe(200);
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ price: 0 }));
  });

  it("renvoie le message d'erreur de Gemini en 500", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValue(new Error("Quota dépassé"));
    const { status, body } = await readJson(await post(valid));
    expect(status).toBe(500);
    expect(body.error).toBe("Quota dépassé");
  });

  it("renvoie un message générique pour une erreur non standard", async () => {
    asAdmin();
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValue("oups");
    const { status, body } = await readJson(await post(valid));
    expect(status).toBe(500);
    expect(body.error).toBe("Erreur lors de la génération de la description");
  });
});
