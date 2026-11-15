import { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          // Sans slash final : bloque aussi /admin, /account… eux-mêmes
          '/admin',
          '/account',
          '/cart',
          '/checkout',
          '/login',
          '/forgot-password',
          '/reset-password',
          '/version',
          '/dev/',
          '/fonts/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
