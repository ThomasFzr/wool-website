import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";

/**
 * GET /api/creations/availability?ids=a,b,c
 * Renvoie les ids encore achetables parmi ceux fournis, pour purger le panier
 * des articles vendus ou supprimés (le panier vit dans le localStorage du
 * navigateur et peut donc être obsolète).
 *
 * Note : le flag `reserved` n'est PAS un critère d'exclusion — il est posé sur
 * l'article pendant le propre checkout de l'acheteur, on ne doit pas vider son
 * panier pendant qu'il paie. Seuls les articles vendus, cachés ou supprimés
 * sont retirés.
 */
export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get("ids") || "";
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => mongoose.isValidObjectId(id));

    if (ids.length === 0) {
      return NextResponse.json({ available: [] });
    }

    await connectToDatabase();

    const creations = await CreationModel.find({
      _id: mongoose.trusted({ $in: ids }),
      sold: mongoose.trusted({ $ne: true }),
      hidden: mongoose.trusted({ $ne: true }),
    })
      .select("_id")
      .lean();

    return NextResponse.json({
      available: creations.map((c: any) => c._id.toString()),
    });
  } catch (error) {
    console.error("Erreur lors de la vérification de disponibilité:", error);
    // En cas d'erreur, ne rien purger (null = indéterminé)
    return NextResponse.json({ available: null });
  }
}
