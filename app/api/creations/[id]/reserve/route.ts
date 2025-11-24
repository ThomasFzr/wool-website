import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { sendEmail } from "@/lib/sendEmail";

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

    // ✅ NOUVEAU : params asynchrone
    const { id } = await context.params;
    const creationId = id;

    const { name, contact, message } = await req.json();

    const creation = await Creation.findById(creationId);
    if (!creation) {
      return new NextResponse("Création introuvable", { status: 404 });
    }

    if (creation.reserved) {
      return new NextResponse("Déjà réservé", { status: 409 });
    }

    const reservation = await Reservation.create({
      creationId,
      userId: (session.user as any).id,
      name,
      contact,
      message,
      status: "pending",
    });

    creation.reserved = true;
    creation.reservedName = name;
    creation.reservedContact = contact;
    creation.reservedMessage = message;
    creation.reservedAt = new Date();
    await creation.save();


    const productImage =
      (Array.isArray(creation.images) && creation.images.length > 0
        ? creation.images[0]
        : creation.imageUrl) ?? null;

    const priceLabel =
      creation.price != null ? `${creation.price} €` : "Prix sur demande";

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    /* ---------------------------
       📧 EMAIL À L'ACHETEUR (beau HTML)
    ----------------------------*/
    await sendEmail({
      to: contact,
      subject: "✅ Votre réservation chez MailleMum est enregistrée",
      html: `
      <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
        <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
          <h1 style="font-size:20px;margin:0 0 12px 0;">Merci pour votre réservation 🧶</h1>
          <p style="font-size:14px;margin:0 0 16px 0;">
            Bonjour <strong>${name || "👋"}</strong>,<br/>
            Votre demande de réservation a bien été enregistrée. Nous vous recontacterons rapidement pour finaliser la vente.
          </p>

          <div style="margin-top:16px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
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
              ${message
          ? `<p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">Votre message :<br/>${message}</p>`
          : ""
        }
            </div>
          </div>

          <p style="font-size:12px;margin-top:20px;color:#6b7280;">
            Vous pouvez consulter vos réservations à tout moment depuis votre espace :
            <br/>
            <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Voir mes réservations</a>
          </p>

          <p style="font-size:11px;margin-top:24px;color:#9ca3af;">
            Cet email est généré automatiquement, merci de ne pas y répondre directement.
          </p>
        </div>
      </div>
      `,
    });

    /* ---------------------------
       📧 EMAIL AU VENDEUR (détails complets)
    ----------------------------*/
    if (process.env.SELLER_EMAIL) {
      await sendEmail({
        to: process.env.SELLER_EMAIL,
        subject: `🧶 Nouvelle réservation : ${creation.title}`,
        html: `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #e5e7eb;">
            <h1 style="font-size:18px;margin:0 0 12px 0;">Nouvelle réservation</h1>
            <p style="font-size:14px;margin:0 0 12px 0;">
              <strong>${name}</strong> (${contact}) a réservé :
            </p>

            <div style="margin-top:12px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
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
                <p style="margin:0 0 4px 0;font-size:12px;color:#6b7280;">
                  Réservation créée le : ${new Date(reservation.createdAt).toLocaleString("fr-FR")}
                </p>
                ${message
            ? `<p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">Message de l'acheteur :<br/>${message}</p>`
            : ""
          }
              </div>
            </div>

            <p style="font-size:12px;margin-top:20px;color:#6b7280;">
              <a href="${appUrl}/admin/reservations" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gérer cette réservation dans l'admin</a>
            </p>
          </div>
        </div>
        `,
      });
    }

    return NextResponse.json(reservation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}