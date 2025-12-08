/**
 * Optimise les URLs Cloudinary en ajoutant des transformations automatiques
 * Utilise directement les transformations Cloudinary pour éviter la double compression Next.js
 */
export function optimizeCloudinaryUrl(url: string, options: {
  width?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif';
} = {}): string {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const { width = 600, quality = 60, format = 'auto' } = options;

  // Extraire les parties de l'URL Cloudinary
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Construire les transformations optimales
  const transformations = [
    `f_${format}`,      // Format auto (WebP/AVIF selon navigateur)
    `q_${quality}`,     // Qualité compressée
    `w_${width}`,       // Largeur adaptée à l'affichage
    'c_fill',           // Remplir en recadrant si nécessaire
    'g_auto',           // Recadrage automatique intelligent
    'ar_4:3',           // Ratio 4:3 pour les cartes
  ].join(',');

  // Reconstruire l'URL avec les transformations
  return `${parts[0]}/upload/${transformations}/${parts[1]}`;
}
