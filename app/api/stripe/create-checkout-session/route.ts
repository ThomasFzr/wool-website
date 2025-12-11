import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
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

type DeliveryMode = "pickup" | "shipping";

export async function POST(req: NextRequest) {
  try {
    // Vérifier que Stripe est configuré
    const stripe = getStripeInstance();

    // 🔐 Vérifier si utilisateur loggé
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const { items, deliveryMode = "pickup" } = await req.json() as { 
      items: any[]; 
      deliveryMode?: DeliveryMode;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      return new NextResponse("Panier vide", { status: 400 });
    }

    // Récupérer les frais de livraison depuis les settings
    const settings = await Settings.findById("main").lean() as { shippingCost?: number } | null;
    const shippingCost = settings?.shippingCost ?? 5;

    // Récupérer les créations et vérifier leur disponibilité
    const creationIds = items.map((item: any) => item.creationId);
    const creations = await Creation.find({ _id: { $in: creationIds } });

    if (creations.length !== items.length) {
      return new NextResponse("Certaines créations n'existent pas", {
        status: 404,
      });
    }

    // Vérifier qu'aucune création n'est déjà vendue
    const soldCreations = creations.filter((c) => c.sold);
    if (soldCreations.length > 0) {
      return new NextResponse(
        "Certaines créations sont déjà vendues",
        { status: 409 }
      );
    }

    // Vérifier que toutes les créations ont un prix
    const creationsWithoutPrice = creations.filter((c) => c.price == null);
    if (creationsWithoutPrice.length > 0) {
      return new NextResponse(
        "Certaines créations n'ont pas de prix défini",
        { status: 400 }
      );
    }

    // Créer des commandes temporaires (pending)
    const reservations = await Promise.all(
      items.map(async (item: any) => {
        const creation = creations.find(
          (c) => c._id.toString() === item.creationId
        );
        if (!creation) throw new Error("Création introuvable");

        return await Reservation.create({
          creationId: item.creationId,
          userId: (session.user as any).id,
          name: session.user?.name || "",
          contact: session.user?.email || "",
          status: "pending",
          paymentStatus: "pending",
          deliveryMode,
        });
      })
    );

    // Préparer les line items pour Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      creations.map((creation) => {
        const item = items.find(
          (i: any) => i.creationId === creation._id.toString()
        );
        return {
          price_data: {
            currency: "eur",
            product_data: {
              name: creation.title,
              description: creation.color
                ? `Couleur: ${creation.color}`
                : undefined,
              images:
                creation.images && creation.images.length > 0
                  ? [creation.images[0]]
                  : creation.imageUrl
                  ? [creation.imageUrl]
                  : undefined,
            },
            unit_amount: Math.round((creation.price || 0) * 100), // Convertir en centimes
          },
          quantity: 1,
        };
      });

    // Ajouter les frais de livraison si mode "shipping"
    if (deliveryMode === "shipping" && shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: "Frais de livraison",
            description: "Envoi postal",
          },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    // Détecter si on est en développement (localhost)
    const isDevelopment = process.env.NODE_ENV === "development" || 
                          !process.env.NEXT_PUBLIC_APP_URL || 
                          process.env.NEXT_PUBLIC_APP_URL.includes("localhost");
    const appUrl = isDevelopment 
      ? "http://localhost:3000" 
      : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

    // Créer la session Stripe Checkout
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      customer_email: session.user.email,
      metadata: {
        userId: (session.user as any).id,
        reservationIds: JSON.stringify(
          reservations.map((r) => r._id.toString())
        ),
        deliveryMode,
      },
    });

    // Mettre à jour les réservations avec l'ID de la session Stripe
    await Promise.all(
      reservations.map((reservation) =>
        Reservation.findByIdAndUpdate(reservation._id, {
          stripeCheckoutSessionId: checkoutSession.id,
        })
      )
    );

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("Erreur lors de la création de la session Stripe:", err);
    return new NextResponse(
      err.message || "Server error",
      { status: 500 }
    );
  }
}
