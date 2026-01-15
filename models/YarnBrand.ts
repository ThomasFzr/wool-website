import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    brand: { type: String, required: true, unique: true },
    pricePerHundredGrams: { type: Number, required: true }, // Prix en €/100g
  },
  { timestamps: true }
);

export default mongoose.models.YarnBrand || mongoose.model("YarnBrand", schema);
