import crypto from "crypto";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/reset-password/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";

const post = (body: unknown) => POST(makeRequest("/api/auth/reset-password", { method: "POST", body }));
const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const TOKEN = "a".repeat(64);

async function createUserWithToken(expiry = new Date(Date.now() + 3600000)) {
  await User.create({
    email: "client@example.com",
    password: await bcrypt.hash("ancien1", 4),
    resetToken: hash(TOKEN),
    resetTokenExpiry: expiry,
  });
}
const findUser = () =>
  User.findOne({ email: "client@example.com" }).select("+password +resetToken +resetTokenExpiry");

describe("POST /api/auth/reset-password", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("exige token et mot de passe", async () => {
    for (const body of [{}, { token: TOKEN }, { password: "nouveau1" }]) {
      const { status, body: res } = await readJson(await post(body));
      expect(status).toBe(400);
      expect(res.error).toBe("Token et mot de passe requis");
    }
  });

  it("refuse un mot de passe de moins de 6 caractères", async () => {
    const { status, body } = await readJson(await post({ token: TOKEN, password: "12345" }));
    expect(status).toBe(400);
    expect(body.error).toMatch(/6 caractères/);
  });

  it("refuse un token inconnu", async () => {
    await createUserWithToken();
    const { status, body } = await readJson(await post({ token: "b".repeat(64), password: "nouveau1" }));
    expect(status).toBe(400);
    expect(body.error).toBe("Token invalide ou expiré");
  });

  it("refuse le hash stocké présenté comme token", async () => {
    await createUserWithToken();
    expect((await post({ token: hash(TOKEN), password: "nouveau1" })).status).toBe(400);
  });

  it("refuse un token expiré", async () => {
    await createUserWithToken(new Date(Date.now() - 1000));
    const { status } = await readJson(await post({ token: TOKEN, password: "nouveau1" }));
    expect(status).toBe(400);
    expect(await bcrypt.compare("ancien1", (await findUser())!.password!)).toBe(true);
  });

  it("change le mot de passe et invalide le token", async () => {
    await createUserWithToken();
    const { status, body } = await readJson(await post({ token: TOKEN, password: "nouveau1" }));
    expect(status).toBe(200);
    expect(body.message).toBe("Mot de passe réinitialisé avec succès");

    const user = await findUser();
    expect(await bcrypt.compare("nouveau1", user!.password!)).toBe(true);
    expect(user!.resetToken).toBeNull();
    expect(user!.resetTokenExpiry).toBeNull();

    // Le token ne sert qu'une fois
    expect((await post({ token: TOKEN, password: "autre123" })).status).toBe(400);
  });

  it("répond 500 sur un token qui n'est pas une chaîne", async () => {
    // Pas de validation de type : crypto.update lève une erreur, convertie en 500 (et non 400).
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await readJson(await post({ token: 123, password: "nouveau1" }));
    expect(status).toBe(500);
    expect(body.error).toBe("Erreur lors de la réinitialisation du mot de passe");
  });
});
