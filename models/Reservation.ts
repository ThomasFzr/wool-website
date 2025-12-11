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
      enum: ["pending", "validated", "cancelled"],
      default: "pending",
    },

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