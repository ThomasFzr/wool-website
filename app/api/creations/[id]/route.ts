import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { checkAdminAuth } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";
import { revalidatePath } from "next/cache";

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

/**
 * Récupère le public_id Cloudinary depuis une URL secure_url
 * Exemple :
 * https://res.cloudinary.com/xxx/image/upload/v12345/folder/image_xyz.webp
 * → folder/image_xyz
 */
function extractPublicId(url?: string | null): string | null {
  if (!url) return null;

  try {
    const parts = url.split("/upload/")[1];
    if (!parts) return null;

    const withoutExtension = parts.split(".")[0];

    return withoutExtension;
  } catch (err) {
    console.error("❌ extractPublicId error:", err);
    return null;
  }
}


async function checkAuth(req: NextRequest) {
  const session = await checkAdminAuth();
  return session !== null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await connectToDatabase();
    
    // Récupérer la création par ID ou slug
    let creation = await Creation.findById(id).lean();
    if (!creation) {
      // Essayer par slug si ce n'est pas un ObjectId valide
      creation = await Creation.findOne({ slug: id }).lean();
    }
    
    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }
    
    // Convertir en format JSON
    const creationData: any = creation;
    return NextResponse.json({
      _id: creationData._id.toString(),
      slug: creationData.slug,
      title: creationData.title,
      description: creationData.description,
      seoDescription: creationData.seoDescription,
      imageUrl: creationData.imageUrl,
      images: creationData.images,
      price: creationData.price,
      color: creationData.color,
      type: creationData.type,
      sold: creationData.sold,
      showAsNew: creationData.showAsNew,
      createdAt: creationData.createdAt ? creationData.createdAt.toString() : undefined,
    });
  } catch (err) {
    console.error("❌ GET error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ok = await checkAuth(req);
    if (!ok) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    await connectToDatabase();
    const body = await req.json();

    // Construire l'objet de mise à jour avec les opérateurs MongoDB
    const setData: any = {};
    const unsetData: any = {};
    const incData: any = {};

    if (body.title !== undefined) {
      setData.title = body.title;
      // Régénérer le slug si le titre change
      let baseSlug = generateSlug(body.title);
      let slug = baseSlug;
      let counter = 1;
      while (await Creation.findOne({ slug, _id: { $ne: id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
      setData.slug = slug;
    }
    if (body.description !== undefined) setData.description = body.description;
    if (body.seoDescription !== undefined) setData.seoDescription = body.seoDescription;
    if (body.imageUrl !== undefined) setData.imageUrl = body.imageUrl;
    if (body.images !== undefined) setData.images = body.images;
    if (body.imagePublicIds !== undefined) {
      setData.imagePublicIds = body.imagePublicIds;
    }
    if (body.price !== undefined) setData.price = body.price;
    if (body.color !== undefined) setData.color = body.color;
    if (body.yarnBrand !== undefined) setData.yarnBrand = body.yarnBrand;
    if (body.weight !== undefined) setData.weight = body.weight;
    if (body.yarnPrice !== undefined) setData.yarnPrice = body.yarnPrice;
    if (body.type !== undefined) {
      // Si type est vide, on le supprime du document, sinon on le met à jour
      if (body.type === "" || body.type === null) {
        unsetData.type = "";
      } else {
        setData.type = body.type;
      }
    }

    if (body.reserved !== undefined) setData.reserved = body.reserved;
    if (body.reservedName !== undefined) setData.reservedName = body.reservedName;
    if (body.reservedContact !== undefined) setData.reservedContact = body.reservedContact;
    if (body.reservedMessage !== undefined) setData.reservedMessage = body.reservedMessage;
    if (body.reservedAt !== undefined) setData.reservedAt = body.reservedAt;
    
    // Gérer le changement de statut "vendu"
    if (body.sold !== undefined) {
      const currentCreation = await Creation.findById(id);
      setData.sold = body.sold;
      
      // Si on marque comme vendu et que ce n'était pas déjà vendu, incrémenter salesCount
      if (body.sold === true && currentCreation && !currentCreation.sold) {
        incData.salesCount = 1;
      }
    }
    
    if (body.showAsNew !== undefined) setData.showAsNew = body.showAsNew;
    if (body.displayOrder !== undefined) setData.displayOrder = body.displayOrder;

    // Construire l'objet update final avec seulement les opérateurs nécessaires
    const update: any = {};
    if (Object.keys(setData).length > 0) {
      update.$set = setData;
    }
    if (Object.keys(unsetData).length > 0) {
      update.$unset = unsetData;
    }
    if (Object.keys(incData).length > 0) {
      update.$inc = incData;
    }

    // Vérifier qu'il y a au moins une opération à effectuer
    if (Object.keys(update).length === 0) {
      const creation = await Creation.findById(id);
      return NextResponse.json(creation);
    }

    // Utiliser updateOne pour forcer la mise à jour, puis relire le document
    const updateResult = await Creation.updateOne(
      { _id: id },
      update,
      { runValidators: false }
    );

    if (updateResult.matchedCount === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Relire le document mis à jour
    const creation = await Creation.findById(id);
    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // 🔄 Invalider le cache après modification
    revalidatePath('/');
    revalidatePath('/api/creations');

    return NextResponse.json(creation);
  } catch (err) {
    console.error("❌ PATCH error:", err);
    return new NextResponse("Server error", { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await checkAdminAuth();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const creation = await Creation.findById(id);

    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // 🔥 1) Supprimer les images Cloudinary par leurs public_id stockés
    if (Array.isArray(creation.imagePublicIds)) {
      for (const publicId of creation.imagePublicIds) {
        if (!publicId) continue;

        try {
          const result = await cloudinary.uploader.destroy(publicId, {
            invalidate: true,
          });
          console.log("Cloudinary destroy", publicId, result);
        } catch (err) {
          console.error("Cloudinary destroy error for", publicId, err);
        }
      }
    }

    // 🔁 2) Fallback pour les anciennes créations sans imagePublicIds :
    // on essaye de déduire le public_id depuis imageUrl/images.
    if (
      (!creation.imagePublicIds ||
        creation.imagePublicIds.length === 0) &&
      (creation.imageUrl || (creation.images && creation.images.length > 0))
    ) {
      const urls: string[] = [
        creation.imageUrl,
        ...(creation.images || []),
      ].filter(Boolean) as string[];

      for (const url of urls) {
        try {
          const match = url.match(/upload\/(?:v\d+\/)?([^\.]+)/);
          const publicIdFromUrl = match?.[1]; // => "s6qunadqjbpmj6eeif2e"
          if (!publicIdFromUrl) continue;

          const result = await cloudinary.uploader.destroy(publicIdFromUrl, {
            invalidate: true,
          });
          console.log("Cloudinary destroy (fallback)", publicIdFromUrl, result);
        } catch (err) {
          console.error("Cloudinary destroy fallback error for", url, err);
        }
      }
    }

    // 3) Supprimer toutes les réservations liées à cette création
    await Reservation.deleteMany({ creationId: id });

    // 4) Enfin, supprimer la création de la base
    await Creation.findByIdAndDelete(id);

    // 🔄 Invalider le cache après suppression
    revalidatePath('/');
    revalidatePath('/api/creations');

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}