import { MetadataRoute } from 'next';
import { connectToDatabase } from '@/lib/db';
import CreationModel from '@/models/Creation';
import { SITE_URL } from '@/lib/site';

// Régénéré toutes les heures (sinon figé au build : les nouvelles créations n'y figuraient pas)
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_URL;

  // Pages statiques
  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
  ];

  // Pages dynamiques des créations
  try {
    await connectToDatabase();
    const creations = await CreationModel.find({ hidden: { $ne: true } })
      .select('_id slug updatedAt')
      .lean();

    const creationPages = creations.map((creation: any) => ({
      url: `${baseUrl}/creations/${creation.slug || creation._id}`,
      lastModified: creation.updatedAt || new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }));

    return [...staticPages, ...creationPages];
  } catch (error) {
    console.error('Erreur lors de la génération du sitemap:', error);
    return staticPages;
  }
}
