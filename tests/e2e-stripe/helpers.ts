import { expect, type APIRequestContext, type Page } from "@playwright/test";
import Stripe from "stripe";
import { STRIPE_E2E_CONTROL_URL, TEST_CARDS } from "./data";
import { readStripeTestKey } from "./stripe-key";

export { login } from "../e2e/helpers";

/** Client Stripe du compte de TEST (remboursements, expirations, vérifications). */
export const stripe = new Stripe(readStripeTestKey(), { apiVersion: "2025-11-17.clover" });

export async function resetDatabase(request: APIRequestContext) {
  const res = await request.post(`${STRIPE_E2E_CONTROL_URL}/__e2e/reset`);
  expect(res.ok()).toBeTruthy();
}

export async function dbReservations(request: APIRequestContext): Promise<any[]> {
  return (await request.get(`${STRIPE_E2E_CONTROL_URL}/__e2e/reservations`)).json();
}

export async function dbCreation(request: APIRequestContext, slug: string): Promise<any> {
  const all = (await (await request.get(`${STRIPE_E2E_CONTROL_URL}/__e2e/creations`)).json()) as any[];
  return all.find((c) => c.slug === slug);
}

export async function updateSettings(request: APIRequestContext, patch: Record<string, unknown>) {
  const res = await request.post(`${STRIPE_E2E_CONTROL_URL}/__e2e/settings`, { data: patch });
  expect(res.ok()).toBeTruthy();
}

/** Attend qu'une condition sur la base soit vraie (les webhooks arrivent en différé). */
export async function waitForDb<T>(read: () => Promise<T>, check: (value: T) => boolean, timeout = 30_000) {
  let last: T | undefined;
  await expect
    .poll(async () => check((last = await read())), { timeout, intervals: [500, 1000, 2000] })
    .toBe(true);
  return last as T;
}

/** Erreurs de la console du navigateur liées à la CSP ou à l'hydratation. */
export function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    // En dev seulement, Vercel Analytics charge script.debug.js depuis va.vercel-scripts.com ;
    // en prod il sert /_vercel/insights/script.js depuis le site, autorisé par la CSP.
    if (text.includes("va.vercel-scripts.com/v1/script.debug.js")) return;
    if (/Content Security Policy|Refused to|Hydration|hydrat/i.test(text)) problems.push(text);
  });
  return problems;
}

export async function addToCart(page: Page, slug: string) {
  await page.goto(`/creations/${slug}`);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByRole("button", { name: /Ajouté|Déjà dans le panier/ })).toBeVisible();
}

/** Depuis le panier : choisit le mode de remise puis part sur Stripe Checkout. */
export async function goToStripe(page: Page, mode: "shipping" | "pickup" = "shipping") {
  await page.goto("/cart");
  await page.getByText(mode === "pickup" ? "Remise en main propre" : "Livraison", { exact: true }).first().click();
  await page.getByRole("button", { name: "Procéder au paiement" }).click();
  await page.waitForURL(/checkout\.stripe\.com/);
}

async function fillIfVisible(page: Page, selector: string, value: string) {
  const field = page.locator(selector);
  if (await field.isVisible().catch(() => false)) await field.fill(value);
}

/** Remplit la vraie page Stripe Checkout (mode test) et valide le paiement. */
export async function payOnStripe(
  page: Page,
  { card = TEST_CARDS.success, shipping = true }: { card?: string; shipping?: boolean } = {}
) {
  await page.locator("#cardNumber").waitFor();
  if (shipping) {
    await fillIfVisible(page, "#shippingName", "Camille Client");
    const country = page.locator("#shippingCountry");
    if (await country.isVisible().catch(() => false)) await country.selectOption("FR");
    await fillIfVisible(page, "#shippingAddressLine1", "12 rue des Lilas");
    // L'autocomplétion d'adresse peut ouvrir une liste : on la referme
    await page.keyboard.press("Escape");
    await fillIfVisible(page, "#shippingPostalCode", "75011");
    await fillIfVisible(page, "#shippingLocality", "Paris");
  }
  await page.locator("#cardNumber").fill(card);
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await fillIfVisible(page, "#billingName", "Camille Client");
  // Pas d'inscription à Link (case parfois cochée par défaut)
  const link = page.locator("#enableStripePass");
  if (await link.isChecked().catch(() => false)) await link.uncheck();
  await page.getByTestId("hosted-payment-submit-button").click();
}

/** Valide le défi 3D Secure de la carte de test 4000 0025 0000 3155. */
export async function complete3DSecure(page: Page) {
  // La page de test 3DS de Stripe est imbriquée dans plusieurs iframes : on cherche
  // son bouton « Complete » dans toutes les frames jusqu'à ce qu'il apparaisse.
  await expect(async () => {
    for (const frame of page.frames()) {
      const button = frame.getByRole("button", { name: /^\s*complete/i });
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        return;
      }
    }
    throw new Error("Défi 3D Secure pas encore affiché");
  }).toPass({ timeout: 30_000 });
}
