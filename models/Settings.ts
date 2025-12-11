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
  },
  { timestamps: true }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);