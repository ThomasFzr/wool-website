import mongoose from "mongoose";
import { cloudinary } from "@/lib/cloudinary";
import Creation from "@/models/Creation";

/**
 * Supprime de Cloudinary les images qui ne servent plus : retirées d'une création, ou
 * envoyées depuis le formulaire admin puis abandonnées. Une image encore utilisée par une
 * création est gardée, quel que soit l'appelant. Les échecs sont journalisés sans bloquer.
 * Renvoie les public_id supprimés.
 */
export async function destroyUnusedImages(publicIds: unknown[]): Promise<string[]> {
  const candidates = [...new Set(publicIds.filter((id): id is string => typeof id === "string" && id !== ""))];
  if (candidates.length === 0) return [];

  const used = await Creation.find({
    $or: [{ imagePublicIds: mongoose.trusted({ $in: candidates }) }, { imagePublicId: mongoose.trusted({ $in: candidates }) }],
  })
    .select("imagePublicIds imagePublicId")
    .lean<{ imagePublicIds?: string[]; imagePublicId?: string }[]>();
  const usedIds = new Set(used.flatMap((c) => [...(c.imagePublicIds ?? []), c.imagePublicId]));
  const unused = candidates.filter((id) => !usedIds.has(id));

  const results = await Promise.allSettled(
    unused.map((publicId) => cloudinary.uploader.destroy(publicId, { invalidate: true }))
  );
  return unused.filter((publicId, i) => {
    const result = results[i];
    if (result.status === "rejected") {
      console.error("Cloudinary destroy error for", publicId, result.reason);
      return false;
    }
    return true;
  });
}
