import { NextRequest, NextResponse } from "next/server";
import { generateProductDescription } from "@/lib/gemini";
import { checkAdminAuth } from "@/lib/auth";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Fonctionnalité admin uniquement : protège le quota Gemini
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const body = await req.json();
    const { type, color, material, price } = body;

    // Validation des données
    if (!type || !color || !material || price === undefined) {
      return NextResponse.json(
        { error: "Les champs type, color, material et price sont requis" },
        { status: 400 }
      );
    }

    // Conversion du prix en nombre si nécessaire
    const priceNumber = typeof price === 'string' ? parseFloat(price) : price;

    if (isNaN(priceNumber)) {
      return NextResponse.json(
        { error: "Le prix doit être un nombre valide" },
        { status: 400 }
      );
    }

    // Génération de la description
    const description = await generateProductDescription({
      type,
      color,
      material,
      price: priceNumber,
    });

    return NextResponse.json({ description });
  } catch (error) {
    console.error("Erreur lors de la génération de la description:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur lors de la génération de la description" },
      { status: 500 }
    );
  }
}
