import { NextRequest, NextResponse } from "next/server";
import { generateProductDescription } from "@/lib/gemini";
import { checkAdminAuth } from "@/lib/auth";
import { z } from "zod";
import { parseBody, requiredText } from "@/lib/validation";

const REQUIRED = "Les champs type, color, material et price sont requis";
const PRICE_MESSAGE = "Le prix doit être un nombre valide";
// Les valeurs partent dans le prompt envoyé à Gemini : longueurs bornées
const descriptionSchema = z.object({
  type: requiredText(100, REQUIRED),
  color: requiredText(100, REQUIRED),
  material: requiredText(100, REQUIRED),
  // Le formulaire peut envoyer le prix en texte
  price: z.union([z.number(), z.string()], REQUIRED).transform(Number).pipe(z.number(PRICE_MESSAGE).finite(PRICE_MESSAGE).min(0, PRICE_MESSAGE)),
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    // Fonctionnalité admin uniquement : protège le quota Gemini
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const parsed = await parseBody(req, descriptionSchema);
    if (!parsed.ok) return parsed.response;
    const { type, color, material, price: priceNumber } = parsed.data;

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
