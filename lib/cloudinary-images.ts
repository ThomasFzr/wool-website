import mongoose from "mongoose";
import { cloudinary } from "@/lib/cloudinary";
import Creation from "@/models/Creation";
import ImageDeletion, { type ImageDeletionOutcome, type ImageDeletionSource } from "@/models/ImageDeletion";

/** Qui demande la suppression : enregistré dans le journal des suppressions (models/ImageDeletion). */
export interface ImageDeletionContext {
  source: ImageDeletionSource;
  creationId?: string | null;
  /** Email de l'admin connecté. */
  by?: string | null;
  userAgent?: string | null;
}

/** Contexte de journalisation tiré de la session admin et de la requête. */
export function deletionContext(
  source: ImageDeletionSource,
  session: { user?: { email?: string | null } } | null,
  req: Request,
  creationId?: string
): ImageDeletionContext {
  return {
    source,
    creationId: creationId ?? null,
    by: session?.user?.email ?? null,
    userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
  };
}

type Outcome = { publicId: string; outcome: ImageDeletionOutcome; error?: string };

/**
 * Supprime de Cloudinary les images qui ne servent plus : retirées d'une création, ou
 * envoyées depuis le formulaire admin puis abandonnées. Une image encore utilisée par une
 * création est gardée, quel que soit l'appelant. Les échecs sont journalisés sans bloquer.
 * Chaque image candidate est inscrite au journal des suppressions. Renvoie les public_id supprimés.
 */
export async function destroyUnusedImages(publicIds: unknown[], context: ImageDeletionContext): Promise<string[]> {
  const candidates = [...new Set(publicIds.filter((id): id is string => typeof id === "string" && id !== ""))];
  if (candidates.length === 0) return [];

  const used = await Creation.find({
    $or: [{ imagePublicIds: mongoose.trusted({ $in: candidates }) }, { imagePublicId: mongoose.trusted({ $in: candidates }) }],
  })
    .select("imagePublicIds imagePublicId")
    .lean<{ imagePublicIds?: string[]; imagePublicId?: string }[]>();
  const usedIds = new Set(used.flatMap((c) => [...(c.imagePublicIds ?? []), c.imagePublicId]));

  const outcomes = await destroyAll(candidates.filter((id) => !usedIds.has(id)));
  await record(
    [...candidates.filter((id) => usedIds.has(id)).map((publicId): Outcome => ({ publicId, outcome: "kept" })), ...outcomes],
    context
  );
  return outcomes.filter((o) => o.outcome !== "error").map((o) => o.publicId);
}

/** public_id Cloudinary déduit d'une URL d'image (…/upload/v123/dossier/nom.jpg → dossier/nom). */
function publicIdFromUrl(url: string): string | undefined {
  return url.match(/upload\/(?:v\d+\/)?([^.]+)/)?.[1];
}

/**
 * Supprime les images d'une ancienne création sans imagePublicIds (public_id déduit de l'URL),
 * en gardant celles dont l'URL est encore affichée par une autre création.
 */
export async function destroyUnusedLegacyImages(
  urls: (string | undefined | null)[],
  context: ImageDeletionContext
): Promise<void> {
  const candidates = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  if (candidates.length === 0) return;

  const used = await Creation.find({
    $or: [{ imageUrl: mongoose.trusted({ $in: candidates }) }, { images: mongoose.trusted({ $in: candidates }) }],
  })
    .select("imageUrl images")
    .lean<{ imageUrl?: string; images?: string[] }[]>();
  const usedUrls = new Set(used.flatMap((c) => [c.imageUrl, ...(c.images ?? [])]));

  const kept: Outcome[] = [];
  const toDestroy: string[] = [];
  for (const url of candidates) {
    const publicId = publicIdFromUrl(url);
    if (!publicId) continue;
    if (usedUrls.has(url)) kept.push({ publicId, outcome: "kept" });
    else toDestroy.push(publicId);
  }
  await record([...kept, ...(await destroyAll(toDestroy))], context);
}

/** Supprime chaque image de Cloudinary (en parallèle) et rend l'issue de chacune. */
async function destroyAll(publicIds: string[]): Promise<Outcome[]> {
  const results = await Promise.allSettled(
    publicIds.map((publicId) => cloudinary.uploader.destroy(publicId, { invalidate: true }))
  );
  return publicIds.map((publicId, i): Outcome => {
    const result = results[i];
    if (result.status === "rejected") {
      console.error("Cloudinary destroy error for", publicId, result.reason);
      return { publicId, outcome: "error", error: String(result.reason).slice(0, 500) };
    }
    return { publicId, outcome: result.value?.result === "not found" ? "not-found" : "deleted" };
  });
}

/** Inscrit les issues au journal ; un échec d'écriture ne bloque pas la suppression. */
async function record(outcomes: Outcome[], context: ImageDeletionContext): Promise<void> {
  if (outcomes.length === 0) return;
  try {
    await ImageDeletion.insertMany(outcomes.map((o) => ({ ...context, ...o })));
  } catch (err) {
    console.error("Journal des suppressions d'images indisponible:", err);
  }
}
