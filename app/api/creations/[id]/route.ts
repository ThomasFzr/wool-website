import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { checkAdminAuth } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";
import { revalidatePath } from "next/cache";

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

    const update: any = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl;
    if (body.images !== undefined) update.images = body.images;
    if (body.imagePublicIds !== undefined) {
      update.imagePublicIds = body.imagePublicIds;
    }
    if (body.price !== undefined) update.price = body.price;
    if (body.color !== undefined) update.color = body.color;
    if (body.type !== undefined) {
      // Si type est vide, on le supprime du document, sinon on le met à jour
      if (body.type === "" || body.type === null) {
        update.$unset = { type: "" };
      } else {
        update.type = body.type;
      }
    }

    if (body.reserved !== undefined) update.reserved = body.reserved;
    if (body.reservedName !== undefined) update.reservedName = body.reservedName;
    if (body.reservedContact !== undefined)
      update.reservedContact = body.reservedContact;
    if (body.reservedMessage !== undefined)
      update.reservedMessage = body.reservedMessage;
    if (body.reservedAt !== undefined) update.reservedAt = body.reservedAt;
    
    // Gérer le changement de statut "vendu"
    if (body.sold !== undefined) {
      const currentCreation = await Creation.findById(id);
      update.sold = body.sold;
      
      // Si on marque comme vendu et que ce n'était pas déjà vendu, incrémenter salesCount
      if (body.sold === true && currentCreation && !currentCreation.sold) {
        update.$inc = { salesCount: 1 };
      }
    }
    
    if (body.showAsNew !== undefined) update.showAsNew = body.showAsNew;
    if (body.displayOrder !== undefined) update.displayOrder = body.displayOrder;

    const creation = await Creation.findByIdAndUpdate(id, update, {
      new: true,
    });

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