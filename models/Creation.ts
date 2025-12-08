import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    title: { type: String, required: true },
    description: String,
    imageUrl: String,
    images: [String],
    price: Number,
    color: String,
    type: { 
      type: String, 
      enum: ["bonnet", "tour de cou", "bandeau"],
    },

    imagePublicIds: [String],
    imagePublicId: String,

    reserved: { type: Boolean, default: false },
    reservedName: String,
    reservedContact: String,
    reservedMessage: String,
    reservedAt: Date,

    sold: { type: Boolean, default: false },
    isNew: { type: Boolean, default: true },

    displayOrder: { type: Number, default: 0 },

  },
  { timestamps: true }
);

export default mongoose.models.Creation || mongoose.model("Creation", schema);