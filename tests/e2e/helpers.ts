import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_STRIPE_URL } from "./data";

/** Remet la base dans son état initial (via le serveur e2e). */
export async function resetDatabase(request: APIRequestContext) {
  const res = await request.post(`${E2E_STRIPE_URL}/__e2e/reset`);
  expect(res.ok()).toBeTruthy();
}

/** Sessions Checkout créées sur le faux Stripe (dernière en premier). */
export async function fakeStripeSessions(request: APIRequestContext) {
  const res = await request.get(`${E2E_STRIPE_URL}/__e2e/sessions`);
  return (await res.json()) as any[];
}

/**
 * Attend que la page de connexion ait fini de charger, appels /api/auth/session compris,
 * comme un humain qui attend l'affichage avant de taper.
 *
 * Sans cette attente, un robot qui soumet le formulaire pendant ces appels peut voir son
 * jeton CSRF refusé : next-auth pose un cookie CSRF par requête sans cookie, et en dev le
 * mode strict de React lance deux chargements de session simultanés (voir
 * docs/anomalies/2026-11-login-csrf.md). L'état « networkidle » (aucune requête pendant
 * 500 ms, websocket de rechargement à chaud exclu) correspond à la fin de ces appels.
 */
export async function waitForLoginPageReady(page: Page) {
  await expect(page).toHaveURL(/\/login/);
  await page.waitForLoadState("networkidle");
}

/** Remplit et envoie le formulaire de /login. */
export async function submitLogin(
  page: Page,
  user: { email: string; password: string },
  callbackUrl?: string
) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
  await waitForLoginPageReady(page);
  await page.getByPlaceholder("Email").fill(user.email);
  await page.getByPlaceholder("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

/** Connexion email + mot de passe, attend d'avoir quitté /login. */
export async function login(
  page: Page,
  user: { email: string; password: string },
  callbackUrl?: string
) {
  await submitLogin(page, user, callbackUrl);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}
