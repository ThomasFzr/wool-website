import { describe, expect, it, vi } from "vitest";
import {
  checkNewPassword,
  PASSWORD_MESSAGES,
  PASSWORD_MIN_LENGTH,
  passwordLength,
  passwordWarning,
  PASSWORD_WARNING_MESSAGES,
} from "@/lib/password-policy";
import { pwnedCount } from "@/lib/hibp";

describe("politique de mot de passe", () => {
  it("fixe le minimum à 8 caractères", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MESSAGES.tooShort).toBe("Le mot de passe doit contenir au moins 8 caractères.");
  });

  it("compte les caractères, pas les unités UTF-16", () => {
    expect(passwordLength("🧶🧶🧶🧶")).toBe(4);
    expect(passwordLength("élégant")).toBe(7);
  });

  it("exige une chaîne non vide", async () => {
    for (const password of [undefined, null, "", 12345678, ["motdepasse1"]]) {
      expect(await checkNewPassword(password)).toBe(PASSWORD_MESSAGES.required);
    }
  });

  it("refuse moins de 8 caractères sans interroger l'API des fuites", async () => {
    expect(await checkNewPassword("1234567")).toBe(PASSWORD_MESSAGES.tooShort);
    expect(await checkNewPassword("🧶🧶🧶🧶🧶🧶🧶")).toBe(PASSWORD_MESSAGES.tooShort);
    expect(pwnedCount).not.toHaveBeenCalled();
  });

  it("n'impose aucune règle de composition", async () => {
    for (const password of ["tricotdumercredi", "12345678901234", "        x", "🧶🧶🧶🧶🧶🧶🧶🧶"]) {
      expect(await checkNewPassword(password)).toBeNull();
    }
  });

  it("refuse un mot de passe présent dans une fuite connue", async () => {
    expect(await checkNewPassword("password123")).toBe(PASSWORD_MESSAGES.pwned);
    expect(pwnedCount).toHaveBeenCalledWith("password123");
  });

  it("accepte le mot de passe si l'API des fuites ne répond pas", async () => {
    vi.mocked(pwnedCount).mockResolvedValueOnce(null);
    expect(await checkNewPassword("password123")).toBeNull();
  });
});

describe("passwordWarning (mot de passe existant, à la connexion)", () => {
  it("signale un mot de passe de moins de 8 caractères sans interroger l'API", async () => {
    expect(await passwordWarning("ancien1")).toBe("short");
    expect(pwnedCount).not.toHaveBeenCalled();
  });

  it("signale un mot de passe présent dans une fuite", async () => {
    expect(await passwordWarning("password123")).toBe("pwned");
  });

  it("ne signale rien pour un mot de passe sain, ni si l'API ne répond pas", async () => {
    expect(await passwordWarning("tricot du mercredi")).toBeNull();
    vi.mocked(pwnedCount).mockResolvedValueOnce(null);
    expect(await passwordWarning("password123")).toBeNull();
  });

  it("a un message pour chaque cas", () => {
    expect(PASSWORD_WARNING_MESSAGES.short).toMatch(/moins de 8 caractères/);
    expect(PASSWORD_WARNING_MESSAGES.pwned).toMatch(/fuites de données/);
  });
});
