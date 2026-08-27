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
 * `excludeId` permet d'ignorer la création en cours de modification.
 */
export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  const baseSlug = generateSlug(title) || "creation";

  // baseSlug ne contient que [a-z0-9-] : aucun métacaractère regex à échapper
  const query: Record<string, unknown> = {
    slug: new RegExp(`^${baseSlug}(-\\d+)?$`),
  };
  if (excludeId) query._id = { $ne: excludeId };

  const existing = await Creation.find(query).select("slug").lean();
  const taken = new Set(existing.map((c: any) => c.slug));

  if (!taken.has(baseSlug)) return baseSlug;

  let counter = 1;
  while (taken.has(`${baseSlug}-${counter}`)) counter++;
  return `${baseSlug}-${counter}`;
}
