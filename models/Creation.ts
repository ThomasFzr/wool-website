import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    title: { type: String, required: true },
    description: String,
    imageUrl: String,
    images: [String],
    price: Number,
    color: String,
  },
  { timestamps: true }
);

export default mongoose.models.Creation || mongoose.model("Creation", schema);