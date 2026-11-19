import type { SignInResponse } from "next-auth/react";

export type SignInOutcome =
  | { ok: true }
  | { ok: false; reason: "csrf" | "credentials" | "failed" };

/**
 * Interprète la réponse de `signIn("credentials", { redirect: false })`.
 *
 * next-auth 4 ne signale pas tous les échecs dans `error` : quand le jeton CSRF est refusé,
 * il répond 200 avec `error: null` et une URL `…/api/auth/signin?csrf=true`, sans créer de
 * session. Se fier au seul `error` fait donc croire à une connexion réussie. On exige ici une
 * réponse `ok`, sans `error`, et une URL de retour sans `csrf=` ni `error=`.
 *
 * Une issue `ok: true` ne garantit pas encore la session : l'appelant doit la relire
 * (`getSession()`) avant d'annoncer la connexion.
 */
export function signInOutcome(res: SignInResponse | undefined): SignInOutcome {
  if (!res) return { ok: false, reason: "failed" };
  if (res.error) return { ok: false, reason: "credentials" };
  if (!res.ok || !res.url) return { ok: false, reason: "failed" };

  let params: URLSearchParams;
  try {
    params = new URL(res.url, "http://localhost").searchParams;
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (params.has("csrf")) return { ok: false, reason: "csrf" };
  if (params.has("error")) return { ok: false, reason: "credentials" };
  return { ok: true };
}

/** Message affiché sous le formulaire de connexion pour chaque échec. */
export const SIGN_IN_MESSAGES: Record<Exclude<SignInOutcome, { ok: true }>["reason"], string> = {
  credentials: "Connexion impossible.",
  csrf: "La connexion n'a pas abouti (jeton de sécurité expiré). Veuillez réessayer.",
  failed: "La connexion n'a pas abouti. Veuillez réessayer.",
};
