import fs from "fs";
import path from "path";
import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_CLIENT, E2E_CREATIONS } from "./data";
import { login, resetDatabase } from "./helpers";

// Parcours corrigés en session 4 (docs/revue-2026-11.md) : petits points du front et du SEO.

const { rose, sold } = E2E_CREATIONS;
const OUTBOX = path.join(process.cwd(), ".emails");

/** Emails capturés (EMAIL_TRANSPORT=preview) depuis `since`, pour un destinataire. */
function emailsSince(since: string, to: string) {
  if (!fs.existsSync(OUTBOX)) return [];
  return fs
    .readdirSync(OUTBOX)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(OUTBOX, f), "utf-8")))
    .filter((e) => e.sentAt >= since && e.to === to) as { subject: string; html: string }[];
}

/** Petite image SVG en data: URI (autorisée par la CSP, pas de réseau). */
const svg = (color: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${color}"/></svg>`
  )}`;

async function creationIdOf(page: Page, slug: string): Promise<string> {
  const list = (await (await page.request.get("/api/creations")).json()) as any[];
  return list.find((c) => c.slug === slug)._id;
}

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

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test.describe("fiche produit", () => {
  test("visionneuse : la première flèche clavier change bien de photo", async ({ page }) => {
    await login(page, E2E_ADMIN, "/");
    const id = await creationIdOf(page, rose.slug);
    const res = await page.request.patch(`/api/creations/${id}`, { data: { images: [svg("red"), svg("blue")] } });
    expect(res.ok()).toBe(true);

    await page.goto(`/creations/${rose.slug}`);
    await page.getByRole("button", { name: "Ouvrir le zoom" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Photo 1 sur 2")).toBeAttached();

    // Placement initial de la visionneuse (setTimeout de 10 ms à l'ouverture) : un humain
    // n'appuie pas plus vite
    await page.waitForTimeout(100);

    await page.keyboard.press("ArrowRight");
    await expect(dialog.getByText("Photo 2 sur 2")).toBeAttached();
    // La visionneuse a réellement défilé jusqu'à la 2e photo (avant le correctif : l'index
    // changeait mais la visionneuse restait sur la 1re)
    const scroller = dialog.locator(".snap-x");
    await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test("sans photo : message sur mobile, pas de loupe vers un écran vide", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/creations/${rose.slug}`);
    await expect(page.getByText("Pas d'image").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Ouvrir le zoom" })).toHaveCount(0);
  });

  test("« Vous pourriez aussi aimer » sur mobile : flèches invisibles et non cliquables", async ({ page }) => {
    await login(page, E2E_ADMIN, "/");
    const created = await page.request.post("/api/creations", {
      data: { title: "Bandeau Lin Vert", price: 25, color: "Vert", type: "bandeau", hidden: false },
    });
    expect(created.ok()).toBe(true);
    const related = [await creationIdOf(page, E2E_CREATIONS.bleu.slug), (await created.json())._id];
    const id = await creationIdOf(page, rose.slug);
    expect((await page.request.patch(`/api/creations/${id}`, { data: { relatedCreations: related } })).ok()).toBe(true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/creations/${rose.slug}`);
    await page.getByRole("heading", { name: "Vous pourriez aussi aimer" }).scrollIntoViewIfNeeded();
    const next = page.getByRole("button", { name: "Créations suivantes" });
    await expect(next).toBeAttached();
    await expect(next).toHaveCSS("opacity", "0");
    await expect(next).toHaveCSS("pointer-events", "none");
  });

  test("le toast « ajouté au panier » disparaît après ~4 s", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/creations/${rose.slug}`);
    await page.getByRole("button", { name: "Ajouter au panier" }).click();
    const toast = page.getByText("Article ajouté au panier");
    await expect(toast).toBeVisible();
    const start = Date.now();
    await expect(toast).toBeHidden({ timeout: 6000 });
    // 4 s + animation de sortie ; avant le correctif : ~6 s (minuteur relancé à chaque rendu)
    expect(Date.now() - start).toBeLessThan(5000);
  });
});

test.describe("contact", () => {
  test("liste des créations indisponible : le message peut tout de même partir", async ({ page }) => {
    await page.route("**/api/creations", (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/contact?subject=commande");
    await expect(page.getByText("Impossible d'afficher les créations")).toBeVisible();

    await page.getByPlaceholder("Votre nom").fill("Camille");
    await page.getByPlaceholder("votre@email.com").fill("camille@maillemum.test");
    await page.getByPlaceholder("Votre message...").fill("Je voudrais le même bonnet en vert.");
    await expect(page.getByRole("button", { name: /Envoyer le message/ })).toBeEnabled();

    // « Réessayer » recharge la liste une fois le service revenu
    await page.unroute("**/api/creations");
    await page.getByRole("button", { name: "Réessayer" }).click();
    await expect(page.getByText(rose.title)).toBeVisible();
  });
});

test.describe("SEO", () => {
  test("robots.txt, sitemap et en-tête des polices", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    for (const path of ["/admin", "/account", "/cart", "/checkout"]) {
      expect(robots).toContain(`Disallow: ${path}\n`);
    }
    expect(robots).toContain("Sitemap: https://www.maillemum.fr/sitemap.xml");

    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`https://www.maillemum.fr/creations/${rose.slug}`);

    const font = await request.get("/fonts/ClashDisplay-Variable.ttf");
    expect(font.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("pages privées en noindex, Open Graph complet sur la fiche", async ({ page }) => {
    await page.goto("/cart");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");

    await page.goto(`/creations/${rose.slug}`);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "MailleMum");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      `https://www.maillemum.fr/creations/${rose.slug}`
    );
  });
});

test.describe("admin", () => {
  test("passer une commande en « expédiée » prévient le client avec le suivi", async ({ page }) => {
    await login(page, E2E_ADMIN, "/");
    const list = await (await page.request.get("/api/admin/reservations?limit=50")).json();
    const order = collectReservations(list).find((r) => r.contact === E2E_CLIENT.email);
    expect(order, "commande payée du client (seed)").toBeTruthy();

    const since = new Date().toISOString();
    const res = await page.request.patch(`/api/admin/reservations/${order._id}`, {
      data: { status: "shipped", trackingNumber: "6A000000042" },
    });
    expect(res.ok()).toBe(true);

    await expect.poll(() => emailsSince(since, E2E_CLIENT.email).length).toBe(1);
    const [email] = emailsSince(since, E2E_CLIENT.email);
    expect(email.subject).toBe("📦 Votre commande a été expédiée");
    expect(email.html).toContain("6A000000042");
    expect(email.html).toContain(sold.title);
  });
});
