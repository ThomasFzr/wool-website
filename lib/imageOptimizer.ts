/**
 * Optimise les URLs Cloudinary en ajoutant des transformations automatiques
 */
export function optimizeCloudinaryUrl(url: string, options: {
  width?: number;
  quality?: number;
  format?: 'auto' | 'webp' | 'avif';
} = {}): string {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }

  const { width = 800, quality = 75, format = 'auto' } = options;

  // Extraire les parties de l'URL Cloudinary
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;

  // Construire les transformations
  const transformations = [
    `w_${width}`,
    `q_${quality}`,
    `f_${format}`,
    'c_limit', // Ne jamais agrandir l'image
  ].join(',');

  // Reconstruire l'URL avec les transformations
  return `${parts[0]}/upload/${transformations}/${parts[1]}`;
}
