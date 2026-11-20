import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { checkAdminAuth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import YarnBrand from "@/models/YarnBrand";
import Creation from "@/models/Creation";
import { z } from "zod";
import { idParams, parseBody, parseQuery, requiredText } from "@/lib/validation";

const PRICE_MESSAGE = "Marque et prix requis";
const brandSchema = z.object({
  brand: requiredText(100, PRICE_MESSAGE),
  pricePerHundredGrams: z.number(PRICE_MESSAGE).positive(PRICE_MESSAGE).max(10_000, "Prix trop élevé."),
});

// GET - Récupérer toutes les marques (enregistrées + celles des créations)
export async function GET() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    await connectToDatabase();

    // Marques enregistrées et marques issues des créations, en parallèle
    const [savedBrands, creations] = await Promise.all([
      YarnBrand.find({}).sort({ brand: 1 }).lean(),
      Creation.find({
        yarnBrand: mongoose.trusted({ $exists: true, $ne: null }),
        yarnPrice: mongoose.trusted({ $exists: true, $ne: null }),
      })
        .select("yarnBrand yarnPrice")
        .lean(),
    ]);

    // Créer une map avec les marques enregistrées
    const brandsMap = new Map<string, { _id?: string; brand: string; pricePerHundredGrams: number; fromCreations?: boolean }>();
    
    savedBrands.forEach((brand: any) => {
      brandsMap.set(brand.brand.toLowerCase(), {
        _id: brand._id.toString(),
        brand: brand.brand,
        pricePerHundredGrams: brand.pricePerHundredGrams,
      });
    });

    // Ajouter les marques des créations qui ne sont pas encore enregistrées
    creations.forEach((creation: any) => {
      const brandName = creation.yarnBrand.trim();
      const brandKey = brandName.toLowerCase();
      
      if (!brandName) return;
      
      if (!brandsMap.has(brandKey)) {
        brandsMap.set(brandKey, {
          brand: brandName,
          pricePerHundredGrams: creation.yarnPrice,
          fromCreations: true, // Marque non enregistrée, vient des créations
        });
      }
    });

    // Convertir en tableau et trier
    const brands = Array.from(brandsMap.values()).sort((a, b) =>
      a.brand.localeCompare(b.brand, "fr")
    );

    return NextResponse.json(brands);
  } catch (error) {
    console.error("Erreur lors de la récupération des marques:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST - Ajouter ou mettre à jour une marque
export async function POST(request: Request) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const parsed = await parseBody(request, brandSchema);
    if (!parsed.ok) return parsed.response;
    const { brand, pricePerHundredGrams } = parsed.data;

    await connectToDatabase();

    // Vérifier si la marque existe déjà
    const existingBrand = await YarnBrand.findOne({ brand });
    
    if (existingBrand) {
      // Mettre à jour
      existingBrand.pricePerHundredGrams = pricePerHundredGrams;
      await existingBrand.save();
      return NextResponse.json(existingBrand);
    } else {
      // Créer
      const newBrand = await YarnBrand.create({
        brand,
        pricePerHundredGrams,
      });
      return NextResponse.json(newBrand);
    }
  } catch (error) {
    console.error("Erreur lors de l'ajout de la marque:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE - Supprimer une marque
export async function DELETE(request: Request) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const parsed = parseQuery(new URL(request.url).searchParams, idParams);
    if (!parsed.ok) return parsed.response;
    const { id } = parsed.data;

    await connectToDatabase();

    const deleted = await YarnBrand.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur lors de la suppression de la marque:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
