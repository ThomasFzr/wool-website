import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/account/preferences/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const patch = (body: unknown) =>
  PATCH(makeRequest("/api/account/preferences", { method: "PATCH", body }));

describe("PATCH /api/account/preferences", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    expect((await patch({ emailNotifications: false })).status).toBe(401);
  });

  it("refuse une valeur non booléenne", async () => {
    asUser();
    const { status, body } = await readJson(await patch({ emailNotifications: "non" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/booléen/);
  });

  it("répond 404 si l'utilisateur n'existe plus", async () => {
    asUser("fantome@example.com");
    expect((await patch({ emailNotifications: false })).status).toBe(404);
  });

  it("met à jour la préférence", async () => {
    await User.create({ email: "client@example.com", provider: "credentials" });
    asUser();
    const { status, body } = await readJson(await patch({ emailNotifications: false }));
    expect(status).toBe(200);
    expect(body.preferences.emailNotifications).toBe(false);
    expect((await User.findOne({ email: "client@example.com" }))!.emailNotifications).toBe(false);
  });

  it("n'écrit rien quand le champ est absent", async () => {
    await User.create({ email: "client@example.com", provider: "credentials" });
    asUser();
    const { body } = await readJson(await patch({}));
    expect(body.preferences.emailNotifications).toBe(true);
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    asUser();
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await patch("{pas du json")).status).toBe(500);
  });
});
