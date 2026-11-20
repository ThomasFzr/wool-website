import { expect, test } from "@playwright/test";
import { E2E_CLIENT, E2E_CREATIONS } from "./data";
import { login, loginAsAdmin, resetDatabase } from "./helpers";

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test("un client n'a pas accès à l'admin", async ({ page }) => {
  await login(page, E2E_CLIENT, "/");
  await expect(page).toHaveURL(/localhost:3100\/$/);
  await page.goto("/admin/reservations");
  await expect(page).not.toHaveURL(/\/admin/);
});

test.describe("admin connecté", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page, "/admin/reservations");
    await expect(page).toHaveURL(/\/admin\/reservations$/);
  });

  test("marque une commande comme expédiée avec un numéro de suivi", async ({ page }) => {
    await page.getByText(E2E_CLIENT.profile.name).first().click();

    page.once("dialog", (dialog) => dialog.accept("6A123456789"));
    const patched = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && !!r.request().postData()?.includes("\"status\"")
    );
    await page.getByRole("button", { name: /Marquer comme expédiée/ }).click();
    const res = await patched;
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ status: "shipped", trackingNumber: "6A123456789" });

    await page.goto("/admin/reservations");
    await page.locator("select").first().selectOption("shipped");
    await expect(page.getByText(E2E_CLIENT.email)).toBeVisible();
    await page.locator("select").first().selectOption("preparing");
    await expect(page.getByText(E2E_CLIENT.email)).toHaveCount(0);
  });

  test("annule une commande avec une raison", async ({ page }) => {
    await page.getByText(E2E_CLIENT.profile.name).first().click();
    await page.getByRole("button", { name: "❌ Annuler" }).click();
    await page.getByPlaceholder("Raison de l'annulation (optionnel)...").fill("Rupture de laine");
    const patched = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && !!r.request().postData()?.includes("\"status\"")
    );
    await page.getByRole("button", { name: "Confirmer l'annulation" }).click();
    expect(await (await patched).json()).toMatchObject({
      status: "cancelled",
      cancelReason: "Rupture de laine",
      cancelledBy: "admin",
    });

    await page.goto("/admin/reservations");
    await page.locator("select").first().selectOption("cancelled");
    await expect(page.getByText(E2E_CLIENT.email)).toBeVisible();
  });

  test("les pages de gestion s'affichent", async ({ page }) => {
    await page.goto("/admin/creations");
    await expect(page.getByText(E2E_CREATIONS.hidden.title).first()).toBeVisible();
    await page.goto("/admin/users");
    await expect(page.getByText(E2E_CLIENT.email).first()).toBeVisible();
  });
});

test.describe("formulaire de création (admin)", () => {
  test("un double clic sur « Créer » n'enregistre la création qu'une fois", async ({ page }) => {
    // Un double envoi créait deux créations aux images partagées : supprimer l'une
    // effaçait la photo de l'autre (ANO-2026-11-03).
    await loginAsAdmin(page, "/admin/creations");
    await expect(page).toHaveURL(/\/admin\/creations$/);

    let posts = 0;
    await page.route("**/api/creations", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      // Réponse lente : le second clic arrive pendant l'enregistrement
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    // La duplication pré-remplit les champs obligatoires
    await page.getByTitle("Dupliquer").first().click();
    await page.getByRole("button", { name: /Créer$/ }).dblclick();

    await expect(page.getByText("Création ajoutée ✔️")).toBeVisible();
    expect(posts).toBe(1);
  });
});
