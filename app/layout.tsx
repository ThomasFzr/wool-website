import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { CartProvider } from "@/contexts/CartContext";
import { CartModal } from "@/components/CartModal";
import { EnvironmentBanner } from "@/components/EnvironmentBanner";
import { Analytics } from "@vercel/analytics/react";
import { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://maille-mum.fr'),
  title: {
    default: "MailleMum - Créations tricotées à la main",
    template: "%s | MailleMum",
  },
  description: "Découvrez nos créations tricotées à la main : tours de cou, bandeaux et bonnets faits main avec passion.",
  verification: {
    google: 'c7a33ae43fd6971e',
  },
  openGraph: {
    title: "MailleMum - Créations tricotées à la main",
    description: "Découvrez nos créations tricotées à la main : tours de cou, bandeaux et bonnets faits main avec passion.",
    url: 'https://www.maillemum.fr',
    siteName: 'MailleMum',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'MailleMum - Créations tricotées à la main',
      },
    ],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MailleMum - Créations tricotées à la main',
    description: 'Découvrez nos créations tricotées à la main : tours de cou, bandeaux et bonnets faits main avec passion.',
    images: ['/images/og-image.jpg'],
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link rel="preload" href="/fonts/ClashDisplay-Variable.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </head>
      <body className="font-sans bg-slate-50 text-slate-900">
        <EnvironmentBanner />
        <AuthSessionProvider>
          <CartProvider>
            {children}
            <CartModal />
          </CartProvider>
        </AuthSessionProvider>
        <Analytics />
      </body>
    </html>
  );
}