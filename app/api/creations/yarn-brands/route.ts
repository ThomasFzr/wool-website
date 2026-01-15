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
    
    // Récupérer les marques enregistrées dans YarnBrand avec leurs prix
    const savedBrands = await YarnBrand.find({})
      .select('brand pricePerHundredGrams')
      .lean();
    
    // Créer une map des marques avec leurs prix
    const brandsMap = new Map<string, { brand: string; price?: number }>();
    
    savedBrands.forEach((b: any) => {
      const brandName = b.brand.trim();
      brandsMap.set(brandName.toLowerCase(), {
        brand: brandName,
        price: b.pricePerHundredGrams,
      });
    });
    
    // Récupérer toutes les marques de fil uniques et non vides des créations
    const creations = await Creation.find({
      yarnBrand: { $exists: true, $nin: [null, ""] }
    })
      .select('yarnBrand')
      .lean();

    // Ajouter les marques des créations qui ne sont pas déjà dans la map
    creations.forEach((c: any) => {
      const brandName = c.yarnBrand?.trim();
      if (brandName && brandName.length > 0) {
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
