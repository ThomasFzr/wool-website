import { expect, test, type Page } from "@playwright/test";
import { E2E_CLIENT, E2E_CREATIONS } from "./data";
import { fakeStripeSessions, login, loginAsAdmin, resetDatabase, waitForLoginPageReady } from "./helpers";

const { rose, bleu, hidden } = E2E_CREATIONS;

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

async function addToCart(page: Page, slug: string) {
  await page.goto(`/creations/${slug}`);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByRole("button", { name: /Ajouté|Déjà dans le panier/ })).toBeVisible();
}

test("ajout au panier depuis la fiche produit", async ({ page }) => {
  await addToCart(page, rose.slug);
  await addToCart(page, bleu.slug);

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Panier" })).toBeVisible();
  await expect(page.getByRole("link", { name: rose.title })).toBeVisible();
  await expect(page.getByRole("link", { name: bleu.title })).toBeVisible();

  // Le panier survit au rechargement (localStorage)
  await page.reload();
  await expect(page.getByRole("link", { name: bleu.title })).toBeVisible();

  await page.getByRole("button", { name: "Retirer du panier" }).first().click();
  await expect(page.getByRole("link", { name: rose.title })).toHaveCount(0);
});

test("une pièce cachée n'est pas accessible", async ({ page }) => {
  const res = await page.goto(`/creations/${hidden.slug}`);
  expect(res?.status()).toBe(404);
});

test("paiement : connexion demandée, redirection vers Stripe, commande enregistrée", async ({
  page,
  request,
}) => {
  await addToCart(page, rose.slug);
  await page.goto("/cart");

  // Anonyme : le bouton de paiement envoie vers la connexion, puis revient au panier
  await page.getByRole("button", { name: "Se connecter pour payer" }).click();
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  await waitForLoginPageReady(page);
  await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
  await page.getByPlaceholder("Mot de passe").fill(E2E_CLIENT.password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page).toHaveURL(/\/cart$/);

  // Livraison : 40 € + 6 € de frais de port
  await page.getByText("Livraison", { exact: false }).first().click();
  await page.getByRole("button", { name: "Procéder au paiement" }).click();

  // Redirection vers (le faux) Stripe Checkout
  await expect(page).toHaveURL(/localhost:3101\/pay\/cs_test_e2e_/);
  await expect(page.getByRole("heading", { name: "Faux Stripe Checkout" })).toBeVisible();
  await expect(page.getByTestId("customer-email")).toHaveText(E2E_CLIENT.email);
  await expect(page.getByTestId("amount-total")).toHaveText("Total : 46.00 €");

  const [session] = await fakeStripeSessions(request);
  expect(session.metadata.deliveryMode).toBe("shipping");
  expect(JSON.parse(session.metadata.reservationIds)).toHaveLength(1);

  // Paiement → retour sur le site, vérification de la session
  await page.getByRole("button", { name: "Payer" }).click();
  await expect(page).toHaveURL(/\/checkout\/success\?session_id=cs_test_e2e_/);
  await expect(page.getByRole("heading", { name: "Paiement confirmé !" })).toBeVisible();

  // La pièce est vendue et la commande apparaît dans le compte
  await page.goto(`/creations/${rose.slug}`);
  await expect(page.getByText("Article vendu")).toBeVisible();
  await page.goto("/account/orders");
  await expect(page.getByText(rose.title).first()).toBeVisible();
});

test("une pièce verrouillée par un autre acheteur ne peut pas être payée", async ({
  page,
  browser,
}) => {
  // Second acheteur (admin, autre session navigateur) : met la pièce au panier pendant qu'elle est libre
  const other = await browser.newPage();
  await loginAsAdmin(other, "/");
  await addToCart(other, bleu.slug);

  // Premier acheteur : arrive jusqu'à Stripe (la pièce est verrouillée)
  await login(page, E2E_CLIENT, "/");
  await addToCart(page, bleu.slug);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Procéder au paiement" }).click();
  await expect(page).toHaveURL(/localhost:3101\/pay\//);

  // La vitrine et la fiche affichent désormais la pièce comme réservée
  await other.goto("/");
  await expect(other.locator(`#creation-${bleu.slug}`).getByText("Réservé")).toBeVisible();
  await other.goto(`/creations/${bleu.slug}`);
  await expect(other.getByText("Article réservé")).toBeVisible();
  await expect(other.getByRole("button", { name: "Ajouter au panier" })).toBeDisabled();

  // Le paiement de la pièce restée au panier est refusé
  await other.goto("/cart");
  const dialog = other.waitForEvent("dialog");
  await other.getByRole("button", { name: "Procéder au paiement" }).click();
  const alert = await dialog;
  expect(alert.message()).toContain("n'est plus disponible");
  await alert.dismiss();
  await other.close();
});

test("paiement abandonné puis relancé : l'ancienne session est expirée, la nouvelle aboutit", async ({
  page,
  request,
}) => {
  await login(page, E2E_CLIENT, "/");
  await addToCart(page, rose.slug);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Procéder au paiement" }).click();
  await expect(page).toHaveURL(/localhost:3101\/pay\//);

  // Retour au site sans payer, puis nouvelle tentative
  await page.getByRole("link", { name: "Annuler" }).click();
  await expect(page).toHaveURL(/\/checkout\/cancel/);
  await page.goto("/cart");
  await page.getByRole("button", { name: "Procéder au paiement" }).click();
  await expect(page).toHaveURL(/localhost:3101\/pay\//);

  const [latest, previous] = await fakeStripeSessions(request);
  expect(previous.status).toBe("expired");
  expect(latest.status).toBe("open");

  await page.getByRole("button", { name: "Payer" }).click();
  await expect(page.getByRole("heading", { name: "Paiement confirmé !" })).toBeVisible();
});
