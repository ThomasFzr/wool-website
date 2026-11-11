import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { destroyUnusedImages } from "@/lib/cloudinary-images";

const MAX_IDS = 100;

/**
 * POST /api/admin/cloudinary-cleanup { publicIds: string[] }
 * Appelé par le formulaire admin pour les images envoyées puis abandonnées (formulaire
 * annulé, image retirée avant enregistrement). Les images encore utilisées sont gardées.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const publicIds = body?.publicIds;
    if (!Array.isArray(publicIds) || publicIds.length > MAX_IDS) {
      return NextResponse.json({ error: "publicIds invalides" }, { status: 400 });
    }

    await connectToDatabase();
    const deleted = await destroyUnusedImages(publicIds);
    return NextResponse.json({ deleted });
  } catch (err) {
    console.error("[cloudinary-cleanup] Error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
