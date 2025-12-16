import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
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
    
    // Récupérer toutes les marques de fil uniques et non vides
    const creations = await Creation.find({
      yarnBrand: { $exists: true, $nin: [null, ""] }
    })
      .select('yarnBrand')
      .lean();

    // Extraire les marques uniques, les trimmer et filtrer les valeurs vides
    const brands = Array.from(
      new Set(
        creations
          .map((c: any) => c.yarnBrand?.trim())
          .filter((brand: string | undefined) => brand && brand.length > 0)
      )
    ).sort() as string[];

    return NextResponse.json(brands);
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}
