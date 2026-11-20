import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";

export async function GET() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    await connectToDatabase();

    // Récupérer toutes les créations avec marque de fil et prix
    const creations = await Creation.find({
      yarnBrand: mongoose.trusted({ $exists: true, $ne: null }),
      yarnPrice: mongoose.trusted({ $exists: true, $ne: null }),
    })
      .select("yarnBrand yarnPrice")
      .lean();

    // Agréger par marque de fil
    const brandsMap = new Map<string, { brand: string; pricePerKg: number; count: number }>();

    creations.forEach((creation: any) => {
      const brand = creation.yarnBrand.trim();
      
      // Ignorer les marques vides
      if (!brand) return;
      
      const pricePerKg = creation.yarnPrice * 10; // Convertir €/100g en €/kg

      if (brandsMap.has(brand)) {
        const existing = brandsMap.get(brand)!;
        // Calculer la moyenne des prix
        const newCount = existing.count + 1;
        const newPricePerKg = (existing.pricePerKg * existing.count + pricePerKg) / newCount;
        brandsMap.set(brand, {
          brand,
          pricePerKg: newPricePerKg,
          count: newCount,
        });
      } else {
        brandsMap.set(brand, {
          brand,
          pricePerKg,
          count: 1,
        });
      }
    });

    // Convertir en tableau et trier par nom de marque
    const brands = Array.from(brandsMap.values()).sort((a, b) =>
      a.brand.localeCompare(b.brand, "fr")
    );

    return NextResponse.json(brands);
  } catch (error) {
    console.error("Erreur lors de la récupération des marques:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}
