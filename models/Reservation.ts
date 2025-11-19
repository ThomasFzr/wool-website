import mongoose, { Schema } from "mongoose";

const reservationSchema = new Schema(
  {
    creationId: { type: Schema.Types.ObjectId, ref: "Creation", required: true },
    name: { type: String, required: true },
    contact: { type: String, required: true },
    message: String,
    status: {
      type: String,
      enum: ["pending", "validated", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Reservation ||
  mongoose.model("Reservation", reservationSchema);