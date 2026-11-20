import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { getEmailBaseUrl } from "@/lib/url";
import { fulfillCheckoutSession } from "@/lib/checkout-fulfillment";
import { z } from "zod";
import { parseQuery } from "@/lib/validation";

// Identifiant de session Checkout renvoyé par Stripe dans success_url (cs_test_… / cs_live_…)
const verifySchema = z.object({
  session_id: z.string("Session de paiement manquante.").regex(/^cs_[A-Za-z0-9_]{1,250}$/, "Session de paiement invalide."),
});

/**
 * GET /api/stripe/verify-session?session_id=...
 *
 * Appelé par la page /checkout/success au retour de Stripe. C'est un GET avec
 * effet de bord ASSUMÉ : il sert de filet de sécurité si le webhook Stripe
 * n'est pas encore passé (ou n'est pas configuré, ex. en local). Le traitement
 * délégué à fulfillCheckoutSession est idempotent — chaque réservation n'est
 * traitée qu'une seule fois grâce au findOneAndUpdate conditionnel sur
 * paymentStatus: "pending" — donc rejouer ce GET (rechargement de page,
 * passage du webhook avant/après) est sans danger.
 *
 * Stripe redirige parfois vers success_url avant d'avoir finalisé la session :
 * on retente donc quelques fois côté serveur, et on renvoie `pending: true`
 * si l'état n'est toujours pas tranché (le client repollera).
 */
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1200;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function GET(req: NextRequest) {
  try {
    const stripe = getStripeInstance();
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    const parsed = parseQuery(req.nextUrl.searchParams, verifySchema);
    if (!parsed.ok) return parsed.response;
    const sessionId = parsed.data.session_id;

    // Récupérer la session Stripe complète avec toutes les informations
    let checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Vérifier que la session appartient à l'utilisateur
    if (checkoutSession.customer_email !== session.user.email) {
      return NextResponse.json({ valid: false }, { status: 403 });
    }

    await connectToDatabase();

    // Traitement post-paiement partagé avec le webhook (idempotent) :
    // vérifie que le paiement est réellement validé, met à jour réservations
    // et créations, envoie les emails si ce n'est pas déjà fait.
    // Retenté si Stripe n'a pas encore finalisé la session.
    let result = await fulfillCheckoutSession(checkoutSession, {
      appUrl: getEmailBaseUrl(req.headers),
    });

    for (let attempt = 2; attempt <= MAX_ATTEMPTS && !result.paid && result.pending; attempt++) {
      await wait(RETRY_DELAY_MS);
      checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);
      result = await fulfillCheckoutSession(checkoutSession, {
        appUrl: getEmailBaseUrl(req.headers),
      });
    }

    console.log(
      `[VERIFY-SESSION] Session ${checkoutSession.id}: paid=${result.paid}, pending=${result.pending}, réservations traitées=${result.processedCount}`
    );

    if (!result.paid) {
      // pending: le client doit repoller plutôt qu'afficher un échec
      return NextResponse.json({ valid: false, pending: result.pending });
    }

    // Récupérer les line items pour avoir les détails
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, {
      expand: ["data.price.product"],
    });

    return NextResponse.json({
      valid: true,
      session: {
        id: checkoutSession.id,
        amountTotal: checkoutSession.amount_total,
        currency: checkoutSession.currency,
        paymentStatus: checkoutSession.payment_status,
        customerEmail: checkoutSession.customer_email,
        lineItems: lineItems.data.map((item) => {
          const product = item.price?.product as Stripe.Product | undefined;
          const images = product?.images || [];

          return {
            description: item.description,
            amount: item.amount_total,
            quantity: item.quantity,
            image: images.length > 0 ? images[0] : null,
          };
        }),
      },
    });
  } catch (err: any) {
    console.error("Erreur lors de la vérification de la session:", err);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
