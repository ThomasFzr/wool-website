import { expect, test, type Browser } from "@playwright/test";
import { E2E_CLIENT, E2E_CREATIONS, TEST_CARDS } from "./data";
import {
  checkoutForm,
  addToCart,
  complete3DSecure,
  dbCreation,
  dbReservations,
  goToStripe,
  login,
  payOnStripe,
  resetDatabase,
  stripe,
  updateSettings,
  waitForDb,
  watchConsole,
} from "./helpers";

const { rose, bleu } = E2E_CREATIONS;

/** Réservations créées par le test (hors commande du jeu de données). */
async function newReservations(request: Parameters<typeof dbReservations>[0]) {
  return (await dbReservations(request)).filter((r) => r.stripeCheckoutSessionId !== "cs_test_seed_1");
}

/** Vérifie, depuis un navigateur anonyme, que la pièce peut être mise au panier. */
async function expectAvailableToOthers(browser: Browser, slug: string) {
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto(`/creations/${slug}`);
  await expect(other.getByRole("button", { name: "Ajouter au panier" })).toBeEnabled();
  await context.close();
}

test.beforeEach(async ({ page, request }) => {
  await resetDatabase(request);
  await login(page, E2E_CLIENT, "/");
});

test("livraison : paiement par carte, commande payée, pièces vendues, prix figés", async ({ page, request }) => {
  const problems = watchConsole(page);
  await addToCart(page, rose.slug);
  await addToCart(page, bleu.slug);
  await goToStripe(page, "shipping");

  // Montant affiché par Stripe : 40 + 35 + 6 de port
  await expect(page.getByText("81,00 €").first()).toBeVisible();
  await payOnStripe(page);

  await page.waitForURL(/\/checkout\/success\?session_id=cs_test_/);
  await expect(page.getByRole("heading", { name: "Paiement confirmé !" })).toBeVisible();

  const reservations = await waitForDb(
    () => newReservations(request),
    (rs) => rs.length === 2 && rs.every((r) => r.paymentStatus === "paid")
  );
  expect(reservations.map((r) => r.price).sort()).toEqual([35, 40]);
  expect(reservations.every((r) => r.stripePaymentIntentId?.startsWith("pi_"))).toBe(true);
  expect(reservations[0].shippingAddress?.postalCode).toBe("75011");
  expect((await dbCreation(request, rose.slug)).sold).toBe(true);
  expect((await dbCreation(request, bleu.slug)).sold).toBe(true);

  // Stripe a bien encaissé 81 €
  const pi = await stripe.paymentIntents.retrieve(reservations[0].stripePaymentIntentId);
  expect(pi.status).toBe("succeeded");
  expect(pi.amount).toBe(8100);

  await page.goto("/account/orders");
  await expect(page.getByText(rose.title).first()).toBeVisible();
  await expect(page.getByText(bleu.title).first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("remboursement intégral depuis Stripe : commande remboursée, pièce remise en vente", async ({ page, request }) => {
  await addToCart(page, rose.slug);
  await goToStripe(page, "shipping");
  await payOnStripe(page);
  await page.waitForURL(/\/checkout\/success/);

  const [paid] = await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus === "paid"
  );
  await stripe.refunds.create({ payment_intent: paid.stripePaymentIntentId });

  // Événement charge.refunded relayé par `stripe listen`
  const [refunded] = await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus === "refunded"
  );
  expect(refunded.status).toBe("cancelled");
  expect((await dbCreation(request, rose.slug)).sold).toBe(false);

  await page.goto(`/creations/${rose.slug}`);
  await expect(page.getByRole("button", { name: "Ajouter au panier" })).toBeEnabled();
});

test("remboursement partiel : la commande reste payée (ajustement manuel)", async ({ page, request }) => {
  await addToCart(page, rose.slug);
  await goToStripe(page, "shipping");
  await payOnStripe(page);
  await page.waitForURL(/\/checkout\/success/);

  const [paid] = await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus === "paid"
  );
  const refund = await stripe.refunds.create({ payment_intent: paid.stripePaymentIntentId, amount: 600 });
  expect(refund.status).toBe("succeeded");

  // Laisse le temps au webhook d'arriver, puis vérifie que rien n'a bougé
  await page.waitForTimeout(8000);
  const [after] = await newReservations(request);
  expect(after.paymentStatus).toBe("paid");
  expect((await dbCreation(request, rose.slug)).sold).toBe(true);
});

test("carte refusée puis abandon : rien n'est débité, la pièce est libérée tout de suite", async ({ page, request, browser }) => {
  await addToCart(page, rose.slug);
  await goToStripe(page, "shipping");
  await payOnStripe(page, { card: TEST_CARDS.declined });
  // Message d'erreur affiché dans le formulaire (iframe Stripe)
  await expect((await checkoutForm(page)).getByText(/refusée|declined/i).first()).toBeVisible();

  // Bouton retour de Stripe → /checkout/cancel
  await page.getByTestId("business-link").or(page.locator('a[href*="/checkout/cancel"]')).first().click();
  await page.waitForURL(/\/checkout\/cancel/);
  await expect(page.getByRole("heading", { name: "Paiement annulé" })).toBeVisible();

  const [cancelled] = await waitForDb(
    () => newReservations(request),
    (rs) => rs.length === 1 && rs[0].paymentStatus !== "pending"
  );
  expect(cancelled.paymentStatus).toBe("failed");
  expect(cancelled.status).toBe("cancelled");
  const session = await stripe.checkout.sessions.retrieve(cancelled.stripeCheckoutSessionId);
  expect(session.status).toBe("expired");
  expect(session.payment_status).toBe("unpaid");

  // Un autre acheteur peut l'acheter (le client, lui, l'a encore dans son panier)
  await expectAvailableToOthers(browser, rose.slug);
});

test("session expirée côté Stripe : webhook checkout.session.expired, pièce libérée", async ({ page, request, browser }) => {
  await addToCart(page, bleu.slug);
  await goToStripe(page, "shipping");

  const [pending] = await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus === "pending"
  );
  expect((await dbCreation(request, bleu.slug)).reserved).toBe(true);
  await stripe.checkout.sessions.expire(pending.stripeCheckoutSessionId);

  // Événement checkout.session.expired relayé par `stripe listen`
  const [released] = await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus !== "pending"
  );
  expect(released.paymentStatus).toBe("failed");
  expect((await dbCreation(request, bleu.slug)).reserved).not.toBe(true);

  await expectAvailableToOthers(browser, bleu.slug);
});

test("3D Secure : authentification validée, paiement enregistré", async ({ page, request }) => {
  await addToCart(page, rose.slug);
  await goToStripe(page, "shipping");
  await payOnStripe(page, { card: TEST_CARDS.threeDSecure });
  await complete3DSecure(page);

  await page.waitForURL(/\/checkout\/success/);
  await expect(page.getByRole("heading", { name: "Paiement confirmé !" })).toBeVisible();
  await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus === "paid"
  );
});

test("remise en main propre : pas de frais de port ni d'adresse demandée", async ({ page, request }) => {
  await updateSettings(request, {
    "pickupConditions.enabled": true,
    "pickupConditions.allowedPostalCodes": ["75"],
  });
  await addToCart(page, rose.slug);
  await goToStripe(page, "pickup");

  await expect(page.getByText("40,00 €").first()).toBeVisible();
  // Formulaire dans une iframe : aucune rubrique « Livraison » demandée
  await expect((await checkoutForm(page)).getByRole("group", { name: "Livraison" })).toHaveCount(0);
  await payOnStripe(page, { shipping: false });

  await page.waitForURL(/\/checkout\/success/);
  const [paid] = await waitForDb(
    () => newReservations(request),
    (rs) => rs[0]?.paymentStatus === "paid"
  );
  expect(paid.deliveryMode).toBe("pickup");
  const pi = await stripe.paymentIntents.retrieve(paid.stripePaymentIntentId);
  expect(pi.amount).toBe(4000);
});
