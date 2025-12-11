import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";

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

    // Récupérer la session Stripe complète avec toutes les informations
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
      // Mettre à jour les réservations et créations (comme le webhook)
      await connectToDatabase();
      
      const reservationIds = checkoutSession.metadata?.reservationIds
        ? JSON.parse(checkoutSession.metadata.reservationIds)
        : [];

      if (reservationIds.length > 0) {
        const reservations = await Reservation.find({
          _id: { $in: reservationIds },
        });

        // Récupérer le mode de livraison et les frais de livraison depuis les metadata
        const deliveryMode = checkoutSession.metadata?.deliveryMode || "pickup";
        const totalShippingCost = checkoutSession.metadata?.shippingCost 
          ? parseFloat(checkoutSession.metadata.shippingCost) 
          : 0;
        
        // Récupérer l'adresse de livraison si disponible
        // Essayer d'abord dans la Checkout Session (shipping_details)
        let shippingInfo = (checkoutSession as any).shipping_details || (checkoutSession as any).shipping;
        
        // Si pas trouvé dans la session, essayer dans le PaymentIntent
        if (!shippingInfo?.address && checkoutSession.payment_intent) {
          try {
            const paymentIntentId = checkoutSession.payment_intent as string;
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            shippingInfo = (paymentIntent as any).shipping || (paymentIntent as any).shipping_details;
          } catch (err) {
            console.log("Impossible de récupérer le PaymentIntent pour l'adresse:", err);
          }
        }
        
        const shippingAddress = shippingInfo?.address ? {
          name: shippingInfo.name || "",
          line1: shippingInfo.address.line1 || "",
          line2: shippingInfo.address.line2 || "",
          city: shippingInfo.address.city || "",
          postalCode: shippingInfo.address.postal_code || "",
          country: shippingInfo.address.country || "",
        } : null;
        
        // Log pour déboguer
        if (checkoutSession.metadata?.deliveryMode === "shipping") {
          console.log("=== DEBUG ADRESSE LIVRAISON (VERIFY-SESSION) ===");
          console.log("Session ID:", checkoutSession.id);
          console.log("Payment Intent ID:", checkoutSession.payment_intent);
          console.log("Shipping details (session):", (checkoutSession as any).shipping_details);
          console.log("Shipping (session):", (checkoutSession as any).shipping);
          console.log("Shipping info final:", shippingInfo);
          console.log("Adresse de livraison récupérée:", shippingAddress ? "OUI" : "NON");
          if (shippingAddress) {
            console.log("Détails:", JSON.stringify(shippingAddress, null, 2));
          } else {
            console.log("⚠️  ATTENTION: Adresse non trouvée dans la session ni dans le PaymentIntent");
          }
          console.log("================================================");
        }

        await Promise.all(
          reservations.map(async (reservation: any, index: number) => {
            // Vérifier si déjà traité
            if (reservation.paymentStatus === "paid") {
              return;
            }

            // Mettre à jour la réservation
            // payment_intent est toujours une string (ID) dans checkout.sessions
            reservation.stripePaymentIntentId = checkoutSession.payment_intent as string;
            reservation.stripeCustomerId = checkoutSession.customer as string;
            reservation.paymentStatus = "paid";
            reservation.status = "validated";
            reservation.paidAt = new Date();
            reservation.deliveryMode = deliveryMode;
            
            // Mettre les frais de livraison uniquement sur le premier article
            if (deliveryMode === "shipping" && totalShippingCost > 0) {
              reservation.shippingCost = index === 0 ? totalShippingCost : 0;
            } else {
              reservation.shippingCost = 0;
            }
            
            // Ajouter l'adresse de livraison si disponible
            if (shippingAddress) {
              reservation.shippingAddress = shippingAddress;
            }
            
            await reservation.save();

            // Mettre à jour la création - marquer comme vendue
            const creation = await Creation.findById(reservation.creationId);
            if (creation) {
              creation.sold = true;
              creation.salesCount = (creation.salesCount || 0) + 1;
              await creation.save();
            }
          })
        );
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
    }

    return NextResponse.json({ valid: false });
  } catch (err: any) {
    console.error("Erreur lors de la vérification de la session:", err);
    return NextResponse.json({ valid: false }, { status: 500 });
  }
}
