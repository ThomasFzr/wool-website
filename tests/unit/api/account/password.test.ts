import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "@/app/api/account/password/route";
import { connectToDatabase } from "@/lib/db";
import User from "@/models/User";
import { makeRequest, readJson } from "../../../helpers/http";
import { asAnonymous, asUser } from "../../../helpers/session";
import { PASSWORD_MESSAGES } from "@/lib/password-policy";
import { pwnedCount } from "@/lib/hibp";

vi.mock("next-auth", async (orig) => ({ ...(await orig<object>()), getServerSession: vi.fn() }));

const patch = (body: unknown) => PATCH(makeRequest("/api/account/password", { method: "PATCH", body }));
const valid = { currentPassword: "ancien1", newPassword: "nouveau1" };
const storedPassword = async (email = "client@example.com") =>
  (await User.findOne({ email }).select("+password"))!.password!;

describe("PATCH /api/account/password", () => {
  beforeEach(async () => {
    await connectToDatabase();
  });

  it("refuse un visiteur non connecté", async () => {
    asAnonymous();
    const { status, body } = await readJson(await patch(valid));
    expect(status).toBe(401);
    expect(body.error).toBe("Non authentifié");
  });

  it("exige l'ancien et le nouveau mot de passe", async () => {
    asUser();
    for (const body of [{ currentPassword: "ancien1" }, { newPassword: "nouveau1" }]) {
      const { status, body: res } = await readJson(await patch(body));
      expect(status).toBe(400);
      expect(res.error).toBe(PASSWORD_MESSAGES.required);
    }
  });

  it("refuse des mots de passe qui ne sont pas des chaînes", async () => {
    asUser();
    for (const body of [{ currentPassword: 123456, newPassword: "nouveau1" }, { ...valid, newPassword: 1234567 }]) {
      const { status, body: res } = await readJson(await patch(body));
      expect(status).toBe(400);
      expect(res.error).toBe(PASSWORD_MESSAGES.required);
    }
  });

  it("répond 404 si l'utilisateur n'existe plus", async () => {
    asUser("fantome@example.com");
    expect((await patch(valid)).status).toBe(404);
  });

  it("refuse un compte Google", async () => {
    await User.create({ email: "client@example.com", provider: "google" });
    asUser();
    const { status, body } = await readJson(await patch(valid));
    expect(status).toBe(400);
    expect(body.error).toMatch(/ce type de compte/);
  });

  it("refuse un compte credentials sans mot de passe enregistré", async () => {
    await User.create({ email: "client@example.com", provider: "credentials" });
    asUser();
    const { status, body } = await readJson(await patch(valid));
    expect(status).toBe(400);
    expect(body.error).toBe("Aucun mot de passe défini");
  });

  describe("avec un compte credentials", () => {
    beforeEach(async () => {
      await User.create({
        email: "client@example.com",
        provider: "credentials",
        password: await bcrypt.hash("ancien1", 4),
      });
      asUser();
    });

    it("refuse un mot de passe actuel incorrect", async () => {
      const { status, body } = await readJson(await patch({ ...valid, currentPassword: "mauvais" }));
      expect(status).toBe(400);
      expect(body.error).toBe("Mot de passe actuel incorrect");
      expect(await bcrypt.compare("ancien1", await storedPassword())).toBe(true);
    });

    it("refuse un nouveau mot de passe de moins de 8 caractères ou présent dans une fuite", async () => {
      for (const [newPassword, error] of [
        ["1234567", PASSWORD_MESSAGES.tooShort],
        ["motdepasse", PASSWORD_MESSAGES.pwned],
      ]) {
        const { status, body } = await readJson(await patch({ ...valid, newPassword }));
        expect(status).toBe(400);
        expect(body.error).toBe(error);
      }
      expect(await bcrypt.compare("ancien1", await storedPassword())).toBe(true);
    });

    it("n'interroge pas l'API des fuites si le mot de passe actuel est faux", async () => {
      await patch({ ...valid, currentPassword: "mauvais" });
      expect(pwnedCount).not.toHaveBeenCalled();
    });

    it("enregistre le nouveau mot de passe haché", async () => {
      const { status, body } = await readJson(await patch(valid));
      expect(status).toBe(200);
      expect(body.message).toBe("Mot de passe mis à jour");
      const stored = await storedPassword();
      expect(stored).not.toBe("nouveau1");
      expect(await bcrypt.compare("nouveau1", stored)).toBe(true);
      // Les autres sessions sont révoquées (callback jwt)
      const user = await User.findOne({ email: "client@example.com" });
      expect(user!.passwordChangedAt).toBeInstanceOf(Date);
    });

    it("ne modifie que le compte de la session", async () => {
      await User.create({
        email: "autre@example.com",
        provider: "credentials",
        password: await bcrypt.hash("ancien1", 4),
      });
      await patch(valid);
      expect(await bcrypt.compare("ancien1", await storedPassword("autre@example.com"))).toBe(true);
    });
  });

  it("répond 400 sur un corps qui n'est pas du JSON", async () => {
    asUser();
    const { status, body } = await readJson(await patch("{pas du json"));
    expect(status).toBe(400);
    expect(body.error).toBe("Le corps de la requête doit être un objet JSON.");
  });
});
