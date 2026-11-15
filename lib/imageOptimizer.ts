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
 * Découpe une URL Cloudinary en « …/upload » et chemin de la ressource (version, dossiers,
 * fichier), sans un éventuel bloc de transformations. null si l'URL n'a pas la forme
 * attendue (…/upload/…).
 */
function splitUploadUrl(url: string): { prefix: string; path: string[] } | null {
  const parts = url.split('/upload/');
  if (parts.length !== 2) return null;

  // Un segment de transformations est une liste de paires clé_valeur séparées par des virgules
  // (ex: "f_auto,q_75,w_600"), contrairement à une version ("v1712345") ou un dossier.
  const path = parts[1].split('/');
  if (path.length > 1 && /^[a-z]+_[^/]+(,[a-z]+_[^/]+)*$/.test(path[0])) {
    path.shift();
  }
  return { prefix: `${parts[0]}/upload`, path };
}

/** Remplace (ou ajoute) le bloc de transformations d'une URL Cloudinary. */
function withTransformations(url: string, transformations: string): string | null {
  const split = splitUploadUrl(url);
  return split && `${split.prefix}/${transformations}/${split.path.join('/')}`;
}

export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

/**
 * Image de partage (Open Graph) d'une fiche, au format 1200×630 attendu par Facebook,
 * LinkedIn, X… : la photo entière au centre (les bonnets sont photographiés en portrait, un
 * recadrage les coupait), sur un fond fait de la même photo agrandie, floutée et assombrie.
 * En JPEG : les robots des réseaux sociaux ne lisent pas tous l'AVIF/WebP.
 * null si l'image n'est pas sur Cloudinary (dimensions réelles inconnues).
 */
export function cloudinaryOgImageUrl(url: string): string | null {
  if (!url || !url.includes('cloudinary.com')) return null;
  const split = splitUploadUrl(url);
  if (!split) return null;

  // Identifiant de la photo pour la superposer à elle-même : sans version ni extension,
  // dossiers séparés par « : » (syntaxe des calques Cloudinary)
  const folders = split.path.filter((segment, i) => !(i === 0 && /^v\d+$/.test(segment)));
  const layerId = folders.join(':').replace(/\.[^.:]+$/, '');
  const size = `w_${OG_IMAGE_WIDTH},h_${OG_IMAGE_HEIGHT}`;

  return [
    split.prefix,
    `c_fill,g_auto,${size}`, // fond : la photo couvre tout le cadre…
    'e_blur:2000', // … floutée
    'e_brightness:-15', // … et un peu assombrie pour détacher l'article
    `l_${layerId}`, // la photo elle-même par-dessus…
    `c_fit,${size}`, // … entière, sans recadrage
    'fl_layer_apply,g_center',
    'f_jpg,q_80',
    ...split.path,
  ].join('/');
}
