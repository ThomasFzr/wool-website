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
    apiVersion: "2024-11-20.acacia",
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

      // Récupérer les IDs des réservations depuis les metadata
      const reservationIds = session.metadata?.reservationIds
        ? JSON.parse(session.metadata.reservationIds)
        : [];

      if (reservationIds.length === 0) {
        console.error("Aucune réservation trouvée dans les metadata");
        return new NextResponse("OK", { status: 200 });
      }

      // Mettre à jour les réservations
      const reservations = await Reservation.find({
        _id: { $in: reservationIds },
      });

      const paymentIntentId = session.payment_intent as string;

      await Promise.all(
        reservations.map(async (reservation) => {
          // Mettre à jour la réservation
          reservation.stripePaymentIntentId = paymentIntentId;
          reservation.stripeCustomerId = session.customer as string;
          reservation.paymentStatus = "paid";
          reservation.status = "validated";
          reservation.paidAt = new Date();
          await reservation.save();

          // Mettre à jour la création - marquer comme vendue
          const creation = await Creation.findById(reservation.creationId);
          if (creation) {
            creation.sold = true;
            creation.salesCount = (creation.salesCount || 0) + 1;
            await creation.save();
          }

          // Envoyer l'email de confirmation à l'acheteur
          const user = await User.findOne({ email: reservation.contact });
          const shouldSendEmail = user?.emailNotifications !== false;

          // Récupérer le mode de livraison depuis les metadata ou la réservation
          const deliveryMode = session.metadata?.deliveryMode || reservation.deliveryMode || "pickup";
          const deliveryLabel = deliveryMode === "shipping" ? "Livraison postale" : "Remise en main propre";

          if (shouldSendEmail && creation) {
            const productImage =
              (Array.isArray(creation.images) && creation.images.length > 0
                ? creation.images[0]
                : creation.imageUrl) ?? null;

            const priceLabel =
              creation.price != null
                ? `${creation.price} €`
                : "Prix sur demande";

            const appUrl = process.env.NEXT_PUBLIC_APP_URL;

            await sendEmail({
              to: reservation.contact,
              subject: "🎉 Paiement confirmé - Votre commande chez MailleMum",
              html: emailTemplate(`
                <h1 style="font-size:20px;margin:0 0 12px 0;">Paiement confirmé 🎉</h1>
                <p style="font-size:14px;margin:0 0 16px 0;">
                  Bonjour <strong>${reservation.name || "👋"}</strong>,<br/>
                  Votre paiement a été confirmé avec succès. Votre commande est en cours de préparation.
                </p>

                <div style="margin-top:16px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
                  ${
                    productImage
                      ? `<img src="${productImage}" alt="${creation.title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
                      : ""
                  }
                  <div style="font-size:13px;flex:1;">
                    <p style="margin:0 0 4px 0;font-weight:600;">${creation.title}</p>
                    ${
                      creation.color
                        ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${creation.color}</strong></p>`
                        : ""
                    }
                    <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                    <p style="margin:0 0 4px 0;">📦 Mode de livraison : <strong>${deliveryLabel}</strong></p>
                    <p style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">
                      Numéro de commande : ${reservation._id.toString().slice(-8)}
                    </p>
                  </div>
                </div>

                <p style="font-size:12px;margin-top:20px;color:#6b7280;">
                  Vous pouvez consulter vos commandes à tout moment depuis votre espace :
                  <br/>
                  <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Voir mes commandes</a>
                </p>
              `),
            });
          }

          // Envoyer l'email au vendeur
          if (process.env.SELLER_EMAIL && creation) {
            const productImage =
              (Array.isArray(creation.images) && creation.images.length > 0
                ? creation.images[0]
                : creation.imageUrl) ?? null;

            const priceLabel =
              creation.price != null
                ? `${creation.price} €`
                : "Prix sur demande";

            const appUrl = process.env.NEXT_PUBLIC_APP_URL;

            await sendEmail({
              to: process.env.SELLER_EMAIL,
              subject: `💳 Nouvelle commande : ${creation.title}`,
              html: emailTemplate(`
                <h1 style="font-size:18px;margin:0 0 12px 0;">Nouvelle commande confirmée</h1>
                <p style="font-size:14px;margin:0 0 12px 0;">
                  <strong>${reservation.name}</strong> (${reservation.contact}) a effectué un paiement pour :
                </p>

                <div style="margin-top:12px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
                  ${
                    productImage
                      ? `<img src="${productImage}" alt="${creation.title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
                      : ""
                  }
                  <div style="font-size:13px;flex:1;">
                    <p style="margin:0 0 4px 0;font-weight:600;">${creation.title}</p>
                    ${
                      creation.color
                        ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${creation.color}</strong></p>`
                        : ""
                    }
                    <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                    <p style="margin:0 0 4px 0;">📦 Mode de livraison : <strong>${deliveryLabel}</strong></p>
                    <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                      Paiement effectué le : ${new Date().toLocaleString("fr-FR")}
                    </p>
                    <p style="margin:4px 0 0 0;font-size:12px;color:#6b7280;">
                      ID de commande : ${reservation._id.toString()}
                    </p>
                  </div>
                </div>

                <p style="font-size:12px;margin-top:20px;color:#6b7280;">
                  <a href="${appUrl}/admin/reservations?creationId=${creation._id}" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gérer cette commande</a>
                </p>
              `),
            });
          }
        })
      );

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
