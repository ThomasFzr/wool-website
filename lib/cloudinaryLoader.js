export default function cloudinaryLoader({ src, width, quality }) {
  // Si ce n'est pas une URL Cloudinary, retourner l'URL telle quelle
  if (!src.includes('cloudinary.com')) {
    return src;
  }

  const params = [
    `w_${width}`,
    `q_${quality || 75}`,
    'f_auto', // Format automatique (WebP/AVIF selon le navigateur)
    'c_limit'
  ];

  const paramsString = params.join(',');
  
  // Injecter les transformations dans l'URL Cloudinary
  return src.replace('/upload/', `/upload/${paramsString}/`);
}
