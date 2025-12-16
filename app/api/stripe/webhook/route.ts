import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import Stripe from "stripe";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { revalidatePath } from "next/cache";

function getStripeInstance() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY n'est pas configurée. Veuillez l'ajouter dans votre fichier .env.local"
    );
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-11-17.clover",
  });
}

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

    // Gérer l'événement checkout.session.completed
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      
      // Récupérer la session complète avec toutes les informations (y compris shipping)
      const fullSession = await stripe.checkout.sessions.retrieve(session.id);

      // ⚠️ VÉRIFICATION CRITIQUE : Ne traiter que les paiements réellement validés
      // Stripe envoie checkout.session.completed même si le paiement est annulé
      if (fullSession.payment_status !== "paid" || fullSession.status !== "complete") {
        console.log(`[WEBHOOK] Session ${fullSession.id} ignorée : payment_status=${fullSession.payment_status}, status=${fullSession.status}`);
        return new NextResponse("OK", { status: 200 });
      }

      const paymentIntentId = fullSession.payment_intent as string;
      
      // Vérification supplémentaire : vérifier le statut du PaymentIntent
      if (paymentIntentId) {
        try {
          const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
          if (paymentIntent.status !== "succeeded") {
            console.log(`[WEBHOOK] Session ${fullSession.id} ignorée : PaymentIntent ${paymentIntentId} status=${paymentIntent.status} (attendu: succeeded)`);
            return new NextResponse("OK", { status: 200 });
          }
        } catch (err) {
          console.error(`[WEBHOOK] Erreur lors de la vérification du PaymentIntent ${paymentIntentId}:`, err);
          // En cas d'erreur, on ne traite pas la commande par sécurité
          return new NextResponse("OK", { status: 200 });
        }
      }

      // Récupérer les IDs des réservations depuis les metadata
      const reservationIds = fullSession.metadata?.reservationIds
        ? JSON.parse(fullSession.metadata.reservationIds)
        : [];

      if (reservationIds.length === 0) {
        console.error("Aucune réservation trouvée dans les metadata");
        return new NextResponse("OK", { status: 200 });
      }

      // Mettre à jour les réservations
      const reservations = await Reservation.find({
        _id: { $in: reservationIds },
      });

      // Récupérer le mode de livraison et les frais de livraison depuis les metadata
      const deliveryMode = fullSession.metadata?.deliveryMode || "pickup";
      const totalShippingCost = fullSession.metadata?.shippingCost 
        ? parseFloat(fullSession.metadata.shippingCost) 
        : 0;
      
      // Récupérer l'adresse de livraison depuis Stripe
      // Essayer d'abord dans la Checkout Session (shipping_details)
      let shippingInfo = (fullSession as any).shipping_details || (fullSession as any).shipping;
      
      // Si pas trouvé dans la session, essayer dans le PaymentIntent
      if (!shippingInfo?.address && paymentIntentId) {
        try {
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
      if (fullSession.metadata?.deliveryMode === "shipping") {
        console.log("=== DEBUG ADRESSE LIVRAISON (WEBHOOK) ===");
        console.log("Session ID:", fullSession.id);
        console.log("Payment Intent ID:", paymentIntentId);
        console.log("Shipping details (session):", (fullSession as any).shipping_details);
        console.log("Shipping (session):", (fullSession as any).shipping);
        console.log("Shipping info final:", shippingInfo);
        console.log("Adresse de livraison récupérée:", shippingAddress ? "OUI" : "NON");
        if (shippingAddress) {
          console.log("Détails:", JSON.stringify(shippingAddress, null, 2));
        } else {
          console.log("⚠️  ATTENTION: Adresse non trouvée dans la session ni dans le PaymentIntent");
        }
        console.log("==========================================");
      }

      // Traiter toutes les réservations d'abord
      const processedReservations: any[] = [];
      const processedCreations: any[] = [];
      
      await Promise.all(
        reservations.map(async (reservation, index) => {
          // Protection contre les appels concurrents et les doubles traitements
          // Utiliser findOneAndUpdate avec condition pour s'assurer qu'on ne traite qu'une seule fois
          const now = new Date();
          const updatedReservation = await Reservation.findOneAndUpdate(
            {
              _id: reservation._id,
              paymentStatus: "pending", // Seulement si encore pending
            },
            {
              $set: {
                stripePaymentIntentId: paymentIntentId,
                stripeCustomerId: fullSession.customer as string,
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

          // Si updatedReservation est null, c'est que la réservation a déjà été traitée
          if (!updatedReservation) {
            console.log(`[WEBHOOK] Réservation ${reservation._id} déjà traitée, skip`);
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
        const deliveryLabel = deliveryMode === "shipping" ? "Livraison postale" : "Remise en main propre";

        // Détecter l'URL de base
        const headersList = await headers();
        const host = headersList.get("host") || "";
        const protocol = headersList.get("x-forwarded-proto") || 
                       (host.includes("localhost") ? "http" : "https");
        
        let appUrl: string;
        
        if (host && (host.includes("localhost") || host.includes("127.0.0.1"))) {
          appUrl = "http://localhost:3000";
        } else if (host) {
          appUrl = `${protocol}://${host}`;
        } else {
          appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.maillemum.fr";
        }

        // Calculer les totaux
        const subtotal = processedCreations.reduce((sum, creation) => sum + (creation.price || 0), 0);
        const shippingCost = deliveryMode === "shipping" ? totalShippingCost : 0;
        const total = subtotal + shippingCost;
        
        // Générer le HTML pour tous les articles du résumé
        const orderSummaryItems = processedCreations.map((creation) => {
          const productImage = (Array.isArray(creation.images) && creation.images.length > 0 ? creation.images[0] : creation.imageUrl) ?? null;
          const priceLabel = creation.price != null ? `${creation.price.toFixed(2)} €` : "Prix sur demande";

          return `
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:12px 0;">
                <div style="display:flex;gap:12px;align-items:center;">
                  ${productImage ? `<img src="${productImage}" alt="${creation.title}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
                  <div style="flex:1;">
                    <p style="margin:0 0 4px 0;font-weight:600;font-size:14px;color:#0f172a;">${creation.title}</p>
                    ${creation.color ? `<p style="margin:0;font-size:12px;color:#64748b;">Couleur : ${creation.color}</p>` : ""}
                  </div>
                </div>
              </td>
              <td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">
                ${priceLabel}
              </td>
            </tr>
          `;
        }).join('');

        // Générer le résumé de commande complet
        const orderSummaryHTML = `
          <div style="margin:24px 0;padding:20px;background:#f8fafc;border-radius:12px;border:1px solid #e5e7eb;">
            <h2 style="font-size:16px;font-weight:700;margin:0 0 16px 0;color:#0f172a;">Résumé de votre commande</h2>
            
            <table style="width:100%;border-collapse:collapse;">
              ${orderSummaryItems}
              
              ${shippingCost > 0 ? `
              <tr style="border-bottom:1px solid #e5e7eb;">
                <td style="padding:12px 0;">
                  <p style="margin:0;font-weight:600;font-size:14px;color:#0f172a;">Frais de livraison</p>
                </td>
                <td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">
                  ${shippingCost.toFixed(2)} €
                </td>
              </tr>
              ` : ''}
              
              <tr>
                <td style="padding:16px 0 0 0;">
                  <p style="margin:0;font-weight:700;font-size:16px;color:#0f172a;">Total</p>
                </td>
                <td style="padding:16px 0 0 0;text-align:right;">
                  <p style="margin:0;font-weight:700;font-size:16px;color:#0f172a;">${total.toFixed(2)} €</p>
                </td>
              </tr>
            </table>
            
            <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px 0;font-size:12px;color:#64748b;">
                <strong style="color:#0f172a;">Email de confirmation :</strong> 
                <a href="mailto:${firstReservation.contact}" style="color:#3b82f6;text-decoration:underline;">${firstReservation.contact}</a>
              </p>
              <p style="margin:0;font-size:12px;color:#64748b;">
                <strong style="color:#0f172a;">Numéro de commande :</strong> 
                <a href="${appUrl}/account/orders" style="color:#3b82f6;text-decoration:underline;font-family:monospace;word-break:break-all;">${firstReservation.stripeCheckoutSessionId || firstReservation._id}</a>
              </p>
            </div>
          </div>
        `;

        // Envoyer l'email à l'acheteur
        try {
          await sendEmail({
            to: firstReservation.contact,
            subject: `🎉 Paiement confirmé - Votre commande chez MailleMum`,
            html: emailTemplate(`
              <h1 style="font-size:24px;font-weight:700;margin:0 0 12px 0;color:#0f172a;">Paiement confirmé 🎉</h1>
              <p style="font-size:15px;margin:0 0 24px 0;color:#475569;line-height:1.6;">
                Bonjour <strong style="color:#0f172a;">${firstReservation.name || "👋"}</strong>,<br/>
                Votre paiement a été confirmé avec succès. Votre commande est en cours de préparation.
              </p>

              ${orderSummaryHTML}

              <div style="margin-top:24px;padding-top:20px;border-top:1px solid #e5e7eb;">
                <p style="font-size:13px;margin:0 0 12px 0;color:#64748b;">
                  Vous pouvez consulter vos commandes à tout moment depuis votre espace :
                </p>
                <a href="${appUrl}/account/orders" style="display:inline-block;background:#0f172a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Voir mes commandes</a>
              </div>
            `),
          });
          console.log("[WEBHOOK] Email de confirmation groupé envoyé à l'acheteur:", firstReservation.contact);
        } catch (emailError: any) {
          console.error("[WEBHOOK] Erreur lors de l'envoi de l'email groupé:", emailError?.message || emailError);
        }

        // Envoyer l'email au vendeur
        if (process.env.SELLER_EMAIL) {
          await new Promise(resolve => setTimeout(resolve, 500));
          try {
            const sellerItemsHTML = processedCreations.map((creation) => {
              const productImage = (Array.isArray(creation.images) && creation.images.length > 0 ? creation.images[0] : creation.imageUrl) ?? null;
              const priceLabel = creation.price != null ? `${creation.price} €` : "Prix sur demande";

              return `
                <div style="margin-top:12px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
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
            console.error("[WEBHOOK] Erreur lors de l'envoi de l'email au vendeur:", emailError?.message || emailError);
          }
        }
      }

      // Invalider le cache
      revalidatePath("/");
      revalidatePath("/api/creations");
      revalidatePath("/account/orders");
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Erreur dans le webhook Stripe:", err);
    return new NextResponse(`Webhook Error: ${err.message}`, { status: 500 });
  }
}
