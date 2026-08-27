import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { escapeHtml } from "@/lib/escape";
import { revalidateCatalog } from "@/lib/revalidate";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    // 🔐 Vérifier si utilisateur loggé
    const session = await getServerSession(authOptions);

    if (!session || !session.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const { id } = await context.params;
    const creationId = id;

    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.slice(0, 100) : "";
    const message = typeof body.message === "string" ? body.message.slice(0, 1000) : "";
    // La confirmation part TOUJOURS vers l'email de la session (pas une adresse
    // arbitraire fournie par le client) — c'est aussi la clé utilisée par "mes commandes"
    const contact = session.user.email;

    // Réservation atomique : échoue si l'article est déjà réservé ou vendu
    // (évite que deux clients simultanés réservent la même pièce unique)
    const creation = await Creation.findOneAndUpdate(
      { _id: creationId, reserved: { $ne: true }, sold: { $ne: true } },
      {
        $set: {
          reserved: true,
          reservedName: name,
          reservedContact: contact,
          reservedMessage: message,
          reservedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!creation) {
      const exists = await Creation.exists({ _id: creationId });
      if (!exists) {
        return new NextResponse("Création introuvable", { status: 404 });
      }
      return new NextResponse("Déjà réservé", { status: 409 });
    }

    let reservation;
    try {
      reservation = await Reservation.create({
        creationId,
        userId: (session.user as any).id,
        name,
        contact,
        message,
        status: "preparing",
      });
    } catch (err) {
      // Libérer l'article si la réservation n'a pas pu être créée
      await Creation.findByIdAndUpdate(creationId, {
        $set: { reserved: false },
        $unset: { reservedName: "", reservedContact: "", reservedMessage: "", reservedAt: "" },
      });
      throw err;
    }

    // Vérifier les préférences de notification de l'utilisateur
    const user = await User.findOne({ email: session.user.email });
    const shouldSendEmail = user?.emailNotifications !== false;

    const productImage =
      (Array.isArray(creation.images) && creation.images.length > 0
        ? creation.images[0]
        : creation.imageUrl) ?? null;

    const priceLabel =
      creation.price != null ? `${creation.price} €` : "Prix sur demande";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    // Données utilisateur échappées avant interpolation dans le HTML des emails
    const safeName = escapeHtml(name);
    const safeContact = escapeHtml(contact);
    const safeMessage = escapeHtml(message);

    const emails: Promise<unknown>[] = [];

    /* ---------------------------
       📧 EMAIL À L'ACHETEUR (beau HTML)
    ----------------------------*/
    if (shouldSendEmail) {
      emails.push(sendEmail({
        to: contact,
        subject: "✅ Votre réservation chez MailleMum est enregistrée",
        html: emailTemplate(`
          <h1 style="font-size:20px;margin:0 0 12px 0;">Merci pour votre réservation</h1>
          <p style="font-size:14px;margin:0 0 16px 0;">
            Bonjour <strong>${safeName || "👋"}</strong>,<br/>
            Votre demande de réservation a bien été enregistrée. Nous vous recontacterons rapidement pour finaliser la vente.
          </p>

          <div style="margin-top:16px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
            ${productImage
          ? `<img src="${productImage}" alt="${escapeHtml(creation.title)}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
          : ""
        }
            <div style="font-size:13px;flex:1;">
              <p style="margin:0 0 4px 0;font-weight:600;">${escapeHtml(creation.title)}</p>
              ${creation.color
          ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${escapeHtml(creation.color)}</strong></p>`
          : ""
        }
              <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
              ${safeMessage
          ? `<p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">Votre message :<br/>${safeMessage}</p>`
          : ""
        }
            </div>
          </div>

          <p style="font-size:12px;margin-top:20px;color:#6b7280;">
            Vous pouvez consulter vos réservations à tout moment depuis votre espace :
            <br/>
            <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Voir mes réservations</a>
          </p>
        `),
      }));
    }

    /* ---------------------------
       📧 EMAIL AU VENDEUR (détails complets)
    ----------------------------*/
    if (process.env.SELLER_EMAIL) {
      emails.push(sendEmail({
        to: process.env.SELLER_EMAIL,
        subject: `🧶 Nouvelle réservation : ${creation.title}`,
        html: emailTemplate(`
            <h1 style="font-size:18px;margin:0 0 12px 0;">Nouvelle réservation</h1>
            <p style="font-size:14px;margin:0 0 12px 0;">
              <strong>${safeName}</strong> (${safeContact}) a réservé :
            </p>

            <div style="margin-top:12px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
              ${productImage
            ? `<img src="${productImage}" alt="${escapeHtml(creation.title)}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />`
            : ""
          }
              <div style="font-size:13px;flex:1;">
                <p style="margin:0 0 4px 0;font-weight:600;">${escapeHtml(creation.title)}</p>
                ${creation.color
            ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${escapeHtml(creation.color)}</strong></p>`
            : ""
          }
                <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
                <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                  Réservation créée le : ${new Date(reservation.createdAt).toLocaleString("fr-FR")}
                </p>
                ${safeMessage
            ? `<p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">Message de l'acheteur :<br/>${safeMessage}</p>`
            : ""
          }
              </div>
            </div>

            <p style="font-size:12px;margin-top:20px;color:#6b7280;">
              <a href="${appUrl}/admin/reservations?creationId=${creationId}" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gérer cette réservation</a>
            </p>
        `),
      }));
    }

    // Les emails ne doivent pas faire échouer la réservation
    const results = await Promise.allSettled(emails);
    for (const r of results) {
      if (r.status === "rejected") {
        console.error("[reserve] Email non envoyé:", r.reason);
      }
    }

    // 🔄 Invalider le cache de la page d'accueil immédiatement
    revalidateCatalog();

    return NextResponse.json(reservation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}
