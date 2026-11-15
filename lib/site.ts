/**
 * Adresse publique canonique du site (avec www) : métadonnées, Open Graph, robots.txt,
 * sitemap. Fixe plutôt que tirée de NEXT_PUBLIC_APP_URL : une preview ou un poste local
 * ne doit pas annoncer sa propre adresse comme canonique.
 */
export const SITE_URL = "https://www.maillemum.fr";

export const SITE_NAME = "MailleMum";

/** Métadonnées des pages privées (compte, panier, paiement) : jamais indexées. */
export const NOINDEX = { index: false, follow: false } as const;
