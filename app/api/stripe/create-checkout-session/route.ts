import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { getAppUrl } from "@/lib/url";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import Settings from "@/models/Settings";
import User from "@/models/User";
import mongoose from "mongoose";
import Stripe from "stripe";

type DeliveryMode = "pickup" | "shipping";

// Durée de vie de la session Checkout : 30 minutes (minimum autorisé par Stripe),
// + 60 s de marge contre une dérive d'horloge. Le webhook `checkout.session.expired`
// libère les articles réservés si le paiement n'aboutit pas.
const CHECKOUT_SESSION_TTL_SECONDS = 30 * 60 + 60;

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

    // 🔒 Articles UNIQUES : réserver ATOMIQUEMENT chaque création avant de créer
    // la session de paiement. La condition `sold/reserved: { $ne: true }` garantit
    // qu'un seul client à la fois peut engager le paiement d'un article donné
    // (même sémantique que la route de réservation manuelle).
    const reservedCreationIds: string[] = [];

    // Nettoyage en cas d'échec en aval : libère les articles réservés par CETTE requête
    const releaseReservedCreations = async () => {
      if (reservedCreationIds.length === 0) return;
      try {
        await Creation.updateMany(
          { _id: { $in: reservedCreationIds }, sold: { $ne: true } },
          {
            $set: { reserved: false },
            $unset: { reservedName: "", reservedContact: "", reservedAt: "" },
          }
        );
      } catch (releaseErr) {
        console.error(
          "[CHECKOUT] Échec de la libération des créations réservées:",
          releaseErr
        );
      }
    };

    let unavailableCreation: any = null;
    // Sessions Checkout précédentes du même acheteur à invalider (retry après abandon)
    const staleSessionIds = new Set<string>();

    for (const creation of creations) {
      let lockedCreation = await Creation.findOneAndUpdate(
        {
          _id: creation._id,
          sold: { $ne: true },
          reserved: { $ne: true },
        },
        {
          $set: {
            reserved: true,
            reservedAt: new Date(),
            reservedName: session.user?.name || "",
            reservedContact: session.user.email,
          },
        }
      );

      if (!lockedCreation) {
        // Article déjà verrouillé. Cas particulier : c'est CE client qui l'a
        // verrouillé via un checkout précédent abandonné (retour navigateur) —
        // sans cela il resterait bloqué jusqu'à l'expiration Stripe (~30 min).
        // On ne re-verrouille que si le verrou vient bien d'un checkout Stripe
        // de ce client (jamais par-dessus une réservation manuelle).
        const ownCheckoutLock = await Reservation.exists({
          creationId: creation._id,
          contact: session.user.email,
          paymentStatus: "pending",
          status: { $ne: "cancelled" },
          stripeCheckoutSessionId: { $exists: true, $ne: null },
        });

        if (ownCheckoutLock) {
          lockedCreation = await Creation.findOneAndUpdate(
            {
              _id: creation._id,
              sold: { $ne: true },
              reserved: true,
              reservedContact: session.user.email,
            },
            { $set: { reservedAt: new Date() } }
          );

          if (lockedCreation) {
            // Invalider les anciennes réservations pending de ce client sur cet article
            const staleReservations = await Reservation.find({
              creationId: creation._id,
              contact: session.user.email,
              paymentStatus: "pending",
              status: { $ne: "cancelled" },
              stripeCheckoutSessionId: { $exists: true, $ne: null },
            }).select("stripeCheckoutSessionId");

            staleReservations.forEach((r: any) => {
              if (r.stripeCheckoutSessionId) staleSessionIds.add(r.stripeCheckoutSessionId);
            });

            await Reservation.updateMany(
              {
                creationId: creation._id,
                contact: session.user.email,
                paymentStatus: "pending",
                status: { $ne: "cancelled" },
                stripeCheckoutSessionId: { $exists: true, $ne: null },
              },
              {
                $set: {
                  status: "cancelled",
                  paymentStatus: "failed",
                  cancelReason: "Remplacée par une nouvelle session de paiement",
                },
              }
            );
          }
        }
      }

      if (!lockedCreation) {
        // Déjà réservé ou vendu par quelqu'un d'autre
        unavailableCreation = creation;
        break;
      }
      reservedCreationIds.push(creation._id.toString());
    }

    // Expirer les anciennes sessions Stripe remplacées (best effort : empêche
    // un double paiement si l'ancienne session est encore ouverte dans un onglet)
    for (const staleId of staleSessionIds) {
      try {
        await stripe.checkout.sessions.expire(staleId);
      } catch {
        // Session déjà expirée/complétée : rien à faire
      }
    }

    if (unavailableCreation) {
      await releaseReservedCreations();
      return new NextResponse(
        `L'article « ${unavailableCreation.title} » n'est plus disponible (déjà réservé ou vendu). Veuillez le retirer de votre panier.`,
        { status: 409 }
      );
    }

    // Les frais de livraison sont un montant total pour la commande, pas par article
    // On met le total sur le premier article uniquement
    const totalShippingCost = deliveryMode === "shipping" ? shippingCost : 0;

    // Préparer les line items pour Stripe
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      creations.map((creation) => {
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

    // URL de base (NEXT_PUBLIC_APP_URL prioritaire, fallback sur les headers)
    const appUrl = getAppUrl(req.headers);

    // Pré-générer les IDs des réservations : la session Stripe est créée AVANT
    // les réservations (évite les réservations orphelines sans sessionId si
    // l'appel Stripe échoue), mais ses metadata référencent déjà leurs IDs.
    const reservationDocs = items.map((item: any, index: number) => ({
      _id: new mongoose.Types.ObjectId(),
      creationId: item.creationId,
      userId: (session.user as any).id,
      name: session.user?.name || "",
      contact: session.user?.email || "",
      status: "preparing",
      paymentStatus: "pending",
      deliveryMode,
      // Mettre les frais de livraison uniquement sur le premier article
      shippingCost: index === 0 ? totalShippingCost : 0,
    }));

    // Créer la session Stripe Checkout
    let checkoutSession: Stripe.Checkout.Session;
    try {
      checkoutSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/checkout/cancel`,
        customer_email: session.user.email,
        // Expiration courte : les articles uniques ne restent pas bloqués ;
        // le webhook `checkout.session.expired` libère les réservations.
        expires_at: Math.floor(Date.now() / 1000) + CHECKOUT_SESSION_TTL_SECONDS,
        // Collecter l'adresse de livraison si mode shipping
        ...(deliveryMode === "shipping" && {
          shipping_address_collection: {
            allowed_countries: ["FR", "BE", "CH", "LU", "MC"],
          },
        }),
        metadata: {
          userId: (session.user as any).id,
          reservationIds: JSON.stringify(
            reservationDocs.map((r) => r._id.toString())
          ),
          deliveryMode,
          shippingCost: shippingCost.toString(),
        },
      });
    } catch (stripeErr) {
      // Stripe a échoué : libérer les articles réservés
      await releaseReservedCreations();
      throw stripeErr;
    }

    // Créer les réservations "pending", déjà rattachées à la session Stripe
    try {
      await Reservation.insertMany(
        reservationDocs.map((doc) => ({
          ...doc,
          stripeCheckoutSessionId: checkoutSession.id,
        }))
      );
    } catch (dbErr) {
      // Nettoyage : supprimer les réservations éventuellement créées,
      // libérer les articles et expirer la session Stripe (best effort)
      try {
        await Reservation.deleteMany({
          _id: { $in: reservationDocs.map((doc) => doc._id) },
        });
      } catch (deleteErr) {
        console.error("[CHECKOUT] Échec du nettoyage des réservations:", deleteErr);
      }
      await releaseReservedCreations();
      try {
        await stripe.checkout.sessions.expire(checkoutSession.id);
      } catch (expireErr) {
        console.error("[CHECKOUT] Échec de l'expiration de la session Stripe:", expireErr);
      }
      throw dbErr;
    }

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("Erreur lors de la création de la session Stripe:", err);
    return new NextResponse(
      err.message || "Server error",
      { status: 500 }
    );
  }
}
