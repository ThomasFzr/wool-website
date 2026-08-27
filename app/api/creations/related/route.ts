import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";

const MAX_RESULTS = 4;

/**
 * GET /api/creations/related?ids=a,b,c
 * Renvoie jusqu'à 4 articles liés aux créations du panier (dédupliqués),
 * en excluant les articles du panier et les créations cachées/vendues/réservées.
 */
export async function GET(req: NextRequest) {
  try {
    const idsParam = req.nextUrl.searchParams.get("ids") || "";
    const cartIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => mongoose.isValidObjectId(id));

    if (cartIds.length === 0) {
      return NextResponse.json([]);
    }

    await connectToDatabase();

    const cartCreations = await CreationModel.find({ _id: { $in: cartIds } })
      .select("relatedCreations")
      .populate(
        "relatedCreations",
        "title price images imageUrl slug type reserved sold hidden"
      )
      .lean();

    // Dédupliquer les articles liés et exclure panier / cachés / vendus / réservés
    const cartIdSet = new Set(cartIds);
    const seen = new Set<string>();
    const related: any[] = [];

    for (const creation of cartCreations as any[]) {
      if (!Array.isArray(creation.relatedCreations)) continue;

      for (const item of creation.relatedCreations) {
        if (!item || !item._id) continue;
        const id = item._id.toString();
        if (seen.has(id) || cartIdSet.has(id)) continue;
        if (item.hidden || item.sold || item.reserved) continue;

        seen.add(id);
        related.push({
          _id: id,
          title: item.title,
          price: item.price,
          images: item.images,
          imageUrl: item.imageUrl,
          slug: item.slug,
          type: item.type,
          sold: item.sold,
        });

        if (related.length >= MAX_RESULTS) break;
      }
      if (related.length >= MAX_RESULTS) break;
    }

    return NextResponse.json(related);
  } catch (error) {
    console.error("Erreur lors de la récupération des articles liés:", error);
    return NextResponse.json([]);
  }
}
