import mongoose, { Schema } from "mongoose";

/**
 * Journal des suppressions d'images Cloudinary (ANO-2026-11-03) : chaque image candidate à la
 * suppression, son issue, le chemin qui l'a demandée, l'admin et son appareil. Sert à expliquer
 * une photo disparue, ce que les logs Vercel (1 h sur le plan Hobby) ne permettent pas.
 * Conservé un an (index TTL sur createdAt).
 */
export const IMAGE_DELETION_SOURCES = ["creation-delete", "creation-update", "form-cleanup"] as const;
export const IMAGE_DELETION_OUTCOMES = ["deleted", "not-found", "kept", "error"] as const;

export type ImageDeletionSource = (typeof IMAGE_DELETION_SOURCES)[number];
export type ImageDeletionOutcome = (typeof IMAGE_DELETION_OUTCOMES)[number];

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

const schema = new Schema(
  {
    publicId: { type: String, required: true, index: true },
    source: { type: String, enum: IMAGE_DELETION_SOURCES, required: true },
    outcome: { type: String, enum: IMAGE_DELETION_OUTCOMES, required: true },
    creationId: { type: Schema.Types.ObjectId, ref: "Creation", default: null },
    by: { type: String, default: null },
    userAgent: { type: String, default: null },
    error: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

schema.index({ createdAt: 1 }, { expireAfterSeconds: ONE_YEAR_SECONDS });

export default mongoose.models.ImageDeletion || mongoose.model("ImageDeletion", schema);
