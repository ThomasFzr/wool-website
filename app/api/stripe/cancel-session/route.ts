import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { releaseExpiredCheckoutSession } from "@/lib/checkout-fulfillment";
import Reservation from "@/models/Reservation";
import type Stripe from "stripe";

/**
 * POST /api/stripe/cancel-session
 *
 * Appelé par la page /checkout/cancel quand le client quitte la page de paiement Stripe :
 * ses sessions encore ouvertes sont expirées et leurs pièces libérées tout de suite, au
 * lieu de rester bloquées jusqu'à l'expiration automatique (30 min). Une session déjà
 * payée ne peut pas être expirée : Stripe refuse et la commande suit son cours. Une session
 * déjà expirée par Stripe voit tout de même ses pièces libérées.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    await connectToDatabase();
    const sessionIds: string[] = await Reservation.distinct("stripeCheckoutSessionId", {
      contact: session.user.email,
      paymentStatus: "pending",
      stripeCheckoutSessionId: { $nin: [null, ""] },
    });

    const stripe = getStripeInstance();
    let released = 0;
    for (const id of sessionIds) {
      let expired: Stripe.Checkout.Session | null = null;
      try {
        expired = await stripe.checkout.sessions.expire(id);
      } catch (err: any) {
        // Refus de Stripe : session payée entre-temps (la commande suit son cours), ou déjà
        // expirée. Dans ce dernier cas on libère quand même les pièces, sans attendre le
        // webhook (qui a pu échouer ou ne pas encore arriver).
        console.warn(`[CANCEL-SESSION] Session ${id} non expirée :`, err?.message ?? err);
        try {
          const current = await stripe.checkout.sessions.retrieve(id);
          if (current.status === "expired") expired = current;
        } catch (retrieveErr: any) {
          console.warn(`[CANCEL-SESSION] Session ${id} introuvable :`, retrieveErr?.message ?? retrieveErr);
        }
      }
      if (expired) released += (await releaseExpiredCheckoutSession(expired)).cancelledCount;
    }

    return NextResponse.json({ released });
  } catch (err) {
    console.error("[CANCEL-SESSION] Erreur:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
