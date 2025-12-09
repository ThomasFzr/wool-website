import dotenv from "dotenv";
import path from "path";
import { connectToDatabase } from "../lib/db";
import Creation from "../models/Creation";

// Charger les variables d'environnement AVANT tout import
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Génère un slug à partir d'un titre
 * Exemple: "Mon Bonnet Rouge" -> "mon-bonnet-rouge"
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD") // Décompose les accents
    .replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/[^a-z0-9]+/g, "-") // Remplace les caractères spéciaux par des tirets
    .replace(/^-+|-+$/g, ""); // Supprime les tirets au début et à la fin
}

/**
 * Génère des slugs uniques pour toutes les créations existantes
 */
async function generateSlugs() {
  try {
    await connectToDatabase();
    console.log("📦 Connexion à la base de données...");

    const creations = await Creation.find({ slug: { $exists: false } });
    console.log(`✨ ${creations.length} créations sans slug trouvées`);

    for (const creation of creations) {
      let baseSlug = generateSlug(creation.title);
      let slug = baseSlug;
      let counter = 1;

      // Vérifie l'unicité du slug
      while (await Creation.findOne({ slug, _id: { $ne: creation._id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      creation.slug = slug;
      await creation.save();
      console.log(`✅ ${creation.title} -> ${slug}`);
    }

    console.log("🎉 Tous les slugs ont été générés !");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erreur:", error);
    process.exit(1);
  }
}

generateSlugs();
