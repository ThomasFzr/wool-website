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

  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Un segment de transformations est une liste de paires clé_valeur séparées par des virgules
  // (ex: "f_auto,q_75,w_600"), contrairement à une version ("v1712345") ou un dossier.
  const segments = parts[1].split('/');
  if (segments.length > 1 && /^[a-z]+_[^/]+(,[a-z]+_[^/]+)*$/.test(segments[0])) {
    segments.shift();
  }

  const transformations = [
    `f_${format}`,      // Format auto adapté au navigateur
    `q_${quality}`,     // Qualité optimisée
    `w_${width}`,       // Largeur maximale
    'c_limit',          // Ne pas agrandir, juste limiter
  ].join(',');

  return `${parts[0]}/upload/${transformations}/${segments.join('/')}`;
}
