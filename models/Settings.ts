import mongoose, { Schema } from "mongoose";

const settingsSchema = new Schema(
  {
    _id: { type: String, default: "main" },
    title: String,
    subtitle: String,
    colors: { 
      type: [String], 
      default: [
        "Blanc",
        "Noir",
        "Gris",
        "Beige",
        "Marron",
        "Rouge",
        "Rose",
        "Rose poudré",
        "Orange",
        "Jaune",
        "Vert",
        "Bleu",
        "Bleu marine",
        "Violet",
        "Multicolore",
      ]
    },
    types: { 
      type: [String], 
      default: ["bonnet", "tour de cou", "bandeau"]
    },
    // Frais de livraison
    shippingCost: {
      type: Number,
      default: 5,
    },
    // Conditions pour la remise en main propre
    pickupConditions: {
      enabled: {
        type: Boolean,
        default: false,
      },
      minimumAmount: {
        type: Number,
        default: 0,
      },
      allowedPostalCodes: {
        type: [String],
        default: [],
      },
      message: {
        type: String,
        default: "",
      },
    },
    // Prompt système pour la génération de descriptions avec Gemini
    systemPrompt: {
      type: String,
      default: `Tu es un expert en copywriting pour "MailleMum", une boutique de créations artisanales tricotées main.
Rédige une description produit optimisée SEO (environ 150 mots).
Ton : Chaleureux, artisanal, authentique, mettant en avant le fait-main français.
Formatage : Utilise du HTML simple (<p>, <strong>) pour aérer le texte.

RÈGLES STRICTES : 
- Si la matière fournie contient "acrylique", "synthétique" ou "polyester", il est INTERDIT d'utiliser le mot "laine". Utilise à la place : "maille", "fil doux", "tricot", "fibre".
- Si la matière est "laine", "alpaga" ou "mérinos", tu peux utiliser le mot "laine".
- INTERDICTION ABSOLUE : Ne mentionne JAMAIS la marque de laine ou de fil utilisée dans la description. Parle uniquement de la qualité du fil, de sa douceur, de sa texture, mais jamais de sa marque commerciale.`,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);