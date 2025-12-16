import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
import User from "@/models/User";
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

    // Récupérer les frais de livraison et les conditions depuis les settings
    const settings = await Settings.findById("main").lean() as { 
      shippingCost?: number;
      pickupConditions?: {
        enabled?: boolean;
        minimumAmount?: number;
        allowedPostalCodes?: string[];
        message?: string;
      };
    } | null;
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

    // Calculer le total de la commande
    const totalPrice = creations.reduce((sum, c) => sum + (c.price || 0), 0);

    // Vérifier les conditions pour la remise en main propre
    if (deliveryMode === "pickup" && settings?.pickupConditions?.enabled) {
      const conditions = settings.pickupConditions;
      
      // Vérifier le montant minimum
      if (conditions.minimumAmount && conditions.minimumAmount > 0 && totalPrice < conditions.minimumAmount) {
        return new NextResponse(
          `Le montant minimum de ${conditions.minimumAmount.toFixed(2)} € est requis pour la remise en main propre`,
          { status: 400 }
        );
      }

      // Vérifier les codes postaux autorisés
      if (conditions.allowedPostalCodes && conditions.allowedPostalCodes.length > 0) {
        // Récupérer le code postal de l'utilisateur
        const user = await User.findOne({ email: session.user.email }).select("postalCode").lean() as { postalCode?: string } | null;
        const userPostalCode = user?.postalCode;

        if (!userPostalCode) {
          return new NextResponse(
            "Veuillez renseigner votre code postal dans votre profil pour utiliser la remise en main propre",
            { status: 400 }
          );
        }

        // Normaliser le code postal
        const normalizedUserCode = userPostalCode.trim().toUpperCase();
        const normalizedAllowedCodes = conditions.allowedPostalCodes.map(code => code.trim().toUpperCase());

        // Vérifier si le code postal correspond
        const isAllowed = normalizedAllowedCodes.some(allowedCode => {
          // Correspondance exacte
          if (normalizedUserCode === allowedCode) return true;
          // Correspondance partielle (si le code autorisé est un préfixe)
          if (normalizedUserCode.startsWith(allowedCode)) return true;
          // Correspondance partielle inverse (si le code de l'utilisateur est un préfixe du code autorisé)
          if (allowedCode.startsWith(normalizedUserCode)) return true;
          return false;
        });

        if (!isAllowed) {
          return new NextResponse(
            `La remise en main propre n'est pas disponible pour le code postal ${userPostalCode}. Codes autorisés : ${conditions.allowedPostalCodes.join(", ")}`,
            { status: 400 }
          );
        }
      }
    }

    // Les frais de livraison sont un montant total pour la commande, pas par article
    // On met le total sur le premier article uniquement
    const totalShippingCost = deliveryMode === "shipping" ? shippingCost : 0;

    // Créer des commandes temporaires (pending)
    const reservations = await Promise.all(
      items.map(async (item: any, index: number) => {
        const creation = creations.find(
          (c) => c._id.toString() === item.creationId
        );
        if (!creation) throw new Error("Création introuvable");

        return await Reservation.create({
          creationId: item.creationId,
          userId: (session.user as any).id,
          name: session.user?.name || "",
          contact: session.user?.email || "",
          status: "preparing",
          paymentStatus: "pending",
          deliveryMode,
          // Mettre les frais de livraison uniquement sur le premier article
          shippingCost: index === 0 ? totalShippingCost : 0,
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

    // Détecter l'URL de base depuis la requête actuelle
    // Cela permet d'utiliser automatiquement le bon domaine (staging, production, localhost)
    const host = req.headers.get("host") || "";
    const protocol = req.headers.get("x-forwarded-proto") || 
                     (host.includes("localhost") ? "http" : "https");
    
    // Construire l'URL de base
    let appUrl: string;
    
    if (host.includes("localhost") || host.includes("127.0.0.1")) {
      // Développement local
      appUrl = "http://localhost:3000";
    } else {
      // Production ou staging - utiliser le domaine de la requête
      appUrl = `${protocol}://${host}`;
    }

    // Créer la session Stripe Checkout
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      customer_email: session.user.email,
      // Collecter l'adresse de livraison si mode shipping
      ...(deliveryMode === "shipping" && {
        shipping_address_collection: {
          allowed_countries: ["FR", "BE", "CH", "LU", "MC"],
        },
      }),
      metadata: {
        userId: (session.user as any).id,
        reservationIds: JSON.stringify(
          reservations.map((r) => r._id.toString())
        ),
        deliveryMode,
        shippingCost: shippingCost.toString(),
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
