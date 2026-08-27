import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { getAppUrl } from "@/lib/url";
import {
  fulfillCheckoutSession,
  releaseExpiredCheckoutSession,
} from "@/lib/checkout-fulfillment";

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET n'est pas configurée. Veuillez l'ajouter dans votre fichier .env.local"
    );
  }
  return secret;
}

// Désactiver le parsing automatique du body pour les webhooks Stripe
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripeInstance();
    const webhookSecret = getWebhookSecret();

    const body = await req.text();
    const headersList = await headers();
    const signature = headersList.get("stripe-signature");

    if (!signature) {
      return new NextResponse("Missing stripe-signature header", {
        status: 400,
      });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err: any) {
      console.error("Erreur de vérification du webhook:", err.message);
      return new NextResponse(`Webhook Error: ${err.message}`, { status: 400 });
    }

    await connectToDatabase();

    // Paiement finalisé : traitement post-paiement partagé avec verify-session
    // (idempotent — les emails partent en tâche de fond, la réponse 200 est
    // renvoyée dès que la base est à jour)
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // Récupérer la session complète (y compris shipping) auprès de Stripe
      const fullSession = await stripe.checkout.sessions.retrieve(session.id);

      const result = await fulfillCheckoutSession(fullSession, {
        appUrl: getAppUrl(headersList),
      });
      console.log(
        `[WEBHOOK] Session ${fullSession.id}: paid=${result.paid}, réservations traitées=${result.processedCount}`
      );
    }

    // Session expirée sans paiement : libérer les articles uniques réservés
    // et annuler les réservations restées "pending"
    if (event.type === "checkout.session.expired") {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await releaseExpiredCheckoutSession(session);
      console.log(
        `[WEBHOOK] Session expirée ${session.id}: ${result.cancelledCount} réservation(s) annulée(s)`
      );
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Erreur dans le webhook Stripe:", err);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 500 });
  }
}
