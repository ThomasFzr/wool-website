import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { deletionContext, destroyUnusedImages } from "@/lib/cloudinary-images";
import { z } from "zod";
import { parseBody } from "@/lib/validation";

const MAX_IDS = 100;

const cleanupSchema = z.object({
  publicIds: z.array(z.string().min(1).max(300), "publicIds invalides").max(MAX_IDS, "publicIds invalides"),
});

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

    const parsed = await parseBody(req, cleanupSchema);
    if (!parsed.ok) return parsed.response;
    const { publicIds } = parsed.data;

    await connectToDatabase();
    const deleted = await destroyUnusedImages(publicIds, deletionContext("form-cleanup", session, req));
    return NextResponse.json({ deleted });
  } catch (err) {
    console.error("[cloudinary-cleanup] Error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
