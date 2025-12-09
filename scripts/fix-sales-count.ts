import { connectToDatabase } from "../lib/db";
import Creation from "../models/Creation";
import mongoose from "mongoose";

async function fixSalesCount() {
  try {
    await connectToDatabase();
    console.log("✅ Connecté à MongoDB");

    // Trouver toutes les créations vendues sans salesCount ou avec salesCount = 0
    const soldCreations = await Creation.find({
      sold: true,
      $or: [
        { salesCount: { $exists: false } },
        { salesCount: null },
        { salesCount: 0 }
      ]
    });

    console.log(`📦 ${soldCreations.length} création(s) vendue(s) sans salesCount trouvée(s)`);

    if (soldCreations.length === 0) {
      console.log("✨ Aucune mise à jour nécessaire");
      process.exit(0);
    }

    // Mettre à jour chaque création
    for (const creation of soldCreations) {
      await Creation.findByIdAndUpdate(creation._id, {
        $set: { salesCount: 1 }
      });
      console.log(`✅ ${creation.title} : salesCount défini à 1`);
    }

    console.log(`\n✨ Migration terminée : ${soldCreations.length} création(s) mise(s) à jour`);
    
    // Afficher le total des ventes
    const totalSalesResult = await Creation.aggregate([
      { $match: { salesCount: { $exists: true, $ne: null, $gt: 0 } } },
      { $group: { _id: null, totalSales: { $sum: "$salesCount" } } }
    ]);
    const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalSales : 0;
    console.log(`📊 Nombre total de ventes : ${totalSales}`);

    await mongoose.disconnect();
    console.log("👋 Déconnecté de MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur lors de la migration :", error);
    process.exit(1);
  }
}

fixSalesCount();
