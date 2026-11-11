import { expect, test } from "@playwright/test";
import { E2E_CLIENT, E2E_CREATIONS } from "./data";
import { login, resetDatabase } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await resetDatabase(request);
  await login(page, E2E_CLIENT, "/account");
  await expect(page).toHaveURL(/\/account$/);
});

test("la page compte affiche le profil", async ({ page }) => {
  await expect(page.getByText(E2E_CLIENT.profile.name).first()).toBeVisible();
  await expect(page.getByText(E2E_CLIENT.email).first()).toBeVisible();
});

test("« Mes commandes » liste la commande déjà payée", async ({ page }) => {
  await page.getByRole("link", { name: /Réservations/ }).click();
  await expect(page).toHaveURL(/\/account\/orders$/);
  await expect(page.getByRole("heading", { name: "Mes commandes" })).toBeVisible();
  await expect(page.getByText(E2E_CREATIONS.sold.title).first()).toBeVisible();
});
