// Script pour initialiser salesCount sur les créations existantes
// Charger les variables d'environnement AVANT tous les autres imports
require("dotenv").config({ path: ".env" });

import { connectToDatabase } from "../lib/db";
import CreationModel from "../models/Creation";

async function initSalesCount() {
  try {
    await connectToDatabase();

    // Mettre à jour toutes les créations vendues pour avoir salesCount = 1
    const result = await CreationModel.updateMany(
      { sold: true, salesCount: { $exists: false } },
      { $set: { salesCount: 1 } }
    );

    console.log(`✅ ${result.modifiedCount} créations vendues mises à jour avec salesCount = 1`);

    // Mettre à jour toutes les créations non vendues pour avoir salesCount = 0
    const result2 = await CreationModel.updateMany(
      { sold: false, salesCount: { $exists: false } },
      { $set: { salesCount: 0 } }
    );

    console.log(`✅ ${result2.modifiedCount} créations non vendues mises à jour avec salesCount = 0`);

    // Mettre à jour les créations qui ont déjà salesCount mais sont vendues
    const result3 = await CreationModel.updateMany(
      { sold: true, salesCount: 0 },
      { $set: { salesCount: 1 } }
    );

    console.log(`✅ ${result3.modifiedCount} créations vendues corrigées de 0 à 1`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  }
}

initSalesCount();
