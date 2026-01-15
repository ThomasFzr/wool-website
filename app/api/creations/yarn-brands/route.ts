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
    
    // Récupérer les marques enregistrées dans YarnBrand
    const savedBrands = await YarnBrand.find({})
      .select('brand')
      .lean();
    
    const savedBrandNames = savedBrands.map((b: any) => b.brand.trim());
    
    // Récupérer toutes les marques de fil uniques et non vides des créations
    const creations = await Creation.find({
      yarnBrand: { $exists: true, $nin: [null, ""] }
    })
      .select('yarnBrand')
      .lean();

    // Extraire les marques uniques des créations
    const creationBrands = creations
      .map((c: any) => c.yarnBrand?.trim())
      .filter((brand: string | undefined) => brand && brand.length > 0);

    // Fusionner les deux listes et éliminer les doublons
    const allBrands = Array.from(
      new Set([...savedBrandNames, ...creationBrands])
    ).sort() as string[];

    return NextResponse.json(allBrands);
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}
