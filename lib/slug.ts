import Creation from "@/models/Creation";

/**
 * Génère un slug à partir d'un titre (minuscules, sans accents, tirets).
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Génère un slug unique en une seule requête : récupère tous les slugs
 * du même préfixe puis calcule le premier suffixe libre.
 * Les anciens slugs des autres créations sont aussi réservés (leurs anciens liens
 * redirigent vers elles). `excludeId` permet d'ignorer la création en cours de modification.
 */
export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const baseSlug = generateSlug(title) || "creation";

  // baseSlug ne contient que [a-z0-9-] : aucun métacaractère regex à échapper
  const pattern = new RegExp(`^${baseSlug}(-\\d+)?$`);
  const query: Record<string, unknown> = {
    $or: [{ slug: pattern }, { previousSlugs: pattern }],
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Creation.find(query).select("slug previousSlugs").lean();
  const taken = new Set(
    existing.flatMap((c: any) => [c.slug, ...(c.previousSlugs ?? [])])
  );

  if (!taken.has(baseSlug)) return baseSlug;

  let counter = 1;
  while (taken.has(`${baseSlug}-${counter}`)) counter++;
  return `${baseSlug}-${counter}`;
}

/**
 * Slug actuel d'une création renommée dont `oldSlug` était l'adresse, ou null.
 * Les créations cachées ne sont pas exposées.
 */
export async function findRenamedSlug(oldSlug: string): Promise<string | null> {
  const creation = await Creation.findOne({ previousSlugs: oldSlug, hidden: { $ne: true } })
    .select("slug")
    .lean<{ slug?: string } | null>();
  return creation?.slug || null;
}
