import crypto from "crypto";
import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/auth/reset-password/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";
import { PASSWORD_MESSAGES } from "@/lib/password-policy";

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

  it("refuse un mot de passe de moins de 8 caractères ou présent dans une fuite, sans consommer le lien", async () => {
    await createUserWithToken();
    for (const [password, error] of [
      ["1234567", PASSWORD_MESSAGES.tooShort],
      ["azertyuiop", PASSWORD_MESSAGES.pwned],
    ]) {
      const { status, body } = await readJson(await post({ token: TOKEN, password }));
      expect(status).toBe(400);
      expect(body.error).toBe(error);
    }
    expect((await findUser())!.resetToken).toBe(hash(TOKEN));
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
    // Le lien reçu par email prouve l'adresse : le mot de passe survivra à une liaison Google
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    // Les sessions ouvertes avant la réinitialisation sont révoquées (callback jwt)
    expect(user!.passwordChangedAt).toBeInstanceOf(Date);

    // Le token ne sert qu'une fois
    expect((await post({ token: TOKEN, password: "autre123" })).status).toBe(400);
  });

  it("garde la date de preuve d'email déjà connue", async () => {
    await createUserWithToken();
    const verifiedAt = new Date("2026-01-01");
    await User.updateOne({ email: "client@example.com" }, { emailVerifiedAt: verifiedAt });
    expect((await post({ token: TOKEN, password: "nouveau1" })).status).toBe(200);
    expect((await findUser())!.emailVerifiedAt).toEqual(verifiedAt);
  });

  it("refuse un token ou un mot de passe qui n'est pas une chaîne", async () => {
    await createUserWithToken();
    for (const body of [{ token: 123, password: "nouveau1" }, { token: TOKEN, password: 1234567 }]) {
      const { status, body: res } = await readJson(await post(body));
      expect(status).toBe(400);
      expect(res.error).toBe("Token et mot de passe requis");
    }
  });

  it("répond 500 sur un corps JSON invalide", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { status, body } = await readJson(await post("{pas du json"));
    expect(status).toBe(500);
    expect(body.error).toBe("Erreur lors de la réinitialisation du mot de passe");
  });
});
