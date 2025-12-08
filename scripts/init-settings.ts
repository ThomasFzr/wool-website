// Script pour initialiser les paramètres de l'application
import mongoose from "mongoose";
import Settings from "../models/Settings";

const MONGODB_URI = process.env.MONGODB_URI || "";

async function initSettings() {
  try {
    console.log("Connexion à MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connecté à MongoDB");

    // Vérifier si les paramètres existent déjà
    const existing = await Settings.findById("main");
    
    if (existing) {
      console.log("ℹ️ Les paramètres existent déjà");
      console.log("Couleurs actuelles:", existing.colors || "[]");
      console.log("Types actuels:", existing.types || "[]");
      
      // Mettre à jour si les champs n'existent pas
      if (!existing.colors || existing.colors.length === 0) {
        existing.colors = [
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
        ];
        await existing.save();
        console.log("✅ Couleurs par défaut ajoutées");
      }
      
      if (!existing.types || existing.types.length === 0) {
        existing.types = ["bonnet", "tour de cou", "bandeau"];
        await existing.save();
        console.log("✅ Types par défaut ajoutés");
      }
    } else {
      // Créer les paramètres par défaut
      const settings = new Settings({
        _id: "main",
        title: "Les créations en laine de maman",
        subtitle: "Clique sur une création pour voir toutes les photos.",
        colors: [
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
        ],
        types: ["bonnet", "tour de cou", "bandeau"],
      });

      await settings.save();
      console.log("✅ Paramètres par défaut créés avec succès");
    }

    console.log("\n✅ Initialisation terminée");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  }
}

initSettings();
