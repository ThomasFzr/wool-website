import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";

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

    // Récupérer la session Stripe complète avec toutes les informations
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    // Vérifier que la session appartient à l'utilisateur
    if (checkoutSession.customer_email !== session.user.email) {
      return NextResponse.json({ valid: false }, { status: 403 });
    }

    // ⚠️ VÉRIFICATION CRITIQUE : Ne traiter que les paiements réellement validés
    // Vérifier que le paiement a été complété
    let isValid =
      checkoutSession.payment_status === "paid" &&
      checkoutSession.status === "complete";

    // Vérification supplémentaire : vérifier le statut du PaymentIntent
    if (isValid && checkoutSession.payment_intent) {
      try {
        const paymentIntentId = checkoutSession.payment_intent as string;
        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (paymentIntent.status !== "succeeded") {
          console.log(`[VERIFY-SESSION] PaymentIntent ${paymentIntentId} status=${paymentIntent.status} (attendu: succeeded)`);
          isValid = false;
        }
      } catch (err) {
        console.error(`[VERIFY-SESSION] Erreur lors de la vérification du PaymentIntent:`, err);
        isValid = false;
      }
    }

    // Log pour déboguer
    console.log(`[VERIFY-SESSION] Session ${checkoutSession.id}: payment_status=${checkoutSession.payment_status}, status=${checkoutSession.status}, isValid=${isValid}`);

    // Si le paiement n'est pas validé, ne rien faire
    if (!isValid) {
      console.log(`[VERIFY-SESSION] Session ${checkoutSession.id} ignorée : paiement non validé (payment_status=${checkoutSession.payment_status}, status=${checkoutSession.status})`);
      return NextResponse.json({ valid: false });
    }

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

        // Traiter toutes les réservations d'abord (mise à jour, etc.)
        const processedReservations: any[] = [];
        const processedCreations: any[] = [];
        
        await Promise.all(
          reservations.map(async (reservation: any, index: number) => {
            // Log pour déboguer
            console.log("[VERIFY-SESSION] Traitement réservation:", {
              reservationId: reservation._id.toString(),
              paymentStatus: reservation.paymentStatus,
              contact: reservation.contact,
            });

            // Vérifier si déjà traité
            if (reservation.paymentStatus === "paid") {
              console.log("[VERIFY-SESSION] Réservation déjà payée, email déjà envoyé par le webhook");
              // Ne pas renvoyer l'email si déjà payée (le webhook l'a déjà fait)
              // En local, si le webhook n'a pas fonctionné, l'email sera envoyé lors du premier passage
              return;
            }

            // Protection contre les appels concurrents : utiliser findOneAndUpdate avec condition
            // pour s'assurer qu'on ne traite qu'une seule fois
            const now = new Date();
            const updatedReservation = await Reservation.findOneAndUpdate(
              {
                _id: reservation._id,
                paymentStatus: "pending", // Seulement si encore pending
              },
              {
                $set: {
                  stripePaymentIntentId: checkoutSession.payment_intent as string,
                  stripeCustomerId: checkoutSession.customer as string,
                  paymentStatus: "paid",
                  status: "validated",
                  paidAt: now,
                  deliveryMode: deliveryMode,
                  shippingCost: deliveryMode === "shipping" && totalShippingCost > 0 && index === 0 ? totalShippingCost : 0,
                  ...(shippingAddress && { shippingAddress: shippingAddress }),
                },
              },
              { new: true } // Retourner le document mis à jour
            );

            // Si updatedReservation est null, c'est que la réservation a déjà été traitée par un autre appel
            if (!updatedReservation) {
              console.log("[VERIFY-SESSION] Réservation déjà traitée par un autre appel concurrent, skip");
              return;
            }

            // Utiliser la réservation mise à jour
            reservation = updatedReservation;

            // Mettre à jour la création - marquer comme vendue
            const creation = await Creation.findById(reservation.creationId);
            if (creation) {
              creation.sold = true;
              creation.salesCount = (creation.salesCount || 0) + 1;
              await creation.save();
              processedReservations.push(reservation);
              processedCreations.push(creation);
            }
          })
        );

        // Envoyer un seul email groupé avec tous les articles
        if (processedReservations.length > 0 && processedCreations.length > 0) {
          const firstReservation = processedReservations[0];
          const user = await User.findOne({ email: firstReservation.contact });
          const deliveryLabel = deliveryMode === "shipping" ? "Livraison postale" : "Remise en main propre";
          
          // Calculer le total
          const total = processedCreations.reduce((sum, creation) => sum + (creation.price || 0), 0) + (deliveryMode === "shipping" ? totalShippingCost : 0);

          // Générer le HTML pour tous les articles
          const itemsHTML = processedCreations.map((creation, index) => {
            const reservation = processedReservations[index];
            const productImage = (Array.isArray(creation.images) && creation.images.length > 0 ? creation.images[0] : creation.imageUrl) ?? null;
            const priceLabel = creation.price != null ? `${creation.price} €` : "Prix sur demande";

            return `
              <div style="margin-top:${index > 0 ? '16px' : '0'};border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
                ${productImage ? `<img src="${productImage}" alt="${creation.title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
                <div style="font-size:13px;flex:1;">
                  <p style="margin:0 0 4px 0;font-weight:600;">${creation.title}</p>
                  ${creation.color ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${creation.color}</strong></p>` : ""}
                  <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                  ${index === 0 ? `<p style="margin:0 0 4px 0;">📦 Mode de livraison : <strong>${deliveryLabel}</strong></p>` : ""}
                </div>
              </div>
            `;
          }).join('');

          // Envoyer l'email à l'acheteur
          try {
            await sendEmail({
              to: firstReservation.contact,
              subject: `🎉 Paiement confirmé - Votre commande de ${processedCreations.length} article${processedCreations.length > 1 ? 's' : ''} chez MailleMum`,
              html: emailTemplate(`
                <h1 style="font-size:20px;margin:0 0 12px 0;">Paiement confirmé 🎉</h1>
                <p style="font-size:14px;margin:0 0 16px 0;">
                  Bonjour <strong>${firstReservation.name || "👋"}</strong>,<br/>
                  Votre paiement a été confirmé avec succès. Votre commande de ${processedCreations.length} article${processedCreations.length > 1 ? 's' : ''} est en cours de préparation.
                </p>

                ${itemsHTML}

                <div style="margin-top:20px;padding-top:16px;border-top:2px solid #e5e7eb;">
                  <p style="margin:0;font-size:14px;font-weight:600;text-align:right;">
                    Total : <strong>${total.toFixed(2)} €</strong>
                  </p>
                </div>

                <p style="font-size:12px;margin-top:20px;color:#6b7280;">
                  Vous pouvez consulter vos commandes à tout moment depuis votre espace :
                  <br/>
                  <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Voir mes commandes</a>
                </p>
              `),
            });
            console.log("[VERIFY-SESSION] Email de confirmation groupé envoyé à l'acheteur:", firstReservation.contact);
          } catch (emailError: any) {
            console.error("[VERIFY-SESSION] Erreur lors de l'envoi de l'email groupé:", emailError?.message || emailError);
          }

          // Envoyer l'email au vendeur (avec tous les articles)
          if (process.env.SELLER_EMAIL) {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
              const sellerItemsHTML = processedCreations.map((creation, index) => {
                const reservation = processedReservations[index];
                const productImage = (Array.isArray(creation.images) && creation.images.length > 0 ? creation.images[0] : creation.imageUrl) ?? null;
                const priceLabel = creation.price != null ? `${creation.price} €` : "Prix sur demande";

                return `
                  <div style="margin-top:${index > 0 ? '12px' : '0'};border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
                    ${productImage ? `<img src="${productImage}" alt="${creation.title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
                    <div style="font-size:13px;flex:1;">
                      <p style="margin:0 0 4px 0;font-weight:600;">${creation.title}</p>
                      ${creation.color ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${creation.color}</strong></p>` : ""}
                      <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                    </div>
                  </div>
                `;
              }).join('');

              await sendEmail({
                to: process.env.SELLER_EMAIL,
                subject: `💳 Nouvelle commande : ${processedCreations.length} article${processedCreations.length > 1 ? 's' : ''}`,
                html: emailTemplate(`
                  <h1 style="font-size:18px;margin:0 0 12px 0;">Nouvelle commande confirmée</h1>
                  <p style="font-size:14px;margin:0 0 12px 0;">
                    <strong>${firstReservation.name}</strong> (${firstReservation.contact}) a effectué un paiement pour ${processedCreations.length} article${processedCreations.length > 1 ? 's' : ''} :
                  </p>

                  ${sellerItemsHTML}

                  <p style="font-size:12px;margin-top:20px;color:#6b7280;">
                    <a href="${appUrl}/admin/reservations" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gérer les commandes</a>
                  </p>
                `),
              });
            } catch (emailError: any) {
              console.error("[VERIFY-SESSION] Erreur lors de l'envoi de l'email au vendeur:", emailError?.message || emailError);
            }
          }
        }
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
