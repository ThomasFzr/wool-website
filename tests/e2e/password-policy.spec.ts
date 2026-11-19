import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_CLIENT } from "./data";
import { login, resetDatabase, resetLinkFor, setHibp } from "./helpers";

// Politique de mot de passe (docs/SECURITY.md, A07) : 8 caractères minimum, aucune règle de
// composition, refus des mots de passe présents dans une fuite (faux Have I Been Pwned,
// tests/e2e/server/fake-hibp.ts), acceptés si l'API ne répond pas.

const PWNED_MESSAGE = /Ce mot de passe apparaît dans des fuites de données connues/;

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

async function openRegister(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Pas encore de compte ? Créer un compte" }).click();
  await page.getByPlaceholder("Email").fill("nouveau@maillemum.test");
}

test.describe("inscription", () => {
  test("moins de 8 caractères : bloqué par le formulaire", async ({ page }) => {
    await openRegister(page);
    const password = page.getByPlaceholder("Mot de passe");
    await expect(password).toHaveAttribute("minlength", "8");
    await password.fill("abcdefg");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await password.evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);
  });

  test("mot de passe compromis : refusé avec un message clair, aucun compte créé", async ({ page }) => {
    await openRegister(page);
    await page.getByPlaceholder("Mot de passe").fill("password123");
    const registered = page.waitForResponse((r) => r.url().includes("/api/register"));
    await page.getByRole("button", { name: "Créer le compte" }).click();
    expect((await registered).status()).toBe(400);
    await expect(page.getByText(PWNED_MESSAGE)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("sans règle de composition : une phrase en minuscules est acceptée", async ({ page }) => {
    await openRegister(page);
    await page.getByPlaceholder("Mot de passe").fill("tricot du mercredi soir");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  });

  test("API des fuites en panne : l'inscription n'est pas bloquée", async ({ page, request }) => {
    await setHibp(request, { down: true });
    await openRegister(page);
    // Compromis, mais l'API ne répond pas : accepté
    await page.getByPlaceholder("Mot de passe").fill("password123");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  });
});

test("réinitialisation : un mot de passe compromis est refusé, le lien reste utilisable", async ({ page }) => {
  const since = new Date().toISOString();
  await page.goto("/forgot-password");
  await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await page.goto(await resetLinkFor(E2E_CLIENT.email, since));

  const fill = async (password: string) => {
    await page.getByPlaceholder("Nouveau mot de passe").fill(password);
    await page.getByPlaceholder("Confirmer le mot de passe").fill(password);
    await page.getByRole("button", { name: /Réinitialiser|Valider|Enregistrer|Changer/ }).click();
  };
  await fill("azertyuiop");
  await expect(page.getByText(PWNED_MESSAGE)).toBeVisible();

  await fill("Nouveau-pass-456");
  await expect(page.getByText(/réinitialisé avec succès/)).toBeVisible();
});

test("changement depuis le compte : un mot de passe compromis est refusé", async ({ page }) => {
  await login(page, E2E_CLIENT, "/account");
  await page.getByRole("button", { name: /Mot de passe/ }).click();
  const fields = page.locator('input[type="password"]');
  await fields.nth(0).fill(E2E_CLIENT.password);
  await fields.nth(1).fill("motdepasse");
  await fields.nth(2).fill("motdepasse");
  await page.getByRole("button", { name: /Changer|Mettre à jour|Enregistrer/ }).click();
  await expect(page.getByText(PWNED_MESSAGE)).toBeVisible();
});

test("admin : un mot de passe compromis est refusé pour un utilisateur", async ({ page }) => {
  await login(page, E2E_ADMIN, "/admin/users");
  const row = page.locator("div", { hasText: E2E_CLIENT.email }).filter({ has: page.getByRole("button", { name: /Modifier/ }) }).last();
  await row.getByRole("button", { name: /Modifier/ }).click();
  await page.getByPlaceholder("••••••••").fill("password123");
  await page.getByRole("button", { name: /Mettre à jour/ }).click();
  await expect(page.getByText(PWNED_MESSAGE)).toBeVisible();
});
