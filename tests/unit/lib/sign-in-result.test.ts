import { describe, expect, it } from "vitest";
import { SIGN_IN_MESSAGES, signInOutcome } from "@/lib/sign-in-result";

const base = { error: null, status: 200, ok: true };

describe("signInOutcome", () => {
  it("accepte une connexion réussie (URL de retour sans csrf ni error)", () => {
    expect(signInOutcome({ ...base, url: "http://localhost:3000/login?callbackUrl=%2F" })).toEqual({ ok: true });
  });

  it("accepte une URL relative", () => {
    expect(signInOutcome({ ...base, url: "/account" })).toEqual({ ok: true });
  });

  it("refuse un jeton CSRF rejeté, que next-auth renvoie avec error: null et ok: true", () => {
    expect(signInOutcome({ ...base, url: "http://localhost:3000/api/auth/signin?csrf=true" })).toEqual({
      ok: false,
      reason: "csrf",
    });
  });

  it("refuse une URL de retour qui porte une erreur", () => {
    expect(signInOutcome({ ...base, url: "http://localhost:3000/login?error=CredentialsSignin" })).toEqual({
      ok: false,
      reason: "credentials",
    });
  });

  it("refuse des identifiants incorrects signalés dans error", () => {
    expect(signInOutcome({ error: "CredentialsSignin", status: 401, ok: false, url: null })).toEqual({
      ok: false,
      reason: "credentials",
    });
  });

  it.each([
    ["pas de réponse", undefined],
    ["réponse non ok sans erreur", { ...base, ok: false, status: 500, url: "http://localhost:3000/" }],
    ["réponse sans URL", { ...base, url: null }],
    ["URL illisible", { ...base, url: "http://[" }],
  ])("refuse sans annoncer de succès : %s", (_label, res) => {
    expect(signInOutcome(res)).toEqual({ ok: false, reason: "failed" });
  });

  it("a un message pour chaque échec, neutre pour les identifiants", () => {
    expect(SIGN_IN_MESSAGES.credentials).toBe(
      "Connexion impossible : vérifiez vos identifiants ou réessayez dans quelques minutes."
    );
    expect(SIGN_IN_MESSAGES.csrf).toMatch(/réessayer/);
    expect(SIGN_IN_MESSAGES.failed).toMatch(/réessayer/);
  });
});
