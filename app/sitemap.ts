import { MetadataRoute } from 'next';
import { connectToDatabase } from '@/lib/db';
import CreationModel from '@/models/Creation';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://maille-mum.fr';

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
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.5,
    },
  ];

  // Pages dynamiques des créations
  try {
    await connectToDatabase();
    const creations = await CreationModel.find()
      .select('_id updatedAt')
      .lean();

    const creationPages = creations.map((creation: any) => ({
      url: `${baseUrl}/?creation=${creation._id}`,
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
