import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import CreationModel from "@/models/Creation";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/escape";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { reason } = await req.json();

    // 1️⃣ On récupère la réservation par ID
    const reservation = await Reservation.findById(id).populate("creationId");

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // 2️⃣ Vérif qu'elle appartient bien à l'utilisateur connecté
    const sessionUserId = (session.user as any).id;
    const sameUserId =
      reservation.userId &&
      reservation.userId.toString() === String(sessionUserId);

    const sameEmail = reservation.contact === session.user.email;

    if (!sameUserId && !sameEmail) {
      // l'utilisateur essaie d'annuler la réservation de quelqu'un d'autre
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3️⃣ Si déjà validée → on ne laisse plus annuler
    if (reservation.status === "validated") {
      return NextResponse.json(
        { error: "Cette commande est déjà validée, impossible de l'annuler." },
        { status: 400 }
      );
    }

    // 4️⃣ On annule + raison
    reservation.status = "cancelled";
    (reservation as any).cancelReason = reason ?? "";
    (reservation as any).cancelledBy = "user"; // ✅ C'est l'utilisateur qui annule
    await reservation.save();

    // 5️⃣ On libère la création si elle n'est pas vendue
    const creation: any = reservation.creationId;
    if (creation && !creation.sold) {
      // Condition sold côté requête : ne libère jamais un article vendu entre-temps
      await CreationModel.findOneAndUpdate(
        { _id: creation._id, sold: { $ne: true } },
        {
          $set: { reserved: false },
          $unset: {
            reservedName: "",
            reservedContact: "",
            reservedMessage: "",
            reservedAt: "",
          },
        }
      );
    }

    // 6️⃣ Emails (inchangé, j'utilise ta logique)
    if (creation) {
      // Vérifier les préférences de notification de l'utilisateur
      const user = await User.findOne({ email: session.user.email });
      const shouldSendEmail = user?.emailNotifications !== false;

      const appUrl = process.env.NEXT_PUBLIC_APP_URL;
      const productImage =
        (Array.isArray(creation.images) && creation.images.length > 0
          ? creation.images[0]
          : creation.imageUrl) ?? null;
      const priceLabel =
        creation.price != null ? `${creation.price} €` : "Prix sur demande";

      const displayedReason = escapeHtml(
        (reason && reason.trim().length > 0) ||
          ((reservation as any).cancelReason &&
            (reservation as any).cancelReason.trim().length > 0)
          ? (reason || (reservation as any).cancelReason)
          : "Aucune raison précisée."
      );
      const safeName = escapeHtml(reservation.name);
      const safeContact = escapeHtml(reservation.contact);

      // Les emails partent ensemble et ne font pas échouer la requête (sendEmail throw en cas d'erreur)
      const emails: Promise<unknown>[] = [];

      // 📧 Email à l'acheteur (c'est lui qui a annulé)
      if (shouldSendEmail) {
        emails.push(sendEmail({
        to: reservation.contact,
        subject: "❌ Vous avez annulé votre réservation",
        html: emailTemplate(`
            <h1 style="font-size:20px;margin:0 0 12px 0;">Votre réservation a été annulée</h1>
            <p style="font-size:14px;margin:0 0 16px 0;">
              Bonjour <strong>${safeName}</strong>,<br/>
              Vous avez annulé votre réservation pour l'article suivant :
            </p>

            <div style="margin-top:16px;border-radius:12px;border:1px solid #fee2e2;padding:12px;display:flex;gap:12px;background:#fef2f2;">
              ${productImage
            ? `<img src="${productImage}" alt="${creation.title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
            : ""
          }
              <div style="font-size:13px;flex:1;">
                <p style="margin:0 0 4px 0;font-weight:600;">${creation.title}</p>
                ${creation.color
            ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${creation.color}</strong></p>`
            : ""
          }
                <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
              </div>
            </div>

            <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
              <p style="margin:0;font-size:13px;">${displayedReason}</p>
            </div>

            <p style="font-size:12px;margin-top:20px;color:#6b7280;">
              Vous pouvez consulter l'historique de vos réservations ici :<br/>
              <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Mes réservations</a>
            </p>
        `),
        }));
      }

      // 📧 Email au vendeur (l'utilisateur a annulé)
      if (process.env.SELLER_EMAIL) {
        emails.push(sendEmail({
          to: process.env.SELLER_EMAIL,
          subject: `❌ Réservation annulée par l'acheteur : ${creation.title}`,
          html: emailTemplate(`
              <h1 style="font-size:18px;margin:0 0 12px 0;">Réservation annulée par l'acheteur</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                <strong>${safeName}</strong> (${safeContact}) a annulé sa réservation.
              </p>

              <div style="margin-top:12px;border-radius:12px;border:1px solid #fee2e2;padding:12px;display:flex;gap:12px;background:#fef2f2;">
                ${productImage
              ? `<img src="${productImage}" alt="${creation.title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
              : ""
            }
                <div style="font-size:13px;flex:1;">
                  <p style="margin:0 0 4px 0;font-weight:600;">${creation.title}</p>
                  ${creation.color
              ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${creation.color}</strong></p>`
              : ""
            }
                  <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                </div>
              </div>

              <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
                <p style="margin:0;font-size:13px;">${displayedReason}</p>
              </div>
          `),
        }));
      }

      const results = await Promise.allSettled(emails);
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("[cancel] Email non envoyé:", r.reason);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}