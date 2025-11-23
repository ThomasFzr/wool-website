import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import { sendEmail } from "@/lib/sendEmail";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    // 👇 Nouveauté Next 15 : params est async
    const { id } = await context.params;

    // 🔐 Vérifier la session
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { reason } = await req.json();

    // On récupère la réservation de l'utilisateur courant
    const reservation = await Reservation.findOne({
      _id: id,
      userId: (session.user as any).id, // tu as déjà stocké userId dans la réservation
    }).populate("creationId");

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Si déjà validée côté admin → on ne laisse plus annuler
    if (reservation.status === "validated") {
      return NextResponse.json(
        { error: "Cette commande est déjà validée, impossible de l'annuler." },
        { status: 400 }
      );
    }

    // 📝 On marque la réservation comme annulée + raison (facultative)
    reservation.status = "cancelled";
    (reservation as any).cancelReason = reason ?? "";
    await reservation.save();

    // 🔓 Si la création n'est pas vendue, on la libère pour quelqu'un d'autre
    const creation: any = reservation.creationId;
    if (creation && !creation.sold) {
      await Creation.findByIdAndUpdate(creation._id, {
        $set: { reserved: false },
        $unset: {
          reservedName: "",
          reservedContact: "",
          reservedMessage: "",
          reservedAt: "",
        },
      });
    }

    // -----------------------------
    //  📧 EMAILS D'ANNULATION
    // -----------------------------
    if (creation) {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL;

      const productImage =
        (Array.isArray(creation.images) && creation.images.length > 0
          ? creation.images[0]
          : creation.imageUrl) ?? null;

      const priceLabel =
        creation.price != null ? `${creation.price} €` : "Prix sur demande";

      const displayedReason =
        (reason && reason.trim().length > 0) ||
        ((reservation as any).cancelReason &&
          (reservation as any).cancelReason.trim().length > 0)
          ? (reason || (reservation as any).cancelReason)
          : "Aucune raison précisée.";

      // 📧 Email à l'acheteur (c'est lui qui a annulé)
      await sendEmail({
        to: reservation.contact,
        subject: "❌ Vous avez annulé votre réservation",
        html: `
        <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
          <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #fee2e2;">
            <h1 style="font-size:20px;margin:0 0 12px 0;">Votre réservation a été annulée</h1>
            <p style="font-size:14px;margin:0 0 16px 0;">
              Bonjour <strong>${reservation.name}</strong>,<br/>
              Vous avez annulé votre réservation pour l’article suivant :
            </p>

            <div style="margin-top:16px;border-radius:12px;border:1px solid #fee2e2;padding:12px;display:flex;gap:12px;background:#fef2f2;">
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
              </div>
            </div>

            <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
              <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
              <p style="margin:0;font-size:13px;">${displayedReason}</p>
            </div>

            <p style="font-size:12px;margin-top:20px;color:#6b7280;">
              Vous pouvez consulter l’historique de vos réservations ici :<br/>
              <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Mes réservations</a>
            </p>

            <p style="font-size:11px;margin-top:24px;color:#9ca3af;">
              Cet email est généré automatiquement, merci de ne pas y répondre directement.
            </p>
          </div>
        </div>
        `,
      });

      // 📧 Email au vendeur (l'utilisateur a annulé)
      if (process.env.SELLER_EMAIL) {
        await sendEmail({
          to: process.env.SELLER_EMAIL,
          subject: `❌ Réservation annulée par l'acheteur : ${creation.title}`,
          html: `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#0f172a; background:#f8fafc; padding:24px;">
            <div style="max-width:600px;margin:0 auto;background:white;border-radius:16px;padding:24px;border:1px solid #fee2e2;">
              <h1 style="font-size:18px;margin:0 0 12px 0;">Réservation annulée par l'acheteur</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                <strong>${reservation.name}</strong> (${reservation.contact}) a annulé sa réservation.
              </p>

              <div style="margin-top:12px;border-radius:12px;border:1px solid #fee2e2;padding:12px;display:flex;gap:12px;background:#fef2f2;">
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
                </div>
              </div>

              <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
                <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
                <p style="margin:0;font-size:13px;">${displayedReason}</p>
              </div>
            </div>
          </div>
          `,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}