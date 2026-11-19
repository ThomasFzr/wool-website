import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";
import { checkAdminAuth } from "@/lib/auth";
import { cloudinary } from "@/lib/cloudinary";
import { destroyUnusedImages } from "@/lib/cloudinary-images";
import { revalidateCatalog } from "@/lib/revalidate";
import { generateUniqueSlug } from "@/lib/slug";
import { sanitizeDescriptionHtml } from "@/lib/sanitize";
import { isInvalidInput } from "@/lib/validation-error";
import { idParams, parseBody, parseInput, parseParams } from "@/lib/validation";
import { creationRefParams, requiredCreationFields, updateCreationSchema } from "@/lib/schemas/creation";

async function checkAuth(req: NextRequest) {
  const session = await checkAdminAuth();
  return session !== null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Identifiant MongoDB ou slug : un autre format ne peut correspondre à aucune création
    const parsedParams = await parseParams(params, creationRefParams);
    if (!parsedParams.ok) return new NextResponse("Not found", { status: 404 });
    const { id } = parsedParams.data;
    await connectToDatabase();
    
    // Vérifier si l'utilisateur est admin pour voir les créations cachées
    const session = await checkAdminAuth();
    const isAdmin = session !== null;
    
    // Construire la requête avec ou sans filtre hidden selon le rôle
    const baseQuery = isAdmin ? {} : { hidden: mongoose.trusted({ $ne: true }) };
    
    // Récupérer la création par ID ou slug avec les articles liés
    // (un id non-ObjectId ferait lever un CastError sur _id, d'où le test explicite)
    const lookup = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
    const creation = await Creation.findOne({ ...lookup, ...baseQuery })
      .populate('relatedCreations', 'title imageUrl images price color type slug sold hidden')
      .lean();
    
    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }
    
    // Convertir en format JSON
    const creationData: any = creation;
    
    // Filtrer les relatedCreations cachées pour les utilisateurs publics
    let relatedCreations = creationData.relatedCreations || [];
    if (!isAdmin && Array.isArray(relatedCreations)) {
      relatedCreations = relatedCreations.filter((related: any) => !related.hidden);
    }
    
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
      relatedCreations,
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

    const parsedParams = await parseParams(params, idParams);
    if (!parsedParams.ok) return parsedParams.response;
    const { id } = parsedParams.data;

    // Un champ obligatoire (titre, type, prix, couleur) envoyé vide est refusé par le schéma ;
    // absent, il garde sa valeur actuelle. Les clés inconnues du body sont ignorées.
    const parsed = await parseBody(req, updateCreationSchema);
    if (!parsed.ok) return parsed.response;
    const body = parsed.data;

    await connectToDatabase();

    const existingCreation = await Creation.findById(id);
    if (!existingCreation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Valeurs finales des champs obligatoires : une ancienne création incomplète en base
    // doit être corrigée avant toute autre modification
    const required = parseInput(requiredCreationFields, {
      title: body.title ?? existingCreation.title,
      type: body.type ?? existingCreation.type,
      price: body.price ?? existingCreation.price,
      color: body.color ?? existingCreation.color,
    });
    if (!required.ok) return required.response;

    // Construire l'objet de mise à jour avec les opérateurs MongoDB
    const setData: any = {};
    const unsetData: any = {};

    if (body.title !== undefined) {
      setData.title = body.title;
      // Régénérer le slug si le titre change ; l'ancien reste une adresse valide
      // (redirection 301 depuis la fiche) pour ne pas casser les liens partagés.
      const slug = await generateUniqueSlug(body.title, id);
      if (slug !== existingCreation.slug) {
        setData.slug = slug;
        const previous: string[] = existingCreation.previousSlugs ?? [];
        setData.previousSlugs = [
          ...previous.filter((s) => s !== slug && s !== existingCreation.slug),
          ...(existingCreation.slug ? [existingCreation.slug] : []),
        ];
      }
    }
    if (body.description !== undefined) setData.description = body.description;
    // Rendue en HTML sur la fiche produit : nettoyée à l'enregistrement (XSS)
    if (body.seoDescription !== undefined) setData.seoDescription = sanitizeDescriptionHtml(body.seoDescription);
    if (body.imageUrl !== undefined) setData.imageUrl = body.imageUrl;
    if (body.images !== undefined) {
      setData.images = body.images;
      // Quand on supprime toutes les images, vider aussi imageUrl pour éviter une miniature "fantôme"
      if (body.images.length === 0) {
        setData.imageUrl = "";
      }
    }
    if (body.imagePublicIds !== undefined) {
      setData.imagePublicIds = body.imagePublicIds;
    }
    if (body.price !== undefined) setData.price = body.price;
    if (body.color !== undefined) setData.color = body.color;
    if (body.yarnBrand !== undefined) setData.yarnBrand = body.yarnBrand;
    if (body.weight !== undefined) setData.weight = body.weight;
    if (body.yarnPrice !== undefined) setData.yarnPrice = body.yarnPrice;
    if (body.type !== undefined) {
      // Le type est maintenant obligatoire, on ne peut plus le supprimer
      setData.type = body.type;
    }

    if (body.reserved !== undefined) setData.reserved = body.reserved;
    // Verrou levé à la main : il n'appartient plus à aucune réservation
    if (body.reserved === false) unsetData.reservedByReservationId = "";
    if (body.reservedName !== undefined) setData.reservedName = body.reservedName;
    if (body.reservedContact !== undefined) setData.reservedContact = body.reservedContact;
    if (body.reservedMessage !== undefined) setData.reservedMessage = body.reservedMessage;
    if (body.reservedAt !== undefined) setData.reservedAt = body.reservedAt;
    
    // Gérer le changement de statut "vendu"
    if (body.sold !== undefined) {
      setData.sold = body.sold;
      // salesCount n'est pas touché : une vente est comptée par une commande (paiement Stripe
      // ou commande saisie par l'admin). Compter ici gonflait le total à chaque bascule
      // vendu → disponible → vendu.

      // Si on remet disponible (sold: false), nettoyer aussi les champs reserved
      if (body.sold === false) {
        setData.reserved = false;
        unsetData.reservedName = "";
        unsetData.reservedContact = "";
        unsetData.reservedMessage = "";
        unsetData.reservedAt = "";
        unsetData.reservedByReservationId = "";
      }
    }
    
    if (body.showAsNew !== undefined) setData.showAsNew = body.showAsNew;
    if (body.resetNewTimer === true) {
      setData.visibleAt = new Date();
      setData.showAsNew = true;
    }
    if (body.hidden !== undefined) {
      setData.hidden = body.hidden;
      // Quand on dé-cache l'article, enregistrer la date pour que le décompte "nouveau" (7 jours) démarre
      if (body.hidden === false && existingCreation.hidden === true) {
        setData.visibleAt = new Date();
      }
    }
    if (body.displayOrder !== undefined) setData.displayOrder = body.displayOrder;
    if (body.relatedCreations !== undefined) setData.relatedCreations = body.relatedCreations;

    // Construire l'objet update final avec seulement les opérateurs nécessaires
    const update: any = {};
    if (Object.keys(setData).length > 0) {
      update.$set = setData;
    }
    if (Object.keys(unsetData).length > 0) {
      update.$unset = unsetData;
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
      // Validateurs du schéma actifs (prix, poids, prix du fil ≥ 0…)
      { runValidators: true }
    );

    if (updateResult.matchedCount === 0) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Relire le document mis à jour
    const creation = await Creation.findById(id);
    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Images retirées de la création : supprimées de Cloudinary (sinon elles s'accumulent)
    if (Array.isArray(body.imagePublicIds)) {
      const kept = new Set(body.imagePublicIds);
      // Tableau toujours présent sur un document Mongoose (vide par défaut)
      const removed = existingCreation.imagePublicIds.filter((pid: string) => !kept.has(pid));
      await destroyUnusedImages(removed);
    }

    // 🔄 Invalider le cache après modification
    revalidateCatalog();

    return NextResponse.json(creation);
  } catch (err) {
    if (isInvalidInput(err)) {
      return NextResponse.json({ error: "Données invalides" }, { status: 400 });
    }
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

    const parsedParams = await parseParams(params, idParams);
    if (!parsedParams.ok) return parsedParams.response;
    const { id } = parsedParams.data;
    await connectToDatabase();

    const creation = await Creation.findById(id);

    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }

    // Une pièce vendue garde ses commandes (historique client, comptabilité) : on la cache
    // au lieu de la supprimer. Idem pendant un paiement en cours sur la pièce.
    const hasPaidOrders = await Reservation.exists({ creationId: id, paymentStatus: "paid" });
    if (hasPaidOrders || creation.reserved) {
      return NextResponse.json(
        {
          error: hasPaidOrders
            ? "Cette création a des commandes payées : masquez-la plutôt que de la supprimer."
            : "Un paiement est en cours sur cette création : réessayez plus tard ou masquez-la.",
        },
        { status: 409 }
      );
    }

    // 🔥 1) Supprimer les images Cloudinary par leurs public_id stockés (en parallèle)
    if (Array.isArray(creation.imagePublicIds)) {
      await Promise.allSettled(
        creation.imagePublicIds
          .filter(Boolean)
          .map((publicId: string) =>
            cloudinary.uploader
              .destroy(publicId, { invalidate: true })
              .catch((err: unknown) =>
                console.error("Cloudinary destroy error for", publicId, err)
              )
          )
      );
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

      await Promise.allSettled(
        urls.map((url) => {
          const match = url.match(/upload\/(?:v\d+\/)?([^\.]+)/);
          const publicIdFromUrl = match?.[1]; // => "s6qunadqjbpmj6eeif2e"
          if (!publicIdFromUrl) return Promise.resolve();

          return cloudinary.uploader
            .destroy(publicIdFromUrl, { invalidate: true })
            .catch((err: unknown) =>
              console.error("Cloudinary destroy fallback error for", url, err)
            );
        })
      );
    }

    // 3) Supprimer les réservations liées (aucune n'est payée, cf. plus haut)
    await Reservation.deleteMany({ creationId: id });

    // 4) Enfin, supprimer la création de la base
    await Creation.findByIdAndDelete(id);

    // 🔄 Invalider le cache après suppression
    revalidateCatalog();

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}