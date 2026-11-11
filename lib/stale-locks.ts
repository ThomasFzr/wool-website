import { getStripeInstance } from "@/lib/stripe";
import { revalidateCatalog } from "@/lib/revalidate";
import { LOCK_FIELDS_UNSET, releaseCreationLock } from "@/lib/creation-lock";
import {
  fulfillCheckoutSession,
  releaseExpiredCheckoutSession,
} from "@/lib/checkout-fulfillment";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";

// Une session Checkout vit 31 min : au-delà de 35 min, un verrou est suspect
export const STALE_LOCK_AFTER_MS = 35 * 60 * 1000;

export type StaleLocksReport = {
  checked: number;
  /** sessions expirées traitées (pièces libérées) */
  expired: number;
  /** sessions payées dont le webhook n'était pas passé */
  fulfilled: number;
  /** pièces dont la réservation payée n'avait pas marqué la vente */
  sold: number;
  /** verrous levés car leur réservation était annulée */
  released: number;
};

/**
 * Filet de sécurité des verrous (cron) : tout repose sinon sur le webhook
 * `checkout.session.expired`. Pour chaque pièce verrouillée depuis plus de 35 min,
 * on regarde où en est la réservation qui la détient :
 * - session Stripe expirée → libération (comme le webhook) ;
 * - session payée → enregistrement de la commande (webhook manqué) ;
 * - réservation déjà payée → la pièce est marquée vendue ;
 * - réservation annulée → le verrou est levé.
 * Un verrou sans détenteur ni checkout en attente (réservation posée à la main
 * par l'admin) n'est jamais touché ; un verrou sans détenteur posé par un ancien
 * checkout est levé une fois ce checkout clos.
 */
export async function releaseStaleLocks(now = new Date()): Promise<StaleLocksReport> {
  const report: StaleLocksReport = { checked: 0, expired: 0, fulfilled: 0, sold: 0, released: 0 };
  const stripe = getStripeInstance();

  const creations = await Creation.find({
    reserved: true,
    sold: { $ne: true },
    reservedAt: { $lt: new Date(now.getTime() - STALE_LOCK_AFTER_MS) },
  })
    .select("_id reservedByReservationId")
    .lean<any[]>();

  for (const creation of creations) {
    report.checked++;
    try {
      // Détenteur du verrou ; à défaut (verrou posé avant l'introduction du
      // détenteur), les checkouts encore en attente sur cette pièce
      const candidates: any[] = creation.reservedByReservationId
        ? await Reservation.find({ _id: creation.reservedByReservationId }).lean()
        : await Reservation.find({
            creationId: creation._id,
            paymentStatus: "pending",
            stripeCheckoutSessionId: { $exists: true, $ne: null },
          }).lean();

      for (const reservation of candidates) {
        if (reservation.paymentStatus === "paid" && reservation.status !== "cancelled") {
          // Paiement enregistré mais vente non marquée (traitement interrompu)
          const result = await Creation.updateOne(
            { _id: creation._id, sold: { $ne: true } },
            { $set: { sold: true, reserved: false }, $unset: LOCK_FIELDS_UNSET, $inc: { salesCount: 1 } }
          );
          if (result.modifiedCount > 0) report.sold++;
          continue;
        }

        if (reservation.paymentStatus !== "pending") {
          if (await releaseCreationLock(creation._id, reservation._id)) report.released++;
          continue;
        }

        if (!reservation.stripeCheckoutSessionId) continue;
        const session = await stripe.checkout.sessions.retrieve(reservation.stripeCheckoutSessionId);
        if (session.status === "expired") {
          await releaseExpiredCheckoutSession(session);
          report.expired++;
        } else if (session.status === "complete") {
          const result = await fulfillCheckoutSession(session);
          if (result.paid) report.fulfilled++;
        }
        // Session encore ouverte : rien à faire, Stripe l'expirera
      }

      // Verrou sans détenteur posé par un checkout (avant l'introduction du
      // détenteur) : levé une fois tous ses checkouts clos
      if (!creation.reservedByReservationId && candidates.length > 0) {
        const stillPending = await Reservation.exists({
          _id: { $in: candidates.map((r) => r._id) },
          paymentStatus: "pending",
        });
        if (!stillPending) {
          const result = await Creation.updateOne(
            { _id: creation._id, sold: { $ne: true }, reserved: true, reservedByReservationId: { $exists: false } },
            { $set: { reserved: false }, $unset: LOCK_FIELDS_UNSET }
          );
          if (result.modifiedCount > 0) report.released++;
        }
      }
    } catch (err) {
      console.error(`[STALE-LOCKS] Pièce ${creation._id} :`, err);
    }
  }

  if (report.sold + report.released > 0) revalidateCatalog();
  console.log(`[STALE-LOCKS] ${JSON.stringify(report)}`);
  return report;
}
