import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    creationId: {
      type: Schema.Types.ObjectId,
      ref: "Creation",
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
  },
  { timestamps: true }
);

export default mongoose.models.Reservation ||
  mongoose.model("Reservation", schema);