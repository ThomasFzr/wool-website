import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { checkAdminAuth } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/revalidate";
import { escapeHtml } from "@/lib/escape";
import { releaseCreationOfReservation } from "@/lib/creation-lock";

// Whitelist des champs modifiables par le PATCH admin (anti mass assignment :
// on ne passe jamais le body entier à findByIdAndUpdate)
const UPDATABLE_FIELDS = [
  "status",
  "trackingNumber",
  "shippedAt",
  "cancelReason",
  "deliveryMode",
  "shippingCost",
  "seenByAdmin",
  "name",
  "contact",
  "message",
] as const;

type AdminRouteContext = {
  params: Promise<{ id: string }>;
};


export async function PATCH(req: Request, context: AdminRouteContext) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();
    const body = await req.json();

    const { id } = await context.params; // ✅ ici

    // Statut précédent : les effets de bord (vente, emails) ne doivent se produire
    // que lors d'un vrai changement de statut, pas à chaque PATCH répété
    const previous = await Reservation.findById(id).select("status").lean<{ status?: string } | null>();
    if (!previous) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const statusChanged = body.status !== undefined && body.status !== previous.status;

    // Préparer les mises à jour (champs whitelistés uniquement)
    const updates: any = {};
    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Si on passe à "shipped", enregistrer la date
    if (body.status === "shipped" && !body.shippedAt) {
      updates.shippedAt = new Date();
    }

    const reservation = await Reservation.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true }
    ).populate("creationId");

    if (!reservation)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const creation: any = reservation.creationId;
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL;

    // Données utilisateur échappées avant interpolation dans les emails
    const safeName = escapeHtml(reservation.name);
    const safeContact = escapeHtml(reservation.contact);
    const safeTitle = escapeHtml(creation?.title);
    const safeColor = escapeHtml(creation?.color);

    const productImage =
      (Array.isArray(creation?.images) && creation.images.length > 0
        ? creation.images[0]
        : creation?.imageUrl) ?? null;

    const priceLabel =
      creation?.price != null ? `${creation.price} €` : "Prix sur demande";

    /* -----------------------------
       ✅ PASSAGE EN "validated" ou "preparing"
    ------------------------------*/
    if ((body.status === "validated" || body.status === "preparing") && creation && statusChanged) {
      // Atomique + conditionnel : salesCount ne s'incrémente qu'une seule fois par article
      // (des changements de statut répétés ne gonflent plus les stats de ventes)
      await Creation.findOneAndUpdate(
        { _id: creation._id, sold: { $ne: true } },
        {
          $set: { sold: true },
          $inc: { salesCount: 1 },
        }
      );

      // 🔄 Invalider le cache après validation de la vente
      revalidateCatalog();

      // Vérifier les préférences de notification de l'utilisateur
      const user = await User.findOne({ email: reservation.contact });
      const shouldSendEmail = user?.emailNotifications !== false;

      const emails: Promise<unknown>[] = [];

      // 📧 Email de confirmation à l'acheteur
      if (shouldSendEmail) {
        emails.push(sendEmail({
        to: reservation.contact,
        subject: "🎉 Votre commande a été validée",
        html: emailTemplate(`
            <h1 style="font-size:20px;margin:0 0 12px 0;">Bonne nouvelle 🎉</h1>
            <p style="font-size:14px;margin:0 0 16px 0;">
              Bonjour <strong>${safeName}</strong>,<br/>
              Votre commande a été <strong>validée</strong> ! Nous allons revenir vers vous pour finaliser la livraison.
            </p>

            <div style="margin-top:16px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
              ${productImage
            ? `<img src="${productImage}" alt="${safeTitle}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
            : ""
          }
              <div style="font-size:13px;flex:1;">
                <p style="margin:0 0 4px 0;font-weight:600;">${safeTitle}</p>
                ${creation.color
            ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${safeColor}</strong></p>`
            : ""
          }
                <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
              </div>
            </div>

            <p style="font-size:12px;margin-top:20px;color:#6b7280;">
              Vous pouvez retrouver cette commande dans :<br/>
              <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Mes commandes</a>
            </p>
        `),
        }));
      }

      // 📧 Email au vendeur
      if (process.env.SELLER_EMAIL) {
        emails.push(sendEmail({
          to: process.env.SELLER_EMAIL,
          subject: `✅ Commande validée : ${creation.title}`,
          html: emailTemplate(`
              <h1 style="font-size:18px;margin:0 0 12px 0;">Commande validée</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                La commande de <strong>${safeName}</strong> (${safeContact}) a été <strong>validée</strong>.
              </p>

              <div style="margin-top:12px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
                ${productImage
              ? `<img src="${productImage}" alt="${safeTitle}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
              : ""
            }
                <div style="font-size:13px;flex:1;">
                  <p style="margin:0 0 4px 0;font-weight:600;">${safeTitle}</p>
                  ${creation.color
              ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${safeColor}</strong></p>`
              : ""
            }
                  <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                </div>
              </div>
          `),
        }));
      }

      // Un email en échec ne doit pas faire échouer le PATCH
      for (const r of await Promise.allSettled(emails)) {
        if (r.status === "rejected") console.error("[admin/reservations] Email non envoyé:", r.reason);
      }
    }

    /* -----------------------------
       ❌ PASSAGE EN "cancelled"
    ------------------------------*/
    if (body.status === "cancelled" && creation && statusChanged) {
      // L'article redevient disponible, sauf s'il a été revendu depuis
      // (ou si son verrou appartient à une autre réservation)
      if (await releaseCreationOfReservation({ ...reservation.toObject(), creationId: creation._id })) {
        revalidateCatalog();
      }

      // ✅ Marquer que c'est l'admin qui a annulé
      (reservation as any).cancelledBy = "admin";
      if (body.cancelReason) {
        (reservation as any).cancelReason = body.cancelReason;
      }
      await reservation.save();

      const safeReason = escapeHtml(
        (reservation as any).cancelReason ||
        body.cancelReason ||
        "Aucune raison précisée."
      );

      // Vérifier les préférences de notification de l'utilisateur
      const user = await User.findOne({ email: reservation.contact });
      const shouldSendEmail = user?.emailNotifications !== false;

      const emails: Promise<unknown>[] = [];

      // 📧 Email à l'acheteur
      if (shouldSendEmail) {
        emails.push(sendEmail({
        to: reservation.contact,
        subject: "❌ Votre commande a été annulée",
        html: emailTemplate(`
            <h1 style="font-size:20px;margin:0 0 12px 0;">Commande annulée</h1>
            <p style="font-size:14px;margin:0 0 16px 0;">
              Bonjour <strong>${safeName}</strong>,<br/>
              Votre commande pour l'article suivant a été <strong>annulée par la créatrice</strong>.
            </p>

            <div style="margin-top:16px;border-radius:12px;border:1px solid #fee2e2;padding:12px;display:flex;gap:12px;background:#fef2f2;">
              ${productImage
            ? `<img src="${productImage}" alt="${safeTitle}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
            : ""
          }
              <div style="font-size:13px;flex:1;">
                <p style="margin:0 0 4px 0;font-weight:600;">${safeTitle}</p>
                ${creation.color
            ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${safeColor}</strong></p>`
            : ""
          }
                <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
              </div>
            </div>

            <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
              <p style="margin:0;font-size:13px;">${safeReason}</p>
            </div>
        `),
        }));
      }

      // 📧 Email au vendeur
      if (process.env.SELLER_EMAIL) {
        emails.push(sendEmail({
          to: process.env.SELLER_EMAIL,
          subject: `❌ Commande annulée : ${creation.title}`,
          html: emailTemplate(`
              <h1 style="font-size:18px;margin:0 0 12px 0;">Commande annulée</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                La commande de <strong>${safeName}</strong> (${safeContact}) a été <strong>annulée</strong>.
              </p>

              <div style="margin-top:12px;border-radius:12px;border:1px solid #fee2e2;padding:12px;display:flex;gap:12px;background:#fef2f2;">
                ${productImage
              ? `<img src="${productImage}" alt="${safeTitle}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
              : ""
            }
                <div style="font-size:13px;flex:1;">
                  <p style="margin:0 0 4px 0;font-weight:600;">${safeTitle}</p>
                  ${creation.color
              ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${safeColor}</strong></p>`
              : ""
            }
                  <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                </div>
              </div>

              <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
                <p style="margin:0;font-size:13px;">${safeReason}</p>
              </div>
          `),
        }));
      }

      // Un email en échec ne doit pas faire échouer le PATCH
      for (const r of await Promise.allSettled(emails)) {
        if (r.status === "rejected") console.error("[admin/reservations] Email non envoyé:", r.reason);
      }
    }

    return NextResponse.json(reservation);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: AdminRouteContext
) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const { id } = await context.params; // ✅ ici aussi

    const reservation = await Reservation.findById(id);

    if (!reservation) {
      return new NextResponse("Reservation not found", { status: 404 });
    }

    await Reservation.findByIdAndDelete(id);

    // Une commande déjà annulée a déjà rendu sa pièce : on n'y touche plus.
    // Sinon, remise en vente sauf si la pièce a été revendue depuis.
    if (reservation.status !== "cancelled" && (await releaseCreationOfReservation(reservation))) {
      revalidateCatalog();
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}