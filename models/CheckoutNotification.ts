import mongoose, { Schema } from "mongoose";

// Une entrée par session Stripe dont l'email de confirmation est parti :
// l'_id unique garantit un seul envoi, même si webhook et verify-session
// terminent en même temps (lib/checkout-fulfillment.ts).
const schema = new Schema(
  {
    _id: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.CheckoutNotification ||
  mongoose.model("CheckoutNotification", schema);
