import { expect, test, type APIResponse } from "@playwright/test";
import { E2E_CREATIONS } from "./data";
import { resetDatabase } from "./helpers";

// Injection d'opérateur MongoDB sur les routes publiques de l'application lancée
// (docs/SECURITY.md, A03) : refusée par les schémas zod avant toute requête en base,
// réponse 400 en français, sans détail interne.

const OPERATOR = { $ne: null };

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

/** Réponse 400 de validation : champ nommé, aucun détail technique. */
async function expectRejected(res: APIResponse, champ: string) {
  expect(res.status()).toBe(400);
  const text = await res.text();
  expect(JSON.parse(text)).toMatchObject({ champ, error: expect.any(String) });
  expect(text).not.toMatch(/\$ne|Cast to|Mongo|Zod|expected|received|\bat\s+\S+\s+\(/i);
}

test("mot de passe oublié : un email {\"$ne\": null} est refusé", async ({ request }) => {
  const res = await request.post("/api/auth/forgot-password", { data: { email: OPERATOR } });
  await expectRejected(res, "email");
});

test("inscription : un email {\"$ne\": null} est refusé", async ({ request }) => {
  const res = await request.post("/api/register", {
    data: { email: OPERATOR, password: "une phrase de passe solide" },
  });
  await expectRejected(res, "email");
});

test("contact : une création {\"$ne\": null} est refusée", async ({ request }) => {
  const res = await request.post("/api/contact", {
    data: {
      name: "Robot",
      email: "robot@example.com",
      subject: "Test",
      message: "Tentative d'injection",
      creationId: OPERATOR,
    },
  });
  await expectRejected(res, "creationId");
});

test("fiche création : un identifiant {\"$ne\": null} ne donne accès à rien, pas même à une création cachée", async ({
  request,
}) => {
  const res = await request.get(`/api/creations/${encodeURIComponent(JSON.stringify(OPERATOR))}`);
  expect(res.status()).toBe(404);

  // Contrôle : la création cachée existe bien, mais reste invisible au public
  expect((await request.get(`/api/creations/${E2E_CREATIONS.hidden.slug}`)).status()).toBe(404);
  expect((await request.get(`/api/creations/${E2E_CREATIONS.rose.slug}`)).status()).toBe(200);
});

test("disponibilité du panier : des ids {\"$ne\": null} sont ignorés", async ({ request }) => {
  const res = await request.get(`/api/creations/availability?ids=${encodeURIComponent(JSON.stringify(OPERATOR))}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ available: [] });
});
