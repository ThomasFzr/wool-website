import mongoose from "mongoose";
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/revalidate";
import { generateUniqueSlug } from "@/lib/slug";
import { sanitizeDescriptionHtml } from "@/lib/sanitize";
import { parseBody } from "@/lib/validation";
import { createCreationSchema } from "@/lib/schemas/creation";

// Désactiver le cache pour cette route API pour éviter les problèmes de synchronisation
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    
    // Vérifier si l'utilisateur est admin pour inclure les champs admin
    const session = await checkAdminAuth();
    const isAdmin = session !== null;
    
    // Exclure les champs admin (yarnBrand, weight, yarnPrice) pour les utilisateurs publics
    // Les admins voient tous les champs
    // Filtrer les créations cachées pour les utilisateurs publics
    let query = Creation.find();
    if (!isAdmin) {
      query = query
        .select("-yarnBrand -weight -yarnPrice")
        .where({ hidden: mongoose.trusted({ $ne: true }) }); // Exclure les créations cachées
    }
    
    const creations = await query
      .populate('relatedCreations', 'title imageUrl images price color type slug sold hidden')
      .sort({ displayOrder: -1, createdAt: -1 })
      .lean();
    
    // Filtrer les relatedCreations cachées pour les utilisateurs publics
    if (!isAdmin) {
      const filteredCreations = creations.map((creation: any) => {
        if (creation.relatedCreations && Array.isArray(creation.relatedCreations)) {
          creation.relatedCreations = creation.relatedCreations.filter(
            (related: any) => !related.hidden
          );
        }
        return creation;
      });
      return NextResponse.json(filteredCreations);
    }
    
    return NextResponse.json(creations);
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Champs validés et typés ; les clés inconnues du body sont ignorées
    const parsed = await parseBody(req, createCreationSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    await connectToDatabase();

    const images: string[] = body.images?.length ? body.images : body.imageUrl ? [body.imageUrl] : [];
    const imagePublicIds: string[] = body.imagePublicIds ?? [];

    // Récupérer le displayOrder maximum actuel
    const maxOrderCreation = await Creation.findOne().sort({ displayOrder: -1 }).select('displayOrder').lean();
    const nextDisplayOrder = maxOrderCreation ? ((maxOrderCreation as any).displayOrder || 0) + 1 : 1;

    // Générer un slug unique
    const slug = await generateUniqueSlug(body.title);

    const creation = await Creation.create({
      title: body.title,
      slug,
      description: body.description,
      // Rendue en HTML sur la fiche produit : nettoyée à l'enregistrement (XSS)
      seoDescription: body.seoDescription == null ? undefined : sanitizeDescriptionHtml(body.seoDescription),
      imageUrl: body.imageUrl ?? images[0] ?? undefined,
      images,
      imagePublicIds,
      price: body.price,
      color: body.color,
      type: body.type,
      displayOrder: nextDisplayOrder,
      showAsNew: body.showAsNew ?? true,
      hidden: body.hidden ?? true, // Nouveaux articles cachés par défaut
      yarnBrand: body.yarnBrand,
      weight: body.weight,
      yarnPrice: body.yarnPrice,
      relatedCreations: body.relatedCreations ?? [],
    });

    // 🔄 Invalider le cache immédiatement après création
    revalidateCatalog();

    return NextResponse.json(creation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}