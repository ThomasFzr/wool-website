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

/** Remplit et envoie le formulaire de /login. */
export async function submitLogin(
  page: Page,
  user: { email: string; password: string },
  callbackUrl?: string
) {
  await page.goto(callbackUrl ? `/login?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/login");
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
