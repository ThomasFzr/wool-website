import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import Stripe from "stripe";

function getStripeInstance() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY n'est pas configurée. Veuillez l'ajouter dans votre fichier .env.local"
    );
  }
  return new Stripe(secretKey);
}

export async function GET(req: NextRequest) {
  try {
    const stripe = getStripeInstance();
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    // Récupérer la session Stripe
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Vérifier que la session appartient à l'utilisateur
    if (checkoutSession.customer_email !== session.user.email) {
      return NextResponse.json({ valid: false }, { status: 403 });
    }

    // Vérifier que le paiement a été complété
    const isValid =
      checkoutSession.payment_status === "paid" &&
      checkoutSession.status === "complete";

    // Récupérer les détails de la session si valide
    if (isValid) {
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
    }

    return NextResponse.json({ valid: false });
  } catch (err: any) {
    console.error("Erreur lors de la vérification de la session:", err);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
