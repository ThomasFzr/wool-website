import { expect, test } from "@playwright/test";
import { E2E_CLIENT, E2E_CREATIONS, E2E_LEGACY_CLIENT } from "./data";
import { login, resetDatabase, setHibp } from "./helpers";

// Mots de passe existants (docs/SECURITY.md, A07) : jamais invalidés. Trop court ou
// compromis, la connexion passe et un bandeau invite à le changer.

const banner = (page: import("@playwright/test").Page) =>
  page.getByRole("status").filter({ hasText: "Changer mon mot de passe" });

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test("mot de passe de moins de 8 caractères : connexion acceptée, bandeau, disparu après changement", async ({ page }) => {
  await login(page, E2E_LEGACY_CLIENT, "/account");
  await expect(page).toHaveURL(/\/account$/);
  await expect(banner(page)).toContainText("Votre mot de passe fait moins de 8 caractères.");
  await expect(banner(page).getByRole("link", { name: "Changer mon mot de passe" })).toHaveAttribute("href", "/account");

  await page.getByRole("button", { name: /Mot de passe/ }).click();
  const fields = page.locator('input[type="password"]');
  await fields.nth(0).fill(E2E_LEGACY_CLIENT.password);
  await fields.nth(1).fill("Pelote-de-laine-2026");
  await fields.nth(2).fill("Pelote-de-laine-2026");
  await page.getByRole("button", { name: /Changer le mot de passe/ }).click();
  await expect(page.getByText("Mot de passe mis à jour ✔️")).toBeVisible();

  // Reconnecté avec le nouveau mot de passe : plus d'alerte, y compris après rechargement
  await expect(banner(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(banner(page)).toHaveCount(0);
});

test("mot de passe présent dans une fuite : connexion acceptée, bandeau, « Plus tard » le masque", async ({ page, request }) => {
  await setHibp(request, { pwned: [E2E_CLIENT.password] });
  await login(page, E2E_CLIENT, "/");
  await expect(banner(page)).toContainText("Votre mot de passe apparaît dans des fuites de données connues.");

  await banner(page).getByRole("button", { name: "Plus tard" }).click();
  await expect(banner(page)).toHaveCount(0);
});

test("mot de passe sain : aucun bandeau", async ({ page }) => {
  await login(page, E2E_CLIENT, "/account");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  // Session chargée côté client (sinon l'absence de bandeau ne prouverait rien)
  await page.waitForLoadState("networkidle");
  await expect(banner(page)).toHaveCount(0);
});

test("API des fuites en panne : la connexion passe, sans bandeau", async ({ page, request }) => {
  await setHibp(request, { pwned: [E2E_CLIENT.password], down: true });
  await login(page, E2E_CLIENT, "/account");
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(banner(page)).toHaveCount(0);
});

test("le bandeau ne gêne pas le paiement : le bouton du panier reste cliquable", async ({ page }) => {
  await login(page, E2E_LEGACY_CLIENT, `/creations/${E2E_CREATIONS.rose.slug}`);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByRole("button", { name: /Ajouté|Déjà dans le panier/ })).toBeVisible();
  await page.goto("/cart");
  await expect(banner(page)).toBeVisible();
  await page.getByText("Livraison", { exact: false }).first().click();
  // Un clic intercepté par le bandeau ferait échouer l'action (Playwright vérifie la cible)
  await page.getByRole("button", { name: "Procéder au paiement" }).click();
  await expect(page).toHaveURL(/localhost:3101\/pay\//);
});
