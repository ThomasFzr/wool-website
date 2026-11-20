import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import YarnBrand from "@/models/YarnBrand";
import { checkAdminAuth } from "@/lib/auth";

// Désactiver le cache pour cette route API
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    // Vérifier que l'utilisateur est admin
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();
    
    // Marques enregistrées + marques distinctes des créations, en parallèle
    const [savedBrands, creationBrands] = await Promise.all([
      YarnBrand.find({})
        .select('brand pricePerHundredGrams')
        .lean(),
      Creation.distinct('yarnBrand', {
        yarnBrand: mongoose.trusted({ $exists: true, $nin: [null, ""] })
      }),
    ]);

    // Créer une map des marques avec leurs prix
    const brandsMap = new Map<string, { brand: string; price?: number }>();

    savedBrands.forEach((b: any) => {
      const brandName = b.brand.trim();
      brandsMap.set(brandName.toLowerCase(), {
        brand: brandName,
        price: b.pricePerHundredGrams,
      });
    });

    // Ajouter les marques des créations qui ne sont pas déjà dans la map
    creationBrands.forEach((raw: any) => {
      const brandName = typeof raw === "string" ? raw.trim() : "";
      if (brandName.length > 0) {
        const key = brandName.toLowerCase();
        if (!brandsMap.has(key)) {
          brandsMap.set(key, { brand: brandName });
        }
      }
    });

    // Convertir en tableau et trier
    const allBrands = Array.from(brandsMap.values()).sort((a, b) =>
      a.brand.localeCompare(b.brand, 'fr')
    );

    return NextResponse.json(allBrands);
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}
