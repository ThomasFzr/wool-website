import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { revalidateCatalog } from "@/lib/revalidate";
import { generateUniqueSlug } from "@/lib/slug";

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
        .where({ hidden: { $ne: true } }); // Exclure les créations cachées
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

    await connectToDatabase();
    const body = await req.json();

    // Validation des champs obligatoires
    if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
      return NextResponse.json(
        { error: "Le titre est obligatoire." },
        { status: 400 }
      );
    }
    if (!body.type || typeof body.type !== 'string' || body.type.trim() === '') {
      return NextResponse.json(
        { error: "Le type d'article est obligatoire." },
        { status: 400 }
      );
    }
    if (!body.price || typeof body.price !== 'number' || body.price <= 0) {
      return NextResponse.json(
        { error: "Le prix est obligatoire et doit être supérieur à 0." },
        { status: 400 }
      );
    }
    if (!body.color || typeof body.color !== 'string' || body.color.trim() === '') {
      return NextResponse.json(
        { error: "La couleur est obligatoire." },
        { status: 400 }
      );
    }

    const images: string[] =
      Array.isArray(body.images) && body.images.length
        ? body.images
        : body.imageUrl
        ? [body.imageUrl]
        : [];

    const imagePublicIds: string[] =
      Array.isArray(body.imagePublicIds) && body.imagePublicIds.length
        ? body.imagePublicIds
        : [];

    // Récupérer le displayOrder maximum actuel
    const maxOrderCreation = await Creation.findOne().sort({ displayOrder: -1 }).select('displayOrder').lean();
    const nextDisplayOrder = maxOrderCreation ? ((maxOrderCreation as any).displayOrder || 0) + 1 : 1;

    // Générer un slug unique
    const slug = await generateUniqueSlug(body.title);

    const creation = await Creation.create({
      title: body.title.trim(),
      slug,
      description: body.description,
      seoDescription: body.seoDescription,
      imageUrl: body.imageUrl ?? images[0] ?? undefined,
      images,
      imagePublicIds,
      price: body.price,
      color: body.color.trim(),
      type: body.type.trim(),
      displayOrder: nextDisplayOrder,
      showAsNew: body.showAsNew !== undefined ? body.showAsNew : true,
      hidden: body.hidden !== undefined ? body.hidden : true, // Nouveaux articles cachés par défaut
      yarnBrand: body.yarnBrand,
      weight: body.weight,
      yarnPrice: body.yarnPrice,
      relatedCreations: body.relatedCreations || [],
    });

    // 🔄 Invalider le cache immédiatement après création
    revalidateCatalog();

    return NextResponse.json(creation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}