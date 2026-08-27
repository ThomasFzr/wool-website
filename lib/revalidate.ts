import { revalidatePath } from "next/cache";

/**
 * Invalide toutes les vues publiques du catalogue : la vitrine, l'API des
 * créations et TOUTES les fiches produit (le second argument "page" invalide
 * l'ensemble des pages du segment dynamique /creations/[id]).
 *
 * Tolérant aux erreurs : une revalidation impossible (appel hors contexte de
 * requête — script, cron) ne doit jamais faire échouer l'opération métier
 * qui vient d'aboutir en base.
 */
export function revalidateCatalog(): void {
  try {
    revalidatePath("/");
    revalidatePath("/api/creations");
    revalidatePath("/creations/[id]", "page");
  } catch (err) {
    console.error("[revalidate] Invalidation du catalogue impossible:", err);
  }
}

/** Invalide la liste des commandes du compte client. */
export function revalidateOrders(): void {
  try {
    revalidatePath("/account/orders");
  } catch (err) {
    console.error("[revalidate] Invalidation des commandes impossible:", err);
  }
}
