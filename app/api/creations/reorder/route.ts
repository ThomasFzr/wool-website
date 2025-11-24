import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();
    const body = await req.json();
    const { orderedIds } = body; // Array d'IDs dans le nouvel ordre

    if (!Array.isArray(orderedIds)) {
      return new NextResponse("orderedIds must be an array", { status: 400 });
    }

    // Mettre à jour l'ordre d'affichage (displayOrder décroissant depuis la longueur)
    // Le premier élément aura le displayOrder le plus élevé
    const updates = orderedIds.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { displayOrder: orderedIds.length - index } },
      },
    }));

    await Creation.bulkWrite(updates);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}
