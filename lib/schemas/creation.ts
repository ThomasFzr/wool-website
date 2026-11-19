import { z } from "zod";
import { objectId, requiredText, text } from "@/lib/validation";

/**
 * Champs d'une création envoyés par le formulaire admin (POST /api/creations et
 * PATCH /api/creations/[id]). Les messages sont ceux affichés dans le formulaire.
 */
const PRICE_MESSAGE = "Le prix est obligatoire et doit être supérieur à 0.";

const creationFields = {
  title: requiredText(200, "Le titre est obligatoire."),
  type: requiredText(100, "Le type d'article est obligatoire."),
  color: requiredText(100, "La couleur est obligatoire."),
  price: z.number(PRICE_MESSAGE).positive(PRICE_MESSAGE).max(100_000, "Prix trop élevé."),
  description: z.string().max(10_000, "Description trop longue.").nullish(),
  // HTML filtré par sanitize-html à l'enregistrement (lib/sanitize)
  seoDescription: z.string().max(50_000, "Description trop longue.").nullish(),
  imageUrl: z.string().max(1000).optional(),
  images: z.array(z.string().max(1000)).max(30, "Trop d'images.").optional(),
  imagePublicIds: z.array(z.string().max(300)).max(30, "Trop d'images.").optional(),
  showAsNew: z.boolean().optional(),
  hidden: z.boolean().optional(),
  // Champs admin (fil, poids) : vides acceptés
  yarnBrand: text(100).nullish(),
  weight: z.number().min(0).max(100_000).nullish(),
  yarnPrice: z.number().min(0).max(100_000).nullish(),
  relatedCreations: z.array(objectId).max(50, "Trop d'articles liés.").optional(),
};

/** POST : titre, type, couleur et prix obligatoires. */
export const createCreationSchema = z.object(creationFields);

/** Champs obligatoires d'une création, vérifiés sur les valeurs finales d'un PATCH. */
export const requiredCreationFields = createCreationSchema.pick({ title: true, type: true, color: true, price: true });

/** PATCH : chaque champ est facultatif, mais un champ obligatoire envoyé ne peut pas être vide. */
export const updateCreationSchema = z.object(creationFields).partial().extend({
  sold: z.boolean().optional(),
  reserved: z.boolean().optional(),
  reservedName: text(200).nullish(),
  reservedContact: text(200).nullish(),
  reservedMessage: text(2000).nullish(),
  reservedAt: z.coerce.date().nullish(),
  resetNewTimer: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});

/** GET /api/creations/[id] : identifiant MongoDB ou slug. */
export const creationRefParams = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,200}$/i, "Création introuvable."),
});
