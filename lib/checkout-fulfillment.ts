import mongoose from "mongoose";
import Stripe from "stripe";
import { after } from "next/server";
import { revalidateCatalog, revalidateOrders } from "@/lib/revalidate";
import { getStripeInstance } from "@/lib/stripe";
import { getAppUrl } from "@/lib/url";
import { escapeHtml } from "@/lib/escape";
import { sendEmail } from "@/lib/sendEmail";
import { emailTemplate } from "@/lib/emailTemplate";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import CheckoutNotification from "@/models/CheckoutNotification";
import { LOCK_FIELDS_UNSET, releaseCreationLocks, releaseSoldCreation } from "@/lib/creation-lock";

export type FulfillmentResult = {
  /** true si la session Stripe est réellement payée (payment_status=paid, status=complete, PaymentIntent succeeded) */
  paid: boolean;
  /** nombre de réservations passées de "pending" à "paid" par CET appel (0 si déjà traitées : idempotence) */
  processedCount: number;
  /**
   * true si le paiement n'est pas encore finalisé côté Stripe mais peut encore aboutir
   * (session encore ouverte, PaymentIntent en cours de traitement). Stripe redirige parfois
   * vers success_url avant d'avoir finalisé la session : l'appelant doit revérifier
   * plutôt que de conclure à un échec.
   */
  pending: boolean;
};

// Statuts de PaymentIntent encore susceptibles d'aboutir (à revérifier)
const PENDING_PI_STATUSES = new Set([
  "processing",
  "requires_action",
  "requires_confirmation",
  "requires_capture",
]);

type ShippingAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  postalCode: string;
  country: string;
};

/**
 * Traitement post-paiement complet et idempotent d'une session Stripe Checkout.
 *
 * Appelé à la fois par le webhook Stripe (checkout.session.completed) et par
 * /api/stripe/verify-session (filet de sécurité si le webhook n'est pas encore passé).
 * L'idempotence repose sur le findOneAndUpdate conditionnel `paymentStatus: "pending"` :
 * chaque réservation ne peut être traitée (et chaque email envoyé) qu'une seule fois,
 * quel que soit le nombre d'appels concurrents.
 *
 * La base est mise à jour de façon synchrone ; les emails partent en tâche de fond
 * (après la réponse HTTP via `after()`, sans jamais faire échouer la requête).
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
  options?: { appUrl?: string }
): Promise<FulfillmentResult> {
  const stripe = getStripeInstance();
  const appUrl = options?.appUrl || getAppUrl();

  // ⚠️ VÉRIFICATION CRITIQUE : ne traiter que les paiements réellement validés
  // (Stripe envoie checkout.session.completed même si le paiement est annulé)
  if (session.payment_status !== "paid" || session.status !== "complete") {
    // Session encore ouverte = paiement potentiellement en cours de finalisation
    const pending = session.status === "open";
    console.log(
      `[FULFILL] Session ${session.id} ignorée : payment_status=${session.payment_status}, status=${session.status}, pending=${pending}`
    );
    return { paid: false, processedCount: 0, pending };
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  // Vérification supplémentaire : le PaymentIntent doit être "succeeded"
  let paymentIntent: Stripe.PaymentIntent | null = null;
  if (paymentIntentId) {
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (paymentIntent.status !== "succeeded") {
        const pending = PENDING_PI_STATUSES.has(paymentIntent.status);
        console.log(
          `[FULFILL] Session ${session.id} ignorée : PaymentIntent ${paymentIntentId} status=${paymentIntent.status} (attendu: succeeded), pending=${pending}`
        );
        return { paid: false, processedCount: 0, pending };
      }
    } catch (err) {
      console.error(
        `[FULFILL] Erreur lors de la vérification du PaymentIntent ${paymentIntentId}:`,
        err
      );
      // Erreur réseau/API : on ne traite pas la commande, mais l'état reste
      // indéterminé — l'appelant peut revérifier.
      return { paid: false, processedCount: 0, pending: true };
    }
  }

  // Récupérer les réservations : via les metadata, sinon via l'ID de session
  const reservationIds: string[] = session.metadata?.reservationIds
    ? JSON.parse(session.metadata.reservationIds)
    : [];

  const reservations =
    reservationIds.length > 0
      ? await Reservation.find({ _id: mongoose.trusted({ $in: reservationIds }) })
      : await Reservation.find({ stripeCheckoutSessionId: session.id });

  if (reservations.length === 0) {
    console.error(`[FULFILL] Aucune réservation trouvée pour la session ${session.id}`);
    await settleOrphanPayment({ session, paymentIntentId, appUrl });
    return { paid: true, processedCount: 0, pending: false };
  }

  const deliveryMode = session.metadata?.deliveryMode || "pickup";
  const totalShippingCost = session.metadata?.shippingCost
    ? parseFloat(session.metadata.shippingCost)
    : 0;

  // Adresse de livraison : d'abord dans la Checkout Session, sinon dans le PaymentIntent
  let shippingInfo =
    (session as any).shipping_details || (session as any).shipping;

  // Le PaymentIntent a déjà été récupéré plus haut pour vérifier le paiement
  if (!shippingInfo?.address && paymentIntent) {
    shippingInfo = (paymentIntent as any).shipping || (paymentIntent as any).shipping_details;
  }

  const shippingAddress: ShippingAddress | null = shippingInfo?.address
    ? {
        name: shippingInfo.name || "",
        line1: shippingInfo.address.line1 || "",
        line2: shippingInfo.address.line2 || "",
        city: shippingInfo.address.city || "",
        postalCode: shippingInfo.address.postal_code || "",
        country: shippingInfo.address.country || "",
      }
    : null;

  // Log minimal (pas de données personnelles)
  console.log(
    `[FULFILL] Session ${session.id}: ${reservations.length} réservation(s), deliveryMode=${deliveryMode}, adresse=${shippingAddress ? "oui" : "non"}`
  );

  // Traiter toutes les réservations (mises à jour atomiques)
  const processedReservations: any[] = [];
  const processedCreations: any[] = [];
  const conflicts: SoldConflict[] = [];
  // Réservations prises en charge par CET appel (fulfillingAt posé)
  const gatedIds: unknown[] = [];

  const outcomes = await Promise.allSettled(
    reservations.map(async (reservation: any, index: number) => {
      // Protection contre les appels concurrents et les doubles traitements :
      // findOneAndUpdate conditionnel — seulement si encore "pending"
      const now = new Date();
      const updatedReservation = await Reservation.findOneAndUpdate(
        {
          _id: reservation._id,
          paymentStatus: "pending",
        },
        {
          $set: {
            stripePaymentIntentId: paymentIntentId,
            stripeCustomerId: session.customer as string,
            paymentStatus: "paid",
            status: "validated",
            paidAt: now,
            fulfillingAt: now,
            deliveryMode: deliveryMode,
            shippingCost:
              deliveryMode === "shipping" && totalShippingCost > 0 && index === 0
                ? totalShippingCost
                : 0,
            ...(shippingAddress && { shippingAddress: shippingAddress }),
          },
        },
        { new: true }
      );

      // null = déjà traitée (webhook ou verify-session passé avant) → skip, idempotence
      if (!updatedReservation) {
        console.log(`[FULFILL] Réservation ${reservation._id} déjà traitée, skip`);
        return;
      }
      gatedIds.push(updatedReservation._id);

      // Marquer la création vendue + incrémenter salesCount ATOMIQUEMENT :
      // la condition `sold: { $ne: true }` garantit que l'incrément n'a lieu qu'une fois.
      // On libère aussi le flag `reserved` posé à la création de la session Checkout.
      const creation = await Creation.findOneAndUpdate(
        { _id: updatedReservation.creationId, sold: mongoose.trusted({ $ne: true }) },
        {
          $set: { sold: true, reserved: false },
          $unset: LOCK_FIELDS_UNSET,
          $inc: { salesCount: 1 },
        },
        { new: true }
      );

      if (creation) {
        processedReservations.push(updatedReservation);
        processedCreations.push(creation);
      } else {
        // Pièce déjà vendue (ou supprimée) : ce paiement ne peut pas être honoré
        conflicts.push({
          reservation: updatedReservation,
          creation: await Creation.findById(updatedReservation.creationId),
        });
      }
    })
  );

  // Aucune réservation en attente : soit un autre appel les a déjà traitées
  // (webhook + verify-session, idempotence), soit elles avaient été invalidées
  // (session remplacée, expirée) et ce paiement ne correspond à aucune commande.
  if (processedReservations.length === 0 && conflicts.length === 0) {
    const recorded = await Reservation.exists({
      _id: mongoose.trusted({ $in: reservations.map((r: any) => r._id) }),
      paymentStatus: mongoose.trusted({ $in: ["paid", "refunded"] }),
    });
    if (!recorded) {
      console.error(`[FULFILL] Session ${session.id} payée sans réservation en attente`);
      await settleOrphanPayment({ session, paymentIntentId, appUrl, buyerName: reservations[0].name });
    }
  }

  if (conflicts.length > 0) {
    const settled = await settleSoldConflicts({
      session,
      paymentIntentId,
      conflicts,
      shippingCost: deliveryMode === "shipping" ? totalShippingCost : 0,
    });
    revalidateOrders();
    await runInBackground(buildConflictEmailDispatcher({ settled, appUrl }));
  }

  // Traitement de CET appel terminé : ses réservations ne bloquent plus l'email
  if (gatedIds.length > 0) {
    await Reservation.updateMany({ _id: mongoose.trusted({ $in: gatedIds }) }, { $unset: { fulfillingAt: "" } });
  }

  if (processedReservations.length > 0) {
    // La vitrine et les commandes ont changé : invalider le cache.
    // Le paiement est DÉJÀ enregistré à ce stade : un échec de revalidation
    // (appel hors contexte de requête, ex. script/cron) ne doit jamais
    // transformer une commande payée en erreur pour le client.
    revalidateCatalog();
    revalidateOrders();
  }

  // Une réservation n'a pas pu être traitée : erreur remontée (le webhook répond
  // 500 et Stripe réessaie), l'email partira lors du nouvel essai.
  const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === "rejected");
  if (failure) throw failure.reason;

  await sendOrderConfirmationOnce({
    session,
    reservationIds: reservations.map((r: any) => r._id),
    deliveryMode,
    totalShippingCost,
    appUrl,
  });

  return { paid: true, processedCount: processedReservations.length, pending: false };
}

// Au-delà, un traitement interrompu (crash) ne bloque plus l'email de confirmation
const FULFILLING_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * Email de confirmation de la commande, décidé au niveau de la SESSION :
 * - attend que toutes ses réservations soient traitées (webhook et verify-session
 *   peuvent s'en partager le traitement) : c'est le dernier appel qui envoie ;
 * - un seul envoi grâce à l'_id unique de CheckoutNotification ;
 * - construit à partir de TOUTES les réservations honorées de la session.
 */
async function sendOrderConfirmationOnce({
  session,
  reservationIds,
  deliveryMode,
  totalShippingCost,
  appUrl,
}: {
  session: Stripe.Checkout.Session;
  reservationIds: unknown[];
  deliveryMode: string;
  totalShippingCost: number;
  appUrl: string;
}) {
  // Toutes les réservations de la session, pas seulement celles vues par cet appel
  const all = await Reservation.find({
    $or: [{ _id: mongoose.trusted({ $in: reservationIds }) }, { stripeCheckoutSessionId: session.id }],
  }).lean<any[]>();
  const busy = all.some(
    (r) =>
      r.paymentStatus === "pending" ||
      (r.fulfillingAt && Date.now() - new Date(r.fulfillingAt).getTime() < FULFILLING_TIMEOUT_MS)
  );
  if (busy) return;

  const honored = all.filter((r) => r.paymentStatus === "paid" && r.status !== "cancelled");
  if (honored.length === 0) return;

  try {
    await CheckoutNotification.create({ _id: session.id });
  } catch (err: any) {
    if (err?.code === 11000) return; // déjà envoyé par un autre appel
    throw err;
  }

  const creations = await Creation.find({ _id: mongoose.trusted({ $in: honored.map((r) => r.creationId) }) }).lean<any[]>();
  const byId = new Map(creations.map((c) => [String(c._id), c]));
  const items = honored.filter((r) => byId.has(String(r.creationId)));

  await runInBackground(
    buildEmailDispatcher({
      processedReservations: items,
      processedCreations: items.map((r) => byId.get(String(r.creationId))),
      deliveryMode,
      totalShippingCost,
      // Montant réellement payé, sauf si une partie de la commande a été remboursée
      amountTotal: honored.length === all.length ? session.amount_total : null,
      appUrl,
    })
  );
}

/**
 * Exécute une tâche après l'envoi de la réponse HTTP (`after()`, Next 15.1+) ;
 * hors contexte de requête, l'attend directement. La tâche ne doit jamais throw.
 */
async function runInBackground(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    await task();
  }
}

/**
 * Paiement reçu pour une session qui ne correspond plus à aucune commande en
 * attente : remboursement intégral (clé d'idempotence par session) et alerte.
 */
async function settleOrphanPayment({
  session,
  paymentIntentId,
  appUrl,
  buyerName,
}: {
  session: Stripe.Checkout.Session;
  paymentIntentId: string | undefined;
  appUrl: string;
  buyerName?: string;
}) {
  let refunded = false;
  if (paymentIntentId) {
    try {
      await getStripeInstance().refunds.create(
        { payment_intent: paymentIntentId },
        { idempotencyKey: `orphan-${session.id}` }
      );
      refunded = true;
    } catch (err) {
      console.error(`[FULFILL] Remboursement impossible (orphan-${session.id}):`, err);
    }
  }

  const buyerEmail = session.customer_email;
  const amount = ((session.amount_total ?? 0) / 100).toFixed(2);
  const safeSessionId = escapeHtml(session.id);

  await runInBackground(async () => {
    const results = await Promise.allSettled([
      buyerEmail
        ? sendEmail({
            to: buyerEmail,
            subject: "Paiement non enregistré - MailleMum",
            html: emailTemplate(`
              <h1 style="font-size:20px;margin:0 0 12px 0;color:#0f172a;">Paiement non enregistré</h1>
              <p style="font-size:14px;margin:0 0 12px 0;color:#475569;line-height:1.6;">
                Bonjour <strong>${escapeHtml(buyerName) || "👋"}</strong>,<br/>
                Nous avons reçu un paiement de ${amount} € qui ne correspond plus à une commande en cours
                (une nouvelle session de paiement l'avait remplacée).
                ${refunded ? "Il vous a été intégralement remboursé." : "Nous revenons vers vous très vite pour vous rembourser."}
              </p>
            `),
          })
        : Promise.resolve(null),
      process.env.SELLER_EMAIL
        ? sendEmail({
            to: process.env.SELLER_EMAIL,
            subject: "⚠️ Paiement reçu sans commande en attente",
            html: emailTemplate(`
              <h1 style="font-size:18px;margin:0 0 12px 0;">Paiement sans commande</h1>
              <p style="font-size:14px;margin:0 0 12px 0;">
                Session Stripe <code>${safeSessionId}</code> (${escapeHtml(buyerEmail)}) : ${amount} € payés
                alors qu'aucune réservation n'était en attente.
                ${refunded ? "Remboursement automatique effectué." : "<strong>Remboursement automatique impossible : à rembourser depuis Stripe.</strong>"}
              </p>
              <p style="font-size:12px;margin-top:20px;color:#6b7280;">
                <a href="${appUrl}/admin/reservations">Voir les commandes</a>
              </p>
            `),
          })
        : Promise.resolve(null),
    ]);
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(
          `[FULFILL] Échec de l'email de paiement orphelin ${i === 0 ? "acheteur" : "vendeur"}:`,
          (result.reason as any)?.message || result.reason
        );
      }
    });
  });
}

type SoldConflict = { reservation: any; creation: any | null };
type SettledConflict = SoldConflict & { refunded: boolean };

/**
 * Paiement reçu pour une pièce déjà vendue (ou supprimée) : la réservation est
 * annulée et la pièce remboursée automatiquement (montant connu = prix de la
 * pièce). Les frais de port sont remboursés aussi quand AUCUN article de la
 * commande n'a pu être honoré. Les clés d'idempotence Stripe empêchent un double
 * remboursement si le traitement est rejoué. Sans remboursement possible, la
 * réservation reste « paid » (visible dans l'admin) pour un remboursement manuel.
 */
async function settleSoldConflicts({
  session,
  paymentIntentId,
  conflicts,
  shippingCost,
}: {
  session: Stripe.Checkout.Session;
  paymentIntentId: string | undefined;
  conflicts: SoldConflict[];
  shippingCost: number;
}): Promise<SettledConflict[]> {
  const stripe = getStripeInstance();

  const refund = async (amount: number, idempotencyKey: string) => {
    if (!paymentIntentId || !(amount > 0)) return false;
    try {
      await stripe.refunds.create(
        { payment_intent: paymentIntentId, amount: Math.round(amount * 100) },
        { idempotencyKey }
      );
      return true;
    } catch (err) {
      console.error(`[FULFILL] Remboursement impossible (${idempotencyKey}):`, err);
      return false;
    }
  };

  const settled: SettledConflict[] = [];
  for (const { reservation, creation } of conflicts) {
    const refunded = await refund(creation?.price, `conflict-${reservation._id}`);
    await Reservation.updateOne(
      { _id: reservation._id },
      {
        $set: {
          status: "cancelled",
          paymentStatus: refunded ? "refunded" : "paid",
          cancelReason: refunded
            ? "Pièce déjà vendue : paiement remboursé automatiquement"
            : "Pièce déjà vendue : paiement à rembourser manuellement",
        },
      }
    );
    console.error(
      `[FULFILL] Session ${session.id}: réservation ${reservation._id} en conflit (pièce déjà vendue), remboursée=${refunded}`
    );
    settled.push({ reservation, creation, refunded });
  }

  // Aucun article de la commande honoré (ni en cours de traitement par un appel
  // concurrent) : rembourser aussi les frais de port
  const honored = await Reservation.exists({
    stripeCheckoutSessionId: session.id,
    paymentStatus: mongoose.trusted({ $in: ["paid", "pending"] }),
    status: mongoose.trusted({ $ne: "cancelled" }),
  });
  if (!honored && shippingCost > 0) {
    await refund(shippingCost, `conflict-shipping-${session.id}`);
  }

  return settled;
}

/** Emails d'un conflit : l'acheteur est prévenu, la vendeuse alertée. Ne throw jamais. */
function buildConflictEmailDispatcher({
  settled,
  appUrl,
}: {
  settled: SettledConflict[];
  appUrl: string;
}): () => Promise<void> {
  const first = settled[0].reservation;
  const buyerName = escapeHtml(first.name);
  const buyerContact = escapeHtml(first.contact);
  const lines = settled
    .map(
      ({ reservation, creation, refunded }) =>
        `<li>${escapeHtml(creation?.title ?? `pièce supprimée (${reservation.creationId})`)} — ${
          refunded ? "remboursée automatiquement" : "<strong>à rembourser manuellement</strong>"
        }</li>`
    )
    .join("");
  const allRefunded = settled.every((c) => c.refunded);

  const sendBuyerEmail = () =>
    sendEmail({
      to: first.contact,
      subject: "Article indisponible - Votre commande chez MailleMum",
      html: emailTemplate(`
        <h1 style="font-size:20px;margin:0 0 12px 0;color:#0f172a;">Article indisponible</h1>
        <p style="font-size:14px;margin:0 0 12px 0;color:#475569;line-height:1.6;">
          Bonjour <strong>${buyerName || "👋"}</strong>,<br/>
          Désolée, ${settled.length > 1 ? "ces pièces uniques ont" : "cette pièce unique a"} été vendue${settled.length > 1 ? "s" : ""} juste avant votre paiement :
        </p>
        <ul style="font-size:14px;color:#0f172a;">${settled.map(({ creation }) => `<li>${escapeHtml(creation?.title ?? "Article")}</li>`).join("")}</ul>
        <p style="font-size:14px;margin:12px 0 0 0;color:#475569;">
          ${allRefunded ? "Le montant correspondant vous a été remboursé : il apparaîtra sur votre compte sous quelques jours." : "Nous revenons vers vous très vite pour vous rembourser."}
        </p>
      `),
    });

  const sendSellerEmail = () => {
    if (!process.env.SELLER_EMAIL) return Promise.resolve(null);
    return sendEmail({
      to: process.env.SELLER_EMAIL,
      subject: `⚠️ Paiement reçu pour une pièce déjà vendue`,
      html: emailTemplate(`
        <h1 style="font-size:18px;margin:0 0 12px 0;">Paiement en conflit</h1>
        <p style="font-size:14px;margin:0 0 12px 0;">
          <strong>${buyerName}</strong> (${buyerContact}) a payé des pièces déjà vendues :
        </p>
        <ul style="font-size:14px;">${lines}</ul>
        <p style="font-size:12px;margin-top:20px;color:#6b7280;">
          <a href="${appUrl}/admin/reservations" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Voir les commandes</a>
        </p>
      `),
    });
  };

  return async () => {
    const results = await Promise.allSettled([sendBuyerEmail(), sendSellerEmail()]);
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(
          `[FULFILL] Échec de l'email de conflit ${i === 0 ? "acheteur" : "vendeur"}:`,
          (result.reason as any)?.message || result.reason
        );
      }
    });
  };
}

/**
 * Construit la tâche d'envoi des emails de confirmation (acheteur + vendeur).
 * La fonction retournée ne throw JAMAIS (Promise.allSettled + logs).
 * Toute donnée utilisateur interpolée dans le HTML passe par escapeHtml.
 */
function buildEmailDispatcher({
  processedReservations,
  processedCreations,
  deliveryMode,
  totalShippingCost,
  amountTotal,
  appUrl,
}: {
  processedReservations: any[];
  processedCreations: any[];
  deliveryMode: string;
  totalShippingCost: number;
  amountTotal: number | null;
  appUrl: string;
}): () => Promise<void> {
  const firstReservation = processedReservations[0];
  const buyerName = escapeHtml(firstReservation.name);
  const buyerContact = escapeHtml(firstReservation.contact);
  const orderRef = escapeHtml(
    firstReservation.stripeCheckoutSessionId || firstReservation._id
  );

  // Calculer les totaux
  const subtotal = processedCreations.reduce(
    (sum, creation) => sum + (creation.price || 0),
    0
  );
  const shippingCost = deliveryMode === "shipping" ? totalShippingCost : 0;
  const total = amountTotal != null ? amountTotal / 100 : subtotal + shippingCost;

  // Générer le HTML pour tous les articles du résumé
  const orderSummaryItems = processedCreations
    .map((creation) => {
      const productImage = escapeHtml(
        (Array.isArray(creation.images) && creation.images.length > 0
          ? creation.images[0]
          : creation.imageUrl) ?? ""
      );
      const title = escapeHtml(creation.title);
      const color = escapeHtml(creation.color);
      const priceLabel =
        creation.price != null
          ? `${creation.price.toFixed(2)} €`
          : "Prix sur demande";

      return `
        <tr style="border-bottom:1px solid #e5e7eb;">
          <td style="padding:12px 0;">
            <div style="display:flex;gap:12px;align-items:center;">
              ${productImage ? `<img src="${productImage}" alt="${title}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
              <div style="flex:1;">
                <p style="margin:0 0 4px 0;font-weight:600;font-size:14px;color:#0f172a;">${title}</p>
                ${color ? `<p style="margin:0;font-size:12px;color:#64748b;">Couleur : ${color}</p>` : ""}
              </div>
            </div>
          </td>
          <td style="padding:12px 0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">
            ${priceLabel}
          </td>
        </tr>
      `;
    })
    .join("");

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
        ` : ""}

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
          <a href="mailto:${buyerContact}" style="color:#3b82f6;text-decoration:underline;">${buyerContact}</a>
        </p>
        <p style="margin:0;font-size:12px;color:#64748b;">
          <strong style="color:#0f172a;">Numéro de commande :</strong>
          <a href="${appUrl}/account/orders" style="color:#3b82f6;text-decoration:underline;font-family:monospace;word-break:break-all;">${orderRef}</a>
        </p>
      </div>
    </div>
  `;

  const sendBuyerEmail = () =>
    sendEmail({
      to: firstReservation.contact,
      subject: `🎉 Paiement confirmé - Votre commande chez MailleMum`,
      html: emailTemplate(`
        <h1 style="font-size:24px;font-weight:700;margin:0 0 12px 0;color:#0f172a;">Paiement confirmé 🎉</h1>
        <p style="font-size:15px;margin:0 0 24px 0;color:#475569;line-height:1.6;">
          Bonjour <strong style="color:#0f172a;">${buyerName || "👋"}</strong>,<br/>
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

  const sendSellerEmail = () => {
    if (!process.env.SELLER_EMAIL) return Promise.resolve(null);

    const sellerItemsHTML = processedCreations
      .map((creation) => {
        const productImage = escapeHtml(
          (Array.isArray(creation.images) && creation.images.length > 0
            ? creation.images[0]
            : creation.imageUrl) ?? ""
        );
        const title = escapeHtml(creation.title);
        const color = escapeHtml(creation.color);
        const priceLabel =
          creation.price != null ? `${creation.price} €` : "Prix sur demande";

        return `
          <div style="margin-top:12px;border-radius:12px;border:1px solid #e5e7eb;padding:12px;display:flex;gap:12px;">
            ${productImage ? `<img src="${productImage}" alt="${title}" style="width:96px;height:96px;object-fit:cover;border-radius:8px;flex-shrink:0;" />` : ""}
            <div style="font-size:13px;flex:1;">
              <p style="margin:0 0 4px 0;font-weight:600;">${title}</p>
              ${color ? `<p style="margin:0 0 4px 0;">Couleur : <strong>${color}</strong></p>` : ""}
              <p style="margin:0 0 4px 0;">Prix : <strong>${priceLabel}</strong></p>
            </div>
          </div>
        `;
      })
      .join("");

    return sendEmail({
      to: process.env.SELLER_EMAIL,
      subject: `💳 Nouvelle commande : ${processedCreations.length} article${processedCreations.length > 1 ? "s" : ""}`,
      html: emailTemplate(`
        <h1 style="font-size:18px;margin:0 0 12px 0;">Nouvelle commande confirmée</h1>
        <p style="font-size:14px;margin:0 0 12px 0;">
          <strong>${buyerName}</strong> (${buyerContact}) a effectué un paiement pour ${processedCreations.length} article${processedCreations.length > 1 ? "s" : ""} :
        </p>

        ${sellerItemsHTML}

        <p style="font-size:12px;margin-top:20px;color:#6b7280;">
          <a href="${appUrl}/admin/reservations" style="display:inline-block;background:#0f172a;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Gérer les commandes</a>
        </p>
      `),
    });
  };

  return async () => {
    // sendEmail throw en cas d'échec : allSettled garantit qu'aucun échec ne remonte
    const results = await Promise.allSettled([sendBuyerEmail(), sendSellerEmail()]);
    const labels = ["acheteur", "vendeur"];
    results.forEach((result, i) => {
      if (result.status === "rejected") {
        console.error(
          `[FULFILL] Échec de l'email ${labels[i]}:`,
          (result.reason as any)?.message || result.reason
        );
      }
    });
  };
}

/**
 * Libère les articles d'une session Checkout expirée (checkout.session.expired) :
 * - passe les réservations encore "pending" de cette session à "cancelled" / "failed"
 *   (cancelledBy volontairement absent : l'enum du modèle n'accepte que "admin"/"user",
 *   aucun ne correspond à une expiration automatique) ;
 * - libère les pièces dont le verrou appartient ENCORE à ces réservations (un autre
 *   acheteur a pu verrouiller la pièce depuis).
 * Idempotent : un événement rejoué ne trouve plus de réservation "pending".
 */
export async function releaseExpiredCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<{ cancelledCount: number }> {
  const reservationIds: string[] = session.metadata?.reservationIds
    ? JSON.parse(session.metadata.reservationIds)
    : [];

  const query =
    reservationIds.length > 0
      ? { _id: mongoose.trusted({ $in: reservationIds }) }
      : { stripeCheckoutSessionId: session.id };

  const pendingReservations = await Reservation.find({
    ...query,
    paymentStatus: "pending",
  });

  if (pendingReservations.length === 0) {
    console.log(`[FULFILL] Session expirée ${session.id}: rien à libérer`);
    return { cancelledCount: 0 };
  }

  // Passage atomique pending → failed : seules les réservations basculées par CET
  // appel libèrent leur pièce (deux événements concurrents ne libèrent rien deux fois)
  const expired: any[] = [];
  for (const reservation of pendingReservations) {
    const updated = await Reservation.findOneAndUpdate(
      { _id: reservation._id, paymentStatus: "pending" },
      {
        $set: {
          status: "cancelled",
          paymentStatus: "failed",
          cancelReason: "Session de paiement expirée",
        },
      }
    );
    if (updated) expired.push(updated);
  }

  const releasedCount = await releaseCreationLocks(
    expired.map((r) => ({ creationId: r.creationId, reservationId: r._id }))
  );

  if (releasedCount > 0) {
    // Les articles redeviennent disponibles sur la vitrine
    revalidateCatalog();
  }

  console.log(
    `[FULFILL] Session expirée ${session.id}: ${expired.length} réservation(s) annulée(s), ${releasedCount} création(s) libérée(s)`
  );

  return { cancelledCount: expired.length };
}

/**
 * Remboursement intégral fait depuis le tableau de bord Stripe (événement charge.refunded) :
 * les articles encore payés de ce paiement passent remboursés et annulés, et leurs pièces
 * sont remises en vente (sauf revendues depuis). Un remboursement partiel n'est que
 * journalisé : il ne dit pas quel article est remboursé, l'admin ajuste la commande.
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge
): Promise<{ refundedCount: number }> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return { refundedCount: 0 };

  if (!charge.refunded) {
    console.log(
      `[FULFILL] Remboursement partiel du paiement ${paymentIntentId} (${charge.amount_refunded / 100} €) : commande à ajuster à la main`
    );
    return { refundedCount: 0 };
  }

  const paid = await Reservation.find({ stripePaymentIntentId: paymentIntentId, paymentStatus: "paid" });
  let refundedCount = 0;
  let released = false;
  for (const reservation of paid) {
    // Passage atomique paid → refunded : un événement rejoué ne traite rien deux fois
    const updated = await Reservation.findOneAndUpdate(
      { _id: reservation._id, paymentStatus: "paid" },
      {
        $set: {
          paymentStatus: "refunded",
          status: "cancelled",
          cancelledBy: "admin",
          cancelReason: "Commande remboursée",
        },
      }
    );
    if (!updated) continue;
    refundedCount++;
    if (updated.creationId && (await releaseSoldCreation(updated.creationId, updated._id))) released = true;
  }

  if (released) revalidateCatalog();
  if (refundedCount > 0) revalidateOrders();
  return { refundedCount };
}
