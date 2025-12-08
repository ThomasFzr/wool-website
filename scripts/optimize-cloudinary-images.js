// Script pour optimiser toutes les images Cloudinary existantes
require("dotenv").config({ path: ".env" });
const { MongoClient } = require('mongodb');

async function optimizeCloudinaryImages() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB\n');
    
    const db = client.db();
    const creations = db.collection('creations');
    
    // Récupérer toutes les créations avec des images
    const allCreations = await creations.find({
      $or: [
        { images: { $exists: true, $ne: [] } },
        { imageUrl: { $exists: true, $ne: null } }
      ]
    }).toArray();
    
    console.log(`📊 ${allCreations.length} créations trouvées avec des images\n`);
    
    let totalImagesAnalyzed = 0;
    let totalImagesOptimized = 0;
    
    for (const creation of allCreations) {
      const imagesToOptimize = [];
      
      // Analyser imageUrl
      if (creation.imageUrl && creation.imageUrl.includes('cloudinary.com')) {
        imagesToOptimize.push({ field: 'imageUrl', url: creation.imageUrl });
      }
      
      // Analyser images[]
      if (creation.images && Array.isArray(creation.images)) {
        creation.images.forEach((img, index) => {
          if (img && img.includes('cloudinary.com')) {
            imagesToOptimize.push({ field: 'images', index, url: img });
          }
        });
      }
      
      if (imagesToOptimize.length === 0) continue;
      
      console.log(`\n📦 ${creation.title}`);
      console.log(`   ${imagesToOptimize.length} image(s) à analyser`);
      
      for (const img of imagesToOptimize) {
        totalImagesAnalyzed++;
        
        // Vérifier si l'URL contient déjà des transformations optimales
        const hasOptimalTransforms = 
          img.url.includes('f_auto') && 
          img.url.includes('q_auto') &&
          img.url.includes('c_fill');
        
        if (hasOptimalTransforms) {
          console.log(`   ✓ Déjà optimisée: ${img.url.substring(0, 80)}...`);
          continue;
        }
        
        // Créer l'URL optimisée
        const optimizedUrl = optimizeUrl(img.url);
        
        if (optimizedUrl === img.url) {
          console.log(`   ⚠ Impossible d'optimiser: ${img.url.substring(0, 80)}...`);
          continue;
        }
        
        console.log(`   🔧 Optimisation: ${optimizedUrl.substring(0, 80)}...`);
        
        // Mettre à jour dans la DB
        if (img.field === 'imageUrl') {
          await creations.updateOne(
            { _id: creation._id },
            { $set: { imageUrl: optimizedUrl } }
          );
        } else if (img.field === 'images') {
          const newImages = [...creation.images];
          newImages[img.index] = optimizedUrl;
          await creations.updateOne(
            { _id: creation._id },
            { $set: { images: newImages } }
          );
        }
        
        totalImagesOptimized++;
      }
    }
    
    console.log('\n\n' + '='.repeat(60));
    console.log('📈 RÉSUMÉ');
    console.log('='.repeat(60));
    console.log(`✅ Créations analysées: ${allCreations.length}`);
    console.log(`📸 Images analysées: ${totalImagesAnalyzed}`);
    console.log(`🔧 Images optimisées: ${totalImagesOptimized}`);
    console.log(`⏭️  Déjà optimisées: ${totalImagesAnalyzed - totalImagesOptimized}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Erreur:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

function optimizeUrl(url) {
  if (!url || !url.includes('cloudinary.com')) {
    return url;
  }
  
  // Si l'URL contient déjà /upload/, on insère nos transformations
  const parts = url.split('/upload/');
  if (parts.length !== 2) return url;
  
  // Transformations optimales pour toutes les images
  const transforms = [
    'f_auto',           // Format auto (WebP/AVIF)
    'q_auto:good',      // Qualité automatique optimisée
    'w_1200',           // Largeur max (pour desktop)
    'c_limit',          // Ne jamais agrandir
    'dpr_auto',         // Support Retina
  ].join(',');
  
  return `${parts[0]}/upload/${transforms}/${parts[1]}`;
}

optimizeCloudinaryImages();
