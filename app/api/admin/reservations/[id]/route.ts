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

type ItemCreation = {
  _id: unknown;
  title?: string;
  color?: string;
  price?: number | null;
  images?: string[];
  imageUrl?: string;
};

/** Carte d'un article dans un email (données échappées). */
function itemCard(creation: ItemCreation, style: { border: string; background?: string }) {
  const safeTitle = escapeHtml(creation.title);
  const image =
    (Array.isArray(creation.images) && creation.images.length > 0 ? creation.images[0] : creation.imageUrl) ?? null;
  const priceLabel = creation.price != null ? `${creation.price} €` : "Prix sur demande";
  return `
    <div style="margin-top:12px;border-radius:12px;border:1px solid ${style.border};padding:12px;display:flex;gap:12px;${style.background ? `background:${style.background};` : ""}">
      ${image ? `<img src="${image}" alt="${safeTitle}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
      <div style="font-size:13px;flex:1;">
        <p style="margin:0 0 4px 0;font-weight:600;">${safeTitle}</p>
        ${creation.color ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${escapeHtml(creation.color)}</strong></p>` : ""}
        <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
      </div>
    </div>`;
}

/** « Pull » ou « Pull et 2 autres articles » pour l'objet des emails vendeuse. */
function itemsLabel(creations: ItemCreation[]) {
  const others = creations.length - 1;
  return others > 0
    ? `${creations[0].title} et ${others} autre${others > 1 ? "s" : ""} article${others > 1 ? "s" : ""}`
    : `${creations[0].title}`;
}

/** Envoie les emails ; un échec n'est que journalisé (il ne doit pas faire échouer le PATCH). */
async function sendAll(emails: Promise<unknown>[]) {
  for (const r of await Promise.allSettled(emails)) {
    if (r.status === "rejected") console.error("[admin/reservations] Email non envoyé:", r.reason);
  }
}

/** Un seul email (acheteur, vendeuse) pour tous les articles validés d'une commande. */
async function sendValidationEmails(items: any[]) {
  const { name, contact } = items[0];
  const creations: ItemCreation[] = items.map((r) => r.creationId);
  const safeName = escapeHtml(name);
  const cards = creations.map((c) => itemCard(c, { border: "#e5e7eb" })).join("");
  const user = await User.findOne({ email: contact });
  const emails: Promise<unknown>[] = [];

  if (user?.emailNotifications !== false) {
    emails.push(sendEmail({
      to: contact,
      subject: "🎉 Votre commande a été validée",
      html: emailTemplate(`
        <h1 style="font-size:20px;margin:0 0 12px 0;">Bonne nouvelle 🎉</h1>
        <p style="font-size:14px;margin:0 0 16px 0;">
          Bonjour <strong>${safeName}</strong>,<br/>
          Votre commande a été <strong>validée</strong> ! Nous allons revenir vers vous pour finaliser la livraison.
        </p>
        ${cards}
        <p style="font-size:12px;margin-top:20px;color:#6b7280;">
          Vous pouvez retrouver cette commande dans :<br/>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/account/orders" style="color:#0f172a;font-weight:600;">Mes commandes</a>
        </p>
      `),
    }));
  }

  if (process.env.SELLER_EMAIL) {
    emails.push(sendEmail({
      to: process.env.SELLER_EMAIL,
      subject: `✅ Commande validée : ${itemsLabel(creations)}`,
      html: emailTemplate(`
        <h1 style="font-size:18px;margin:0 0 12px 0;">Commande validée</h1>
        <p style="font-size:14px;margin:0 0 12px 0;">
          La commande de <strong>${safeName}</strong> (${escapeHtml(contact)}) a été <strong>validée</strong>.
        </p>
        ${cards}
      `),
    }));
  }

  await sendAll(emails);
}

/** Un seul email (acheteur, vendeuse) pour tous les articles annulés d'une commande. */
async function sendCancellationEmails(items: any[]) {
  const { name, contact } = items[0];
  const creations: ItemCreation[] = items.map((r) => r.creationId);
  const safeName = escapeHtml(name);
  const safeReason = escapeHtml(items[0].cancelReason || "Aucune raison précisée.");
  const cards = creations.map((c) => itemCard(c, { border: "#fee2e2", background: "#fef2f2" })).join("");
  const reasonBlock = `
    <div style="margin-top:16px;padding:12px;border-radius:12px;background:#fef9c3;">
      <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Raison de l'annulation</p>
      <p style="margin:0;font-size:13px;">${safeReason}</p>
    </div>`;
  const user = await User.findOne({ email: contact });
  const emails: Promise<unknown>[] = [];

  if (user?.emailNotifications !== false) {
    emails.push(sendEmail({
      to: contact,
      subject: "❌ Votre commande a été annulée",
      html: emailTemplate(`
        <h1 style="font-size:20px;margin:0 0 12px 0;">Commande annulée</h1>
        <p style="font-size:14px;margin:0 0 16px 0;">
          Bonjour <strong>${safeName}</strong>,<br/>
          Votre commande pour ${creations.length > 1 ? "les articles suivants" : "l'article suivant"} a été <strong>annulée par la créatrice</strong>.
        </p>
        ${cards}
        ${reasonBlock}
      `),
    }));
  }

  if (process.env.SELLER_EMAIL) {
    emails.push(sendEmail({
      to: process.env.SELLER_EMAIL,
      subject: `❌ Commande annulée : ${itemsLabel(creations)}`,
      html: emailTemplate(`
        <h1 style="font-size:18px;margin:0 0 12px 0;">Commande annulée</h1>
        <p style="font-size:14px;margin:0 0 12px 0;">
          La commande de <strong>${safeName}</strong> (${escapeHtml(contact)}) a été <strong>annulée</strong>.
        </p>
        ${cards}
        ${reasonBlock}
      `),
    }));
  }

  await sendAll(emails);
}

/**
 * Email à l'acheteur quand sa commande part (un seul pour tous les articles expédiés),
 * avec le numéro de suivi s'il a été saisi. La vendeuse vient de faire l'action : pas d'email.
 */
async function sendShippingEmail(items: any[]) {
  const { name, contact } = items[0];
  const user = await User.findOne({ email: contact });
  if (user?.emailNotifications === false) return;

  const creations: ItemCreation[] = items.map((r) => r.creationId);
  const tracking = items.find((r) => r.trackingNumber)?.trackingNumber;
  const cards = creations.map((c) => itemCard(c, { border: "#e5e7eb" })).join("");
  const trackingBlock = tracking
    ? `
    <div style="margin-top:16px;padding:12px;border-radius:12px;background:#eff6ff;">
      <p style="margin:0 0 4px 0;font-size:12px;font-weight:600;">Numéro de suivi</p>
      <p style="margin:0;font-size:14px;font-family:monospace;">${escapeHtml(tracking)}</p>
    </div>`
    : "";

  await sendAll([
    sendEmail({
      to: contact,
      subject: "📦 Votre commande a été expédiée",
      html: emailTemplate(`
        <h1 style="font-size:20px;margin:0 0 12px 0;">Votre commande est en route 📦</h1>
        <p style="font-size:14px;margin:0 0 16px 0;">
          Bonjour <strong>${escapeHtml(name)}</strong>,<br/>
          Votre commande vient d'être <strong>expédiée</strong>.
        </p>
        ${cards}
        ${trackingBlock}
        <p style="font-size:12px;margin-top:20px;color:#6b7280;">
          Vous pouvez suivre cette commande dans :<br/>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/account/orders" style="color:#0f172a;font-weight:600;">Mes commandes</a>
        </p>
      `),
    }),
  ]);
}

/**
 * Réservations visées : la réservation seule, ou avec `wholeOrder` tous les articles de sa
 * commande (même session de paiement). Une action groupée ne rouvre pas un article déjà
 * annulé de la commande.
 */
async function findTargets(id: string, wholeOrder: boolean) {
  const reservation = await Reservation.findById(id).lean<any>();
  if (!reservation) return null;
  if (!wholeOrder || !reservation.stripeCheckoutSessionId) return [reservation];
  return Reservation.find({
    stripeCheckoutSessionId: reservation.stripeCheckoutSessionId,
    $or: [{ _id: reservation._id }, { status: { $ne: "cancelled" } }],
  })
    .sort({ createdAt: 1, _id: 1 })
    .lean<any[]>();
}


export async function PATCH(req: Request, context: AdminRouteContext) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();
    const body = await req.json();

    const { id } = await context.params;

    const targets = await findTargets(id, body.wholeOrder === true);
    if (!targets) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Préparer les mises à jour (champs whitelistés uniquement)
    const updates: any = {};
    for (const field of UPDATABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // Si on passe à "shipped", enregistrer la date
    if (body.status === "shipped" && !body.shippedAt) {
      updates.shippedAt = new Date();
    }

    let updated: any = null;
    const validatedItems: any[] = [];
    const cancelledItems: any[] = [];
    const shippedItems: any[] = [];

    for (const target of targets) {
      // Les effets de bord (vente, emails) n'ont lieu que lors d'un vrai changement de
      // statut, pas à chaque PATCH répété
      const statusChanged = body.status !== undefined && body.status !== target.status;
      const cancelling = body.status === "cancelled" && statusChanged;

      const reservation = await Reservation.findByIdAndUpdate(
        target._id,
        { $set: { ...updates, ...(cancelling && { cancelledBy: "admin" }) } },
        { new: true }
      ).populate("creationId");
      if (!reservation) continue;
      if (String(reservation._id) === String(id)) updated = reservation;

      const creation: any = reservation.creationId;
      if (!creation || !statusChanged) continue;

      if (body.status === "validated" || body.status === "preparing") {
        // Atomique + conditionnel : salesCount ne s'incrémente qu'une seule fois par article
        await Creation.findOneAndUpdate(
          { _id: creation._id, sold: { $ne: true } },
          { $set: { sold: true }, $inc: { salesCount: 1 } }
        );
        validatedItems.push(reservation);
      }

      // Première expédition seulement : un retour « en cours de livraison » → « expédiée »
      // (shippedAt déjà posé) ne renvoie pas l'email
      if (body.status === "shipped" && !target.shippedAt) {
        shippedItems.push(reservation);
      }

      if (cancelling) {
        // L'article redevient disponible, sauf s'il a été revendu depuis
        // (ou si son verrou appartient à une autre réservation)
        if (await releaseCreationOfReservation({ ...reservation.toObject(), creationId: creation._id })) {
          revalidateCatalog();
        }
        cancelledItems.push(reservation);
      }
    }

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (validatedItems.length > 0) {
      // 🔄 Invalider le cache après validation de la vente
      revalidateCatalog();
      await sendValidationEmails(validatedItems);
    }
    if (cancelledItems.length > 0) {
      await sendCancellationEmails(cancelledItems);
    }
    if (shippedItems.length > 0) {
      await sendShippingEmail(shippedItems);
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: AdminRouteContext
) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const { id } = await context.params;
    // ?wholeOrder=1 : supprimer tous les articles de la commande
    const wholeOrder = req.nextUrl.searchParams.get("wholeOrder") === "1";

    const reservation = await Reservation.findById(id).lean<any>();
    if (!reservation) {
      return new NextResponse("Reservation not found", { status: 404 });
    }
    const targets =
      wholeOrder && reservation.stripeCheckoutSessionId
        ? await Reservation.find({ stripeCheckoutSessionId: reservation.stripeCheckoutSessionId }).lean<any[]>()
        : [reservation];

    await Reservation.deleteMany({ _id: { $in: targets.map((r) => r._id) } });

    // Une commande déjà annulée a déjà rendu sa pièce : on n'y touche plus.
    // Sinon, remise en vente sauf si la pièce a été revendue depuis.
    let released = false;
    for (const target of targets) {
      if (target.status !== "cancelled" && (await releaseCreationOfReservation(target))) released = true;
    }
    if (released) revalidateCatalog();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}
