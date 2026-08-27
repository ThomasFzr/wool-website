import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://maillemum.fr';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/admin/',
          '/account/',
          '/login',
          '/forgot-password',
          '/reset-password',
          '/version',
          '/dev/',
          '/fonts/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
