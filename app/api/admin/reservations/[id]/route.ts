import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import User from "@/models/User";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import { checkAdminAuth } from "@/lib/auth";

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
    const reservation = await Reservation.findByIdAndUpdate(
      id,
      body,
      { new: true }
    ).populate("creationId");

    if (!reservation)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    const creation: any = reservation.creationId;
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL;

    const productImage =
      (Array.isArray(creation?.images) && creation.images.length > 0
        ? creation.images[0]
        : creation?.imageUrl) ?? null;

    const priceLabel =
      creation?.price != null ? `${creation.price} €` : "Prix sur demande";

    /* -----------------------------
       ✅ PASSAGE EN "validated"
    ------------------------------*/
    if (body.status === "validated" && creation) {
      await Creation.findByIdAndUpdate(creation._id, {
        $set: {
          sold: true,
          reserved: false, // il n'est plus juste réservé, il est vendu
        },
        $inc: {
          salesCount: 1, // Incrémenter le compteur de ventes
        },
      });

      // Vérifier les préférences de notification de l'utilisateur
      const user = await User.findOne({ email: reservation.contact });
      const shouldSendEmail = user?.emailNotifications !== false;

      // 📧 Email de confirmation à l'acheteur
      if (shouldSendEmail) {
        await sendEmail({
        to: reservation.contact,
        subject: "🎉 Votre réservation a été validée",
        html: emailTemplate(`
            <h1 style="font-size:20px;margin:0 0 12px 0;">Bonne nouvelle 🎉</h1>
            <p style="font-size:14px;margin:0 0 16px 0;">
              Bonjour <strong>${reservation.name}</strong>,<br/>
              Votre réservation a été <strong>validée</strong> ! Nous allons revenir vers vous pour finaliser la vente.
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
              </div>
            </div>

            <p style="font-size:12px;margin-top:20px;color:#6b7280;">
              Vous pouvez retrouver cette commande dans :<br/>
              <a href="${appUrl}/account/orders" style="color:#0f172a;font-weight:600;">Mes réservations</a>
            </p>
        `),
        });
      }

      // 📧 Email au vendeur
      if (process.env.SELLER_EMAIL) {
        await sendEmail({
          to: process.env.SELLER_EMAIL,
          subject: `✅ Réservation validée : ${creation.title}`,
          html: emailTemplate(`
              <h1 style="font-size:18px;margin:0 0 12px 0;">Réservation validée</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                La réservation de <strong>${reservation.name}</strong> (${reservation.contact}) a été <strong>validée</strong>.
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
                </div>
              </div>
          `),
        });
      }
    }

    /* -----------------------------
       ❌ PASSAGE EN "cancelled"
    ------------------------------*/
    if (body.status === "cancelled" && creation) {
      // L'article redevient disponible
      await Creation.findByIdAndUpdate(creation._id, {
        $set: {
          reserved: false,
          sold: false,
        },
        $unset: {
          reservedName: "",
          reservedContact: "",
          reservedMessage: "",
          reservedAt: "",
        },
      });

      // ✅ Marquer que c'est l'admin qui a annulé
      (reservation as any).cancelledBy = "admin";
      if (body.cancelReason) {
        (reservation as any).cancelReason = body.cancelReason;
      }
      await reservation.save();

      const reason =
        (reservation as any).cancelReason ||
        body.cancelReason ||
        "Aucune raison précisée.";

      // Vérifier les préférences de notification de l'utilisateur
      const user = await User.findOne({ email: reservation.contact });
      const shouldSendEmail = user?.emailNotifications !== false;

      // 📧 Email à l'acheteur
      if (shouldSendEmail) {
        await sendEmail({
        to: reservation.contact,
        subject: "❌ Votre réservation a été annulée",
        html: emailTemplate(`
            <h1 style="font-size:20px;margin:0 0 12px 0;">Réservation annulée</h1>
            <p style="font-size:14px;margin:0 0 16px 0;">
              Bonjour <strong>${reservation.name}</strong>,<br/>
              Votre réservation pour l'article suivant a été <strong>annulée par la créatrice</strong>.
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
              <p style="margin:0;font-size:13px;">${reason}</p>
            </div>
        `),
        });
      }

      // 📧 Email au vendeur
      if (process.env.SELLER_EMAIL) {
                await sendEmail({
          to: process.env.SELLER_EMAIL,
          subject: `❌ Réservation annulée : ${creation.title}`,
          html: emailTemplate(`
              <h1 style="font-size:18px;margin:0 0 12px 0;">Réservation annulée</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                La réservation de <strong>${reservation.name}</strong> (${reservation.contact}) a été <strong>annulée</strong>.
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
                <p style="margin:0;font-size:13px;">${reason}</p>
              </div>
          `),
        });
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

    if (reservation.creationId) {
      await Creation.findByIdAndUpdate(reservation.creationId, {
        $set: {
          reserved: false,
        },
        $unset: {
          reservedName: "",
          reservedContact: "",
          reservedMessage: "",
          reservedAt: "",
        },
      });
    }

    await Reservation.findByIdAndDelete(id);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}