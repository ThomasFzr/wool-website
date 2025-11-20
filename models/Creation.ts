import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    title: { type: String, required: true },
    description: String,
    imageUrl: String,
    images: [String],
    price: Number,
    color: String,

    reserved: { type: Boolean, default: false },
    reservedName: String,
    reservedContact: String,
    reservedMessage: String,
    reservedAt: Date,

    sold: { type: Boolean, default: false },

  },
  { timestamps: true }
);

export default mongoose.models.Creation || mongoose.model("Creation", schema);