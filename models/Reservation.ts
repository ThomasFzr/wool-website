import mongoose, { Schema } from "mongoose";

// Valeurs autorisées, partagées avec les schémas de validation des routes (lib/validation)
export const RESERVATION_STATUSES = [
  "pending",
  "preparing",
  "shipped",
  "in_transit",
  "delivered",
  "validated",
  "cancelled",
] as const;
export const DELIVERY_MODES = ["pickup", "shipping"] as const;

const schema = new Schema(
  {
    creationId: {
      type: Schema.Types.ObjectId,
      ref: "Creation",
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    name: String,
    contact: String,

    userEmail: String,

    message: String,

    status: {
      type: String,
      enum: RESERVATION_STATUSES,
      default: "pending",
    },
    
    // 📦 Numéro de suivi (tracking)
    trackingNumber: String,
    
    // 📅 Date d'expédition
    shippedAt: Date,

    // ✅ nouvelle raison d'annulation côté client
    cancelReason: String,

    // ✅ qui a annulé : 'admin' ou 'user'
    cancelledBy: {
      type: String,
      enum: ["admin", "user"],
    },

    // 🚚 Mode de livraison
    deliveryMode: {
      type: String,
      enum: DELIVERY_MODES,
      default: "pickup",
    },
    
    // 💰 Prix de l'article au moment de la commande (en euros), figé pour les stats :
    // le prix de la création peut changer ensuite. Absent des commandes antérieures.
    price: Number,

    // 💰 Frais de livraison (en euros)
    shippingCost: {
      type: Number,
      default: 0,
    },
    
    // 📍 Adresse de livraison (pour les bordereaux)
    shippingAddress: {
      name: String,
      line1: String,
      line2: String,
      city: String,
      postalCode: String,
      country: String,
    },
    
    // 🆕 Commande vue par l'admin
    seenByAdmin: {
      type: Boolean,
      default: false,
    },

    // 💳 Informations Stripe
    stripeCheckoutSessionId: String,
    stripePaymentIntentId: String,
    stripeCustomerId: String,
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paidAt: Date,
    // Posé pendant le traitement du paiement (lib/checkout-fulfillment.ts) : tant
    // qu'il est présent, l'email de confirmation de la commande attend.
    fulfillingAt: Date,
  },
  { timestamps: true }
);

// Index sur les champs filtrés par les routes (compte client, admin, webhooks Stripe, stats)
schema.index({ userId: 1, createdAt: -1 });
schema.index({ contact: 1, paymentStatus: 1 });
schema.index({ stripeCheckoutSessionId: 1 });
schema.index({ creationId: 1 });
schema.index({ status: 1, createdAt: -1 });
schema.index({ seenByAdmin: 1, status: 1 });
schema.index({ paymentStatus: 1, createdAt: -1 });

export default mongoose.models.Reservation ||
  mongoose.model("Reservation", schema);