/**
 * Optimise les URLs Cloudinary en ajoutant des transformations automatiques
 * Détecte si l'URL a déjà des transformations et les remplace intelligemment
 */
export function optimizeCloudinaryUrl(url: string, options: {
  width?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif';
} = {}): string {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const { width = 800, quality = 70, format = 'auto' } = options;

  // Extraire les parties de l'URL Cloudinary
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Si l'URL a déjà des transformations (depuis la DB), extraire juste le nom du fichier
  const afterUpload = parts[1];
  const pathParts = afterUpload.split('/');
  const fileName = pathParts[pathParts.length - 1];

  // Construire des transformations légères et efficaces
  const transformations = [
    `f_${format}`,      // Format auto adapté au navigateur
    `q_${quality}`,     // Qualité optimisée
    `w_${width}`,       // Largeur maximale
    'c_limit',          // Ne pas agrandir, juste limiter
  ].join(',');

  // Reconstruire l'URL avec les nouvelles transformations
  return `${parts[0]}/upload/${transformations}/${fileName}`;
}
