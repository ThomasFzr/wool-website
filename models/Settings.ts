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
  },
  { timestamps: true }
);

export default mongoose.models.Settings ||
  mongoose.model("Settings", settingsSchema);