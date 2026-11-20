import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/revalidate";
import { z } from "zod";
import { objectId, parseBody } from "@/lib/validation";

// bulkWrite n'applique pas sanitizeFilter : sans ce schéma, un id `{"$ne": null}`
// réordonnait toutes les créations d'un coup
const reorderSchema = z.object({
  orderedIds: z.array(objectId, "orderedIds doit être une liste.").max(1000, "Trop de créations."),
});

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const parsed = await parseBody(req, reorderSchema);
    if (!parsed.ok) return parsed.response;
    const { orderedIds } = parsed.data; // IDs dans le nouvel ordre

    await connectToDatabase();

    // Mettre à jour l'ordre d'affichage (displayOrder décroissant depuis la longueur)
    // Le premier élément aura le displayOrder le plus élevé
    const updates = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { displayOrder: orderedIds.length - index } },
      },
    }));

    await Creation.bulkWrite(updates);

    // 🔄 Invalider le cache pour que le nouvel ordre soit visible immédiatement
    revalidateCatalog();

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}
