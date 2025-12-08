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

  // Si l'URL a déjà des transformations (depuis la DB), les remplacer
  const afterUpload = parts[1];
  const hasTransformations = afterUpload.includes('/');
  const imagePath = hasTransformations ? afterUpload.split('/').slice(1).join('/') : afterUpload;

  // Construire les transformations optimales pour l'affichage
  const transformations = [
    `f_${format}`,      // Format auto (WebP/AVIF selon navigateur)
    `q_${quality}`,     // Qualité adaptée à l'usage
    `w_${width}`,       // Largeur adaptée à l'affichage
    'c_limit',          // Limiter sans déformer
  ].join(',');

  // Reconstruire l'URL avec les nouvelles transformations
  return `${parts[0]}/upload/${transformations}/${imagePath}`;
}
