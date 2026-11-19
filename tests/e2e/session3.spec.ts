import fs from "fs";
import path from "path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_CLIENT, E2E_CREATIONS, LOGIN_FAILED } from "./data";
import { login, resetDatabase, waitForLoginPageReady } from "./helpers";

// Parcours corrigés en session 3 (docs/revue-2026-11.md) : compte, admin, front.

const { rose, bleu, sold } = E2E_CREATIONS;
const OUTBOX = path.join(process.cwd(), ".emails");

/** Emails capturés (EMAIL_TRANSPORT=preview) depuis `since`, pour un destinataire. */
function emailsSince(since: string, to: string) {
  if (!fs.existsSync(OUTBOX)) return [];
  return fs
    .readdirSync(OUTBOX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), "utf-8")))
    .filter((e) => e.sentAt >= since && e.to === to)
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt)) as { subject: string; html: string; sentAt: string }[];
}

async function creationId(request: APIRequestContext, slug: string): Promise<string> {
  const list = (await (await request.get("/api/creations")).json()) as any[];
  const found = list.find((c) => c.slug === slug);
  expect(found, `création ${slug}`).toBeTruthy();
  return found._id;
}

async function addToCart(page: Page, slug: string) {
  await page.goto(`/creations/${slug}`);
  await page.getByRole("button", { name: "Ajouter au panier" }).click();
  await expect(page.getByRole("button", { name: /Ajouté|Déjà dans le panier/ })).toBeVisible();
}

function watchConsole(page: Page) {
  const problems: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("va.vercel-scripts.com/v1/script.debug.js")) return;
    if (/Content Security Policy|Refused to|Hydration|hydrat|did not match/i.test(text)) problems.push(text);
  });
  page.on("pageerror", (err) => problems.push(err.message));
  return problems;
}

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test.describe("compte", () => {
  test("mot de passe oublié : réponse neutre, lien valide, nouveau mot de passe actif", async ({ page }) => {
    const since = new Date().toISOString();

    // Email inconnu et email connu : même message
    for (const email of ["inconnu@maillemum.test", E2E_CLIENT.email]) {
      await page.goto("/forgot-password");
      await page.getByPlaceholder("Email").fill(email);
      await page.getByRole("button", { name: "Envoyer le lien" }).click();
      await expect(page.getByText("Un email de réinitialisation a été envoyé si ce compte existe.")).toBeVisible();
    }
    expect(emailsSince(since, "inconnu@maillemum.test")).toHaveLength(0);

    await expect.poll(() => emailsSince(since, E2E_CLIENT.email).length).toBe(1);
    const [mail] = emailsSince(since, E2E_CLIENT.email);
    const link = mail.html.match(/href="([^"]*\/reset-password\?token=[^"]+)"/)?.[1];
    expect(link, "lien de réinitialisation").toBeTruthy();
    // Le lien vise le site (NEXT_PUBLIC_APP_URL), jamais une URL tierce
    expect(link!.startsWith("http://localhost:3100/reset-password?token=")).toBe(true);

    // Lien valide : le formulaire s'affiche sans « Token invalide », même un instant
    await page.goto(link!.replace("&amp;", "&"));
    expect(await page.getByRole("heading", { name: "Token invalide" }).isVisible()).toBe(false);
    await expect(page.getByRole("heading", { name: "Nouveau mot de passe" })).toBeVisible();

    await page.getByPlaceholder("Nouveau mot de passe").fill("Nouveau-pass-456");
    await page.getByPlaceholder("Confirmer le mot de passe").fill("Nouveau-pass-456");
    await page.getByRole("button", { name: /Réinitialiser|Valider|Enregistrer|Changer/ }).click();
    await expect(page.getByText(/réinitialisé avec succès/)).toBeVisible();

    // L'ancien mot de passe ne marche plus, le nouveau oui
    await page.context().clearCookies();
    await page.goto("/login");
    await waitForLoginPageReady(page);
    await page.getByPlaceholder("Email").fill(E2E_CLIENT.email);
    await page.getByPlaceholder("Mot de passe").fill(E2E_CLIENT.password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page.getByText(LOGIN_FAILED)).toBeVisible();
    await login(page, { email: E2E_CLIENT.email, password: "Nouveau-pass-456" }, "/account");
    await expect(page).toHaveURL(/\/account$/);
  });

  test("lien de réinitialisation invalide : message d'erreur", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByRole("heading", { name: "Token invalide" })).toBeVisible();
  });

  test("inscription : mot de passe de 8 caractères minimum, puis compte créé", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Pas encore de compte ? Créer un compte" }).click();
    const password = page.getByPlaceholder("Mot de passe");
    await expect(password).toHaveAttribute("minlength", "8");
    await expect(password).toHaveAttribute("required", "");

    await page.getByPlaceholder("Email").fill("nouveau@maillemum.test");
    await password.fill("abc");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    // Bloqué par le navigateur : pas d'appel à l'API
    await expect(page).toHaveURL(/\/login/);
    expect(await password.evaluate((el: HTMLInputElement) => el.validity.tooShort)).toBe(true);

    const registered = page.waitForResponse((r) => r.url().includes("/api/register"));
    await password.fill("Bonjour-123");
    await page.getByRole("button", { name: "Créer le compte" }).click();
    expect((await registered).ok()).toBe(true);
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, E2E_ADMIN, "/admin/reservations");
    await expect(page).toHaveURL(/\/admin\/reservations$/);
  });

  test("stats : CA au prix payé, paniers abandonnés et bascule vendu/dispo non comptés", async ({ page, browser }) => {
    const stats = async () => (await (await page.request.get("/api/admin/stats")).json()) as any;
    const before = await stats();
    // Commande du jeu de données : 45 € + 6 € de port
    expect(before.revenue.totalSales).toBe(1);
    expect(before.revenue.total).toBe(51);

    // Un client part sur Stripe sans payer : panier abandonné, non compté
    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await login(client, E2E_CLIENT, "/");
    await addToCart(client, rose.slug);
    await client.goto("/cart");
    await client.getByRole("button", { name: "Procéder au paiement" }).click();
    await expect(client).toHaveURL(/localhost:3101\/pay\//);
    await clientContext.close();

    // Bascule manuelle vendu → disponible → vendu d'une autre pièce
    const id = await creationId(page.request, bleu.slug);
    for (const value of [true, false, true]) {
      const res = await page.request.patch(`/api/creations/${id}`, { data: { sold: value } });
      expect(res.ok()).toBe(true);
    }

    const after = await stats();
    expect(after.revenue.totalSales).toBe(1);
    expect(after.revenue.total).toBe(51);
  });

  test("renommer une création : nouvelle URL, l'ancienne redirige (301)", async ({ page }) => {
    const id = await creationId(page.request, rose.slug);
    const res = await page.request.patch(`/api/creations/${id}`, { data: { title: "Bonnet Mérinos Framboise" } });
    expect(res.ok()).toBe(true);
    const updated = await res.json();
    expect(updated.slug).not.toBe(rose.slug);

    const old = await page.request.get(`/creations/${rose.slug}`, { maxRedirects: 0 });
    expect([301, 308]).toContain(old.status());
    expect(old.headers()["location"]).toContain(`/creations/${updated.slug}`);

    await page.goto(`/creations/${rose.slug}`);
    await expect(page).toHaveURL(new RegExp(`/creations/${updated.slug}$`));
    await expect(page.getByRole("heading", { name: "Bonnet Mérinos Framboise" })).toBeVisible();
  });

  test("vider la description et la marque de laine : les champs restent vides", async ({ page }) => {
    const id = await creationId(page.request, rose.slug);
    await page.request.patch(`/api/creations/${id}`, { data: { description: "Texte", yarnBrand: "Drops" } });
    const res = await page.request.patch(`/api/creations/${id}`, { data: { description: "", yarnBrand: "" } });
    expect(res.ok()).toBe(true);
    const list = (await (await page.request.get("/api/creations")).json()) as any[];
    const creation = list.find((c) => c._id === id);
    expect(creation.description ?? "").toBe("");
    expect(creation.yarnBrand ?? "").toBe("");
  });

  test("description piégée (XSS) : aucun script exécuté sur la fiche", async ({ page }) => {
    const id = await creationId(page.request, rose.slug);
    const payload =
      '<p>Laine <strong>douce</strong></p><img src="x" onerror="window.__xss=1"><script>window.__xss=2</script><a href="javascript:window.__xss=3">lien</a>';
    await page.request.patch(`/api/creations/${id}`, { data: { description: payload, seoDescription: payload } });

    const problems = watchConsole(page);
    await page.goto(`/creations/${rose.slug}`);
    await expect(page.getByText("douce").first()).toBeVisible();
    await page.getByText("lien").first().click().catch(() => {});
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();
    expect(problems.filter((p) => !/Refused to (load|execute)/.test(p))).toEqual([]);
  });

  test("frais de port modifiés : le panier affiche le nouveau montant tout de suite", async ({ page }) => {
    const current = await (await page.request.get("/api/settings")).json();
    const res = await page.request.post("/api/settings", { data: { ...current, shippingCost: 9 } });
    expect(res.ok()).toBe(true);

    await addToCart(page, rose.slug);
    await page.goto("/cart");
    await page.getByText("Livraison", { exact: true }).first().click();
    await expect(page.getByText("9.00 €").first()).toBeVisible();
  });

  test("commande de 2 articles : expédiée puis annulée d'un coup, un seul email d'annulation", async ({ page, browser }) => {
    // Le client achète 2 pièces (faux Stripe)
    const clientContext = await browser.newContext();
    const client = await clientContext.newPage();
    await login(client, E2E_CLIENT, "/");
    await addToCart(client, rose.slug);
    await addToCart(client, bleu.slug);
    await client.goto("/cart");
    await client.getByText("Livraison", { exact: true }).first().click();
    await client.getByRole("button", { name: "Procéder au paiement" }).click();
    await client.getByRole("button", { name: "Payer" }).click();
    await expect(client.getByRole("heading", { name: "Paiement confirmé !" })).toBeVisible();
    await clientContext.close();

    const reservations = async () =>
      collectReservations(await (await page.request.get("/api/admin/reservations?limit=50")).json()).filter((r) =>
        r.stripeCheckoutSessionId?.startsWith("cs_test_e2e_")
      );
    const order = await reservations();
    expect(order).toHaveLength(2);

    // Expédition de toute la commande depuis un seul article
    const shipped = await page.request.patch(`/api/admin/reservations/${order[0]._id}`, {
      data: { status: "shipped", trackingNumber: "6A000000001", wholeOrder: true },
    });
    expect(shipped.ok()).toBe(true);
    for (const r of await reservations()) {
      expect(r.status).toBe("shipped");
      expect(r.trackingNumber).toBe("6A000000001");
    }

    // Annulation de toute la commande : un seul email pour les 2 articles
    const since = new Date().toISOString();
    const cancelled = await page.request.patch(`/api/admin/reservations/${order[1]._id}`, {
      data: { status: "cancelled", cancelReason: "Test", wholeOrder: true },
    });
    expect(cancelled.ok()).toBe(true);
    for (const r of await reservations()) expect(r.status).toBe("cancelled");
    await expect.poll(() => emailsSince(since, E2E_CLIENT.email).length).toBe(1);
    await page.waitForTimeout(1500);
    const mails = emailsSince(since, E2E_CLIENT.email);
    expect(mails).toHaveLength(1);
    expect(mails[0].html).toContain(rose.title);
    expect(mails[0].html).toContain(bleu.title);
  });
});

/** Aplatis la réponse paginée par commande de /api/admin/reservations. */
function collectReservations(payload: any): any[] {
  const out: any[] = [];
  const visit = (value: any) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value._id && value.paymentStatus !== undefined) out.push(value);
      else Object.values(value).forEach(visit);
    }
  };
  visit(payload);
  return out;
}

test.describe("front", () => {
  test("accueil et fiche : ni erreur CSP ni erreur d'hydratation (badge « Nouveau »)", async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto("/");
    await expect(page.locator(`#creation-${rose.slug}`)).toBeVisible();
    await page.goto(`/creations/${rose.slug}`);
    await expect(page.getByRole("button", { name: "Ajouter au panier" })).toBeVisible();
    await page.goto(`/creations/${sold.slug}`);
    await page.waitForLoadState("networkidle");
    expect(problems).toEqual([]);
  });

  test("panier synchronisé entre deux onglets", async ({ context }) => {
    const first = await context.newPage();
    const second = await context.newPage();
    await second.goto("/cart");
    await addToCart(first, rose.slug);
    await expect(second.getByRole("link", { name: rose.title })).toBeVisible();
  });
});
