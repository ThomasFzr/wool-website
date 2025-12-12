import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    description: String,
    seoDescription: String, // Description complète pour le référencement
    imageUrl: String,
    images: [String],
    price: Number,
    color: String,
    type: String,
    
    // Champs admin uniquement (non visibles pour les utilisateurs)
    yarnBrand: String, // Marque de laine
    weight: Number, // Poids en grammes
    yarnPrice: Number, // Prix de la laine en euros

    imagePublicIds: [String],
    imagePublicId: String,

    reserved: { type: Boolean, default: false },
    reservedName: String,
    reservedContact: String,
    reservedMessage: String,
    reservedAt: Date,

    sold: { type: Boolean, default: false },
    showAsNew: { type: Boolean, default: true },
    salesCount: { type: Number, default: 0 }, // Nombre de fois que l'article a été vendu

    displayOrder: { type: Number, default: 0 },

  },
  { timestamps: true }
);

export default mongoose.models.Creation || mongoose.model("Creation", schema);