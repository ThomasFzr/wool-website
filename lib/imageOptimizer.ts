/**
 * Optimise les URLs Cloudinary en ajoutant des transformations automatiques.
 * Préserve le chemin complet du public_id (version + dossiers éventuels) ;
 * seul un bloc de transformations déjà présent est remplacé.
 */
export function optimizeCloudinaryUrl(url: string, options: {
  width?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif';
} = {}): string {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const { width = 600, quality = 75, format = 'auto' } = options;

  const transformations = [
    `f_${format}`,      // Format auto adapté au navigateur
    `q_${quality}`,     // Qualité optimisée
    `w_${width}`,       // Largeur maximale
    'c_limit',          // Ne pas agrandir, juste limiter
  ].join(',');

  return withTransformations(url, transformations) ?? url;
}

/**
 * Remplace (ou ajoute) le bloc de transformations d'une URL Cloudinary.
 * null si l'URL n'a pas la forme attendue (…/upload/…).
 */
function withTransformations(url: string, transformations: string): string | null {
  const parts = url.split('/upload/');
  if (parts.length !== 2) return null;

  // Un segment de transformations est une liste de paires clé_valeur séparées par des virgules
  // (ex: "f_auto,q_75,w_600"), contrairement à une version ("v1712345") ou un dossier.
  const segments = parts[1].split('/');
  if (segments.length > 1 && /^[a-z]+_[^/]+(,[a-z]+_[^/]+)*$/.test(segments[0])) {
    segments.shift();
  }

  return `${parts[0]}/upload/${transformations}/${segments.join('/')}`;
}

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Image de partage (Open Graph) recadrée par Cloudinary au format 1200×630 annoncé, en JPEG
 * (les robots des réseaux sociaux ne lisent pas tous l'AVIF/WebP). null si l'image n'est
 * pas sur Cloudinary : ses dimensions réelles sont alors inconnues.
 */
export function cloudinaryOgImageUrl(url: string): string | null {
  if (!url || !url.includes('cloudinary.com')) return null;
  return withTransformations(
    url,
    `c_fill,g_auto,w_${OG_IMAGE_WIDTH},h_${OG_IMAGE_HEIGHT},f_jpg,q_80`
  );
}
