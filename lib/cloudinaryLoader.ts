export default function cloudinaryLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  // Si ce n'est pas une URL Cloudinary, retourner l'URL d'origine
  if (!src.includes('res.cloudinary.com')) {
    return src;
  }

  // Extraire le cloud name et le chemin de l'image
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || 'your-cloud-name';
  
  // Si l'URL contient déjà des transformations, les remplacer
  const parts = src.split('/upload/');
  if (parts.length !== 2) return src;

  const [baseUrl, imagePath] = parts;
  
  // Paramètres d'optimisation Cloudinary
  const params = [
    'f_auto', // Format automatique (WebP/AVIF)
    'q_auto:good', // Qualité automatique optimisée
    `w_${width}`, // Largeur responsive
    'c_limit', // Limiter les dimensions
    'dpr_auto', // DPR automatique pour Retina
  ];

  return `${baseUrl}/upload/${params.join(',')}/${imagePath}`;
}
