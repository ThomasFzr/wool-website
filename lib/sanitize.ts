import sanitizeHtml from "sanitize-html";

/**
 * Nettoie le HTML d'une description (rendu tel quel sur la fiche produit) avec une liste
 * blanche : mise en forme de texte et liens http(s)/mailto uniquement. Tout le reste
 * (scripts, styles, attributs on*, iframes, javascript:…) est retiré.
 * Appliqué à l'enregistrement ET à l'affichage (descriptions déjà en base).
 */
export function sanitizeDescriptionHtml(html: unknown): string {
  if (typeof html !== "string") return "";
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "a"],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
    },
  });
}
