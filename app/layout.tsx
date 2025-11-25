import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
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
      </body>
    </html>
  );
}