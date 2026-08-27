import mongoose, { Schema } from "mongoose";

const schema = new Schema(
  {
    title: { type: String, required: true },
    slug: { type: String, unique: true, sparse: true },
    description: String,
    seoDescription: String, // Description complète pour le référencement
    imageUrl: String,
    images: [String],
    price: { type: Number, required: true, min: 0 },
    color: { type: String, required: true },
    type: { type: String, required: true },

    // Champs admin uniquement (non visibles pour les utilisateurs)
    yarnBrand: String, // Marque de fil
    weight: { type: Number, min: 0 }, // Poids en grammes
    yarnPrice: { type: Number, min: 0 }, // Prix du fil en euros

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
    hidden: { type: Boolean, default: false }, // Cacher l'article du public
    visibleAt: { type: Date }, // Date de première mise en ligne (décompte "nouveau" à partir de là)

    displayOrder: { type: Number, default: 0 },

    // Articles liés (recommandations)
    relatedCreations: [{
      type: Schema.Types.ObjectId,
      ref: "Creation",
    }],

  },
  { timestamps: true }
);

// Index pour la vitrine publique (filtre hidden + tri displayOrder/createdAt)
schema.index({ hidden: 1, displayOrder: -1, createdAt: -1 });

export default mongoose.models.Creation || mongoose.model("Creation", schema);