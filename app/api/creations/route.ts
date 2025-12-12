import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

// Désactiver le cache pour cette route API pour éviter les problèmes de synchronisation
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Génère un slug à partir d'un titre
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    
    // Vérifier si l'utilisateur est admin pour inclure les champs admin
    const session = await checkAdminAuth();
    const isAdmin = session !== null;
    
    // Exclure les champs admin (yarnBrand, weight, yarnPrice) pour les utilisateurs publics
    // Les admins voient tous les champs
    let query = Creation.find();
    if (!isAdmin) {
      query = query.select("-yarnBrand -weight -yarnPrice");
    }
    
    const creations = await query
      .sort({ displayOrder: -1, createdAt: -1 })
      .lean();
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
    let baseSlug = generateSlug(body.title);
    let slug = baseSlug;
    let counter = 1;
    while (await Creation.findOne({ slug })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const creation = await Creation.create({
      title: body.title,
      slug,
      description: body.description,
      seoDescription: body.seoDescription,
      imageUrl: body.imageUrl ?? images[0] ?? undefined,
      images,
      imagePublicIds,
      price: body.price,
      color: body.color,
      type: body.type && body.type !== "" ? body.type : undefined,
      displayOrder: nextDisplayOrder,
      showAsNew: body.showAsNew !== undefined ? body.showAsNew : true,
      yarnBrand: body.yarnBrand,
      weight: body.weight,
      yarnPrice: body.yarnPrice,
    });

    // 🔄 Invalider le cache immédiatement après création
    revalidatePath('/');
    revalidatePath('/api/creations');

    return NextResponse.json(creation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}