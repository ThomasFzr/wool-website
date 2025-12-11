import mongoose, { Schema } from "mongoose";

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
      enum: ["pending", "preparing", "shipped", "in_transit", "delivered", "validated", "cancelled"],
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
      enum: ["pickup", "shipping"],
      default: "pickup",
    },
    
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
  },
  { timestamps: true }
);

export default mongoose.models.Reservation ||
  mongoose.model("Reservation", schema);