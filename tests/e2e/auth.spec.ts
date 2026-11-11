import { expect, test } from "@playwright/test";
import { E2E_CLIENT } from "./data";
import { login, resetDatabase, submitLogin } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test("connexion par email puis retour vers le callbackUrl", async ({ page }) => {
  await login(page, E2E_CLIENT, "/account");
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Mon compte" })).toBeVisible();
});

test("une page protégée renvoie vers /login avec le callbackUrl", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Faccount|\/login\?callbackUrl=\/account/);

  await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
  await page.getByPlaceholder("Mot de passe").fill(E2E_CLIENT.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("mauvais mot de passe : message d'erreur, pas de connexion", async ({ page }) => {
  await submitLogin(page, { email: E2E_CLIENT.email, password: "pas-le-bon" });
  await expect(page.getByText("Connexion impossible.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("un utilisateur connecté qui revient sur /login est redirigé", async ({ page }) => {
  await login(page, E2E_CLIENT, "/account");
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login/);
});
