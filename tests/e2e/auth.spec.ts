import { expect, test } from "@playwright/test";
import { E2E_ADMIN, E2E_CLIENT, E2E_CREATIONS, E2E_LEGACY_CLIENT, LOGIN_FAILED } from "./data";
import { login, loginAsAdmin, resetDatabase, submitLogin, waitForLoginPageReady } from "./helpers";

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
  await waitForLoginPageReady(page);

  await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
  await page.getByPlaceholder("Mot de passe").fill(E2E_CLIENT.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("mauvais mot de passe : message d'erreur, pas de connexion", async ({ page }) => {
  await submitLogin(page, { email: E2E_CLIENT.email, password: "pas-le-bon" });
  await expect(page.getByText(LOGIN_FAILED)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("admin : le bon mot de passe est refusé (Google uniquement), message neutre, aucune session", async ({ page, context }) => {
  await submitLogin(page, E2E_ADMIN, "/admin");
  await expect(page.getByText(LOGIN_FAILED)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).map((c) => c.name)).not.toContain("next-auth.session-token");
  expect((await page.request.get("/api/admin/users")).status()).toBe(401);
});

test("admin : une session Google donne accès à l'administration", async ({ page }) => {
  await loginAsAdmin(page, "/admin/users");
  await expect(page).toHaveURL(/\/admin\/users$/);
  expect((await page.request.get("/api/admin/users")).status()).toBe(200);
});

test("5 échecs sur un compte : bloqué même avec le bon mot de passe, message neutre, autres comptes libres", async ({ page }) => {
  await submitLogin(page, { email: E2E_CLIENT.email, password: "pas-le-bon-0" });
  await expect(page.getByText(LOGIN_FAILED)).toBeVisible();
  const password = page.getByPlaceholder("Mot de passe");
  const submit = async (value: string) => {
    await password.fill(value);
    const answered = page.waitForResponse((r) => r.url().includes("/api/auth/callback/credentials"));
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await answered;
    await expect(page.getByText(LOGIN_FAILED)).toBeVisible();
  };
  for (let i = 1; i < 5; i++) await submit(`pas-le-bon-${i}`);

  // Bon mot de passe : même message qu'un échec, rien n'indique le blocage ni l'existence du compte
  await submit(E2E_CLIENT.password);
  await expect(page).toHaveURL(/\/login/);

  // La limite est par compte : un autre compte se connecte depuis la même IP
  await login(page, E2E_LEGACY_CLIENT, "/account");
  await expect(page).toHaveURL(/\/account$/);
});

test("jeton CSRF refusé : message d'erreur, aucune session, jamais de faux succès", async ({ page, context }) => {
  // Bons identifiants, mais le jeton CSRF envoyé est remplacé : next-auth répond 200 avec
  // error: null et une URL « ?csrf=true », sans ouvrir de session (cf. docs/anomalies).
  await page.route("**/api/auth/callback/credentials", async (route) => {
    const body = new URLSearchParams(route.request().postData() ?? "");
    body.set("csrfToken", "jeton-falsifie");
    await route.continue({ postData: body.toString() });
  });

  await submitLogin(page, E2E_CLIENT, "/account");
  await expect(page.getByText("La connexion n'a pas abouti (jeton de sécurité expiré). Veuillez réessayer.")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  expect((await context.cookies()).map((c) => c.name)).not.toContain("next-auth.session-token");

  // Le formulaire reste utilisable : avec le vrai jeton, la connexion aboutit
  await page.unroute("**/api/auth/callback/credentials");
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("un utilisateur connecté qui revient sur /login est redirigé", async ({ page }) => {
  await login(page, E2E_CLIENT, "/account");
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/login");
  await expect(page).not.toHaveURL(/\/login/);
});

test("un callbackUrl vers un autre site est ignoré après connexion (open redirect)", async ({ page }) => {
  await login(page, E2E_CLIENT, "https://phishing.example/faux-login");
  await expect(page).toHaveURL(/^http:\/\/localhost:3100\/$/);

  await page.goto(`/login?callbackUrl=${encodeURIComponent("//phishing.example")}`);
  await expect(page).toHaveURL(/^http:\/\/localhost:3100\/$/);
});

test("un utilisateur connecté qui revient sur /login est renvoyé vers son callbackUrl", async ({ page }) => {
  await login(page, E2E_CLIENT, "/");
  await page.goto(`/login?callbackUrl=${encodeURIComponent("/account")}`);
  await expect(page).toHaveURL(/\/account$/);
});

test("le bouton de compte renvoie sur la page courante après connexion", async ({ page }) => {
  await page.goto(`/creations/${E2E_CREATIONS.rose.slug}`);
  // Le bouton ne fait rien tant que la session charge : on réessaie le clic
  await expect(async () => {
    await page.getByRole("button", { name: /Se connecter$/ }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 1000 });
  }).toPass();
  await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=${encodeURIComponent(`/creations/${E2E_CREATIONS.rose.slug}`)}`));
  await waitForLoginPageReady(page);
  await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
  await page.getByPlaceholder("Mot de passe").fill(E2E_CLIENT.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/creations/${E2E_CREATIONS.rose.slug}$`));
});

test("inscription avec un email déjà utilisé : le message de l'API est affiché", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Pas encore de compte ? Créer un compte" }).click();
  await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
  await page.getByPlaceholder("Mot de passe").fill("Nouveau-123");
  await page.getByRole("button", { name: "Créer le compte" }).click();
  await expect(page.getByText("Un compte existe déjà avec cet email")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
