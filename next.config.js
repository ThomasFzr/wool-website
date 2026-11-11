const isDev = process.env.NODE_ENV !== 'production';
// Barre d'outils Vercel (commentaires) injectée sur les previews uniquement
const isPreview = process.env.VERCEL_ENV === 'preview';

/**
 * Content-Security-Policy. Les scripts inline restent permis : Next.js en injecte pour
 * l'hydratation, et des nonces imposeraient un rendu dynamique de toutes les pages (fin
 * du cache ISR). La politique limite tout de même les origines (scripts, images,
 * requêtes, cadres), interdit plugins, <base> et l'intégration du site dans un cadre.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}${isPreview ? ' https://vercel.live' : ''}`,
  "style-src 'self' 'unsafe-inline'",
  // Cloudinary (photos), avatars Google, aperçus d'images avant envoi
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.googleusercontent.com",
  "font-src 'self' data:",
  // Envoi des photos depuis l'admin directement vers Cloudinary
  `connect-src 'self' https://api.cloudinary.com${isPreview ? ' https://vercel.live wss://ws-us3.pusher.com' : ''}`,
  `frame-src ${isPreview ? 'https://vercel.live' : "'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com https://checkout.stripe.com",
  "frame-ancestors 'self'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 3600,
    unoptimized: false,
    qualities: [75, 90],
  },
  compress: true,
  poweredByHeader: false,
  reactStrictMode: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },
  experimental: {
    optimizePackageImports: ['@vercel/analytics', 'recharts'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
