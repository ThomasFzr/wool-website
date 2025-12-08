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

  const { width = 800, quality = 70, format = 'auto' } = options;

  // Extraire les parties de l'URL Cloudinary
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Construire les transformations optimales
  const transformations = [
    `f_${format}`,      // Format auto (WebP/AVIF selon navigateur)
    `q_${quality}`,     // Qualité
    `w_${width}`,       // Largeur max
    'c_limit',          // Ne jamais agrandir
    'dpr_auto',         // Retina automatique
  ].join(',');

  // Reconstruire l'URL avec les transformations
  return `${parts[0]}/upload/${transformations}/${parts[1]}`;
}
