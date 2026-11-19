import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import { getStripeInstance } from "@/lib/stripe";
import { getAppUrl } from "@/lib/url";
import { isPostalCodeAllowed, normalizePostalCode } from "@/lib/postal-code";
import { releaseCreationLocks } from "@/lib/creation-lock";
import { revalidateCatalog } from "@/lib/revalidate";
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

/**
 * Expire une ancienne session Checkout. Renvoie son état final : "expired" si elle
 * ne peut plus être payée, "paid" si elle l'a été, "open" si son sort est inconnu.
 */
async function expireCheckoutSession(
  stripe: Stripe,
  sessionId: string
): Promise<"expired" | "paid" | "open"> {
  try {
    await stripe.checkout.sessions.expire(sessionId);
    return "expired";
  } catch (expireErr) {
    try {
      const stale = await stripe.checkout.sessions.retrieve(sessionId);
      if (stale.status === "expired") return "expired";
      if (stale.status === "complete") return "paid";
    } catch (retrieveErr) {
      console.error(`[CHECKOUT] Session ${sessionId} introuvable :`, retrieveErr);
    }
    console.error(`[CHECKOUT] Expiration de la session ${sessionId} impossible :`, expireErr);
    return "open";
  }
}

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
    // Une pièce cachée n'est pas en vente : traitée comme inexistante
    const creations = await Creation.find({ _id: mongoose.trusted({ $in: creationIds }), hidden: mongoose.trusted({ $ne: true }) });

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

        if (!normalizePostalCode(userPostalCode)) {
          return new NextResponse(
            "Veuillez renseigner votre code postal dans votre profil pour utiliser la remise en main propre",
            { status: 400 }
          );
        }

        const isAllowed = isPostalCodeAllowed(userPostalCode, conditions.allowedPostalCodes);

        if (!isAllowed) {
          return new NextResponse(
            `La remise en main propre n'est pas disponible pour le code postal ${userPostalCode}. Codes autorisés : ${conditions.allowedPostalCodes.join(", ")}`,
            { status: 400 }
          );
        }
      }
    }

    // Identifiants des futures réservations, générés AVANT le verrouillage : chaque
    // pièce est verrouillée au nom de SA réservation (reservedByReservationId), et
    // seule cette réservation pourra ensuite la libérer (lib/creation-lock.ts).
    const reservationIdByCreation = new Map<string, mongoose.Types.ObjectId>(
      creations.map((c) => [c._id.toString(), new mongoose.Types.ObjectId()])
    );

    // 🔒 Articles UNIQUES : réserver ATOMIQUEMENT chaque création avant de créer
    // la session de paiement. La condition `sold/reserved: { $ne: true }` garantit
    // qu'un seul client à la fois peut engager le paiement d'un article donné.
    const reservedCreationIds: string[] = [];

    // Nettoyage en cas d'échec en aval : libère les articles réservés par CETTE requête
    const releaseReservedCreations = async () => {
      if (reservedCreationIds.length === 0) return;
      try {
        await releaseCreationLocks(
          reservedCreationIds.map((creationId) => ({
            creationId,
            reservationId: reservationIdByCreation.get(creationId)!,
          }))
        );
      } catch (releaseErr) {
        console.error(
          "[CHECKOUT] Échec de la libération des créations réservées:",
          releaseErr
        );
      }
    };

    let unavailableCreation: any = null;
    // Ancienne session du même acheteur impossible à expirer (payée ou encore ouverte)
    let blocked: { creation: any; state: "paid" | "open" } | null = null;

    // Verrou posé au nom de l'acheteur et de SA réservation
    const buyerName = session.user?.name || "";
    const buyerEmail = session.user.email;
    const lockFields = (reservationId: mongoose.Types.ObjectId) => ({
      reserved: true,
      reservedAt: new Date(),
      reservedName: buyerName,
      reservedContact: buyerEmail,
      reservedByReservationId: reservationId,
    });

    for (const creation of creations) {
      const reservationId = reservationIdByCreation.get(creation._id.toString())!;
      let lockedCreation = await Creation.findOneAndUpdate(
        {
          _id: creation._id,
          sold: mongoose.trusted({ $ne: true }),
          reserved: mongoose.trusted({ $ne: true }),
          // Cachée entre-temps par l'admin : plus en vente
          hidden: mongoose.trusted({ $ne: true }),
        },
        { $set: lockFields(reservationId) }
      );

      if (!lockedCreation) {
        // Article déjà verrouillé. Cas particulier : c'est CE client qui l'a
        // verrouillé via un checkout précédent abandonné (retour navigateur) —
        // sans cela il resterait bloqué jusqu'à l'expiration Stripe (~30 min).
        // On ne reprend le verrou que s'il appartient à une réservation Stripe
        // en attente de ce client (jamais par-dessus une autre réservation).
        const staleReservations = await Reservation.find({
          creationId: creation._id,
          contact: session.user.email,
          paymentStatus: "pending",
          status: mongoose.trusted({ $ne: "cancelled" }),
          stripeCheckoutSessionId: mongoose.trusted({ $exists: true, $ne: null }),
        }).select("_id stripeCheckoutSessionId");
        const staleIds = staleReservations.map((r: any) => r._id);

        const ownStaleLock =
          staleIds.length > 0 &&
          (await Creation.exists({
            _id: creation._id,
            sold: mongoose.trusted({ $ne: true }),
            reserved: true,
            reservedByReservationId: mongoose.trusted({ $in: staleIds }),
          }));

        if (ownStaleLock) {
          // L'ancienne session doit être expirée AVANT d'invalider ses réservations :
          // si elle a été payée entre-temps (ou reste ouverte), on s'arrête là,
          // sinon le client serait débité sans commande puis une seconde fois.
          const staleSessionIds = new Set<string>(
            staleReservations.map((r: any) => r.stripeCheckoutSessionId).filter(Boolean)
          );
          for (const staleId of staleSessionIds) {
            const state = await expireCheckoutSession(stripe, staleId);
            if (state !== "expired") {
              blocked = { creation, state };
              break;
            }
          }
          if (blocked) break;

          await Reservation.updateMany(
            { _id: mongoose.trusted({ $in: staleIds }), paymentStatus: "pending" },
            {
              $set: {
                status: "cancelled",
                paymentStatus: "failed",
                cancelReason: "Remplacée par une nouvelle session de paiement",
              },
            }
          );

          // Reprise du verrou (ou nouveau verrou si l'expiration l'a déjà libéré)
          lockedCreation = await Creation.findOneAndUpdate(
            {
              _id: creation._id,
              sold: mongoose.trusted({ $ne: true }),
              $or: [{ reserved: mongoose.trusted({ $ne: true }) }, { reservedByReservationId: mongoose.trusted({ $in: staleIds }) }],
            },
            { $set: lockFields(reservationId) }
          );
        }
      }

      if (!lockedCreation) {
        // Déjà réservé ou vendu par quelqu'un d'autre
        unavailableCreation = creation;
        break;
      }
      reservedCreationIds.push(creation._id.toString());
    }

    if (blocked) {
      await releaseReservedCreations();
      const title = blocked.creation.title;
      return new NextResponse(
        blocked.state === "paid"
          ? `Un paiement a déjà été effectué pour « ${title} » : il est en cours d'enregistrement. Consultez vos commandes dans quelques instants.`
          : `Votre précédente session de paiement pour « ${title} » est encore ouverte. Réessayez dans quelques instants.`,
        { status: 409 }
      );
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
    const reservationDocs = creations.map((creation, index: number) => ({
      _id: reservationIdByCreation.get(creation._id.toString())!,
      creationId: creation._id,
      userId: (session.user as any).id,
      name: session.user?.name || "",
      contact: session.user.email,
      status: "preparing",
      paymentStatus: "pending",
      deliveryMode,
      // Prix payé, figé (le prix de la création peut changer ensuite)
      price: creation.price || 0,
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
          _id: mongoose.trusted({ $in: reservationDocs.map((doc) => doc._id) }),
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

    // Les pièces verrouillées apparaissent « Réservé » sur la vitrine
    revalidateCatalog();

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err: any) {
    console.error("Erreur lors de la création de la session Stripe:", err);
    // Message générique : le détail (Stripe, MongoDB) reste dans les journaux
    return new NextResponse(
      "Le paiement n'a pas pu être préparé. Réessayez dans quelques instants.",
      { status: 500 }
    );
  }
}
