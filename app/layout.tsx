import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import { Analytics } from "@vercel/analytics/react";
import { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://maille-mum.fr'),
  title: {
    default: "MailleMum - Créations artisanales en laine",
    template: "%s | MailleMum",
  },
  description: "Découvrez nos créations artisanales uniques en laine : peluches, décorations et accessoires faits main avec passion.",
  verification: {
    google: 'c7a33ae43fd6971e',
  },
  openGraph: {
    title: "MailleMum - Créations artisanales en laine",
    description: "Découvrez nos créations artisanales uniques en laine : peluches, décorations et accessoires faits main avec passion.",
    url: 'https://www.maillemum.fr',
    siteName: 'MailleMum',
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'MailleMum - Créations artisanales en laine',
      },
    ],
    locale: 'fr_FR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MailleMum - Créations artisanales en laine',
    description: 'Découvrez nos créations artisanales uniques en laine : peluches, décorations et accessoires faits main avec passion.',
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
      <body className="font-sans bg-slate-50 text-slate-900">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <Analytics />
      </body>
    </html>
  );
}