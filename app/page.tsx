import { Header } from "@/components/Header";
import { Creation as CreationType } from "@/components/CreationCard";
import { HomeClient } from "./HomeClient";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";
import Settings from "@/models/Settings";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "MailleMum - Créations tricotées à la main",
  description: "Découvrez nos créations tricotées à la main : tours de cou, bandeaux et bonnets faits main avec passion.",
  keywords: ["maille", "artisanat", "créations", "fait main", "tour de cou", "bandeau", "bonnet", "tricot", "crochet"],
  openGraph: {
    title: "MailleMum - Créations tricotées à la main",
    description: "Découvrez nos créations tricotées à la main : tours de cou, bandeaux et bonnets faits main avec passion.",
    type: "website",
    locale: "fr_FR",
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'MailleMum - Créations tricotées à la main',
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

type SettingsType = {
  title: string;
  subtitle: string;
  colors?: string[];
  types?: string[];
};

async function getCreations(): Promise<CreationType[]> {
  // Tolérant aux pannes : si la DB est injoignable (notamment au build, où la
  // page est prérendue en ISR), on rend une vitrine vide plutôt que d'échouer —
  // le revalidate de 5 min la remplira dès que la DB répond.
  let creations: any[];
  try {
    await connectToDatabase();
    creations = await CreationModel.find({ hidden: { $ne: true } })
      .sort({ displayOrder: -1, createdAt: -1 })
      .lean();
  } catch (err) {
    console.error("Erreur lors du chargement des créations:", err);
    return [];
  }

  return creations.map((c: any) => ({
    _id: c._id.toString(),
    slug: c.slug,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    images: c.images,
    price: c.price,
    color: c.color,
    type: c.type,
    sold: c.sold,
    reserved: c.reserved,
    showAsNew: c.showAsNew,
    createdAt: c.createdAt?.toISOString(),
    visibleAt: c.visibleAt?.toISOString(),
  }));
}

async function getSettings(): Promise<SettingsType | null> {
  let settings;
  try {
    await connectToDatabase();
    settings = await Settings.findOne().lean();
  } catch (err) {
    console.error("Erreur lors du chargement des settings:", err);
    return null;
  }
  if (!settings) return null;
  
  const settingsData = settings as any;
  if (!settingsData?.title && !settingsData?.subtitle) return null;
  
  // Supprimer les doublons et trier les couleurs alphabétiquement (multicolore en dernier)
  const colors: string[] = settingsData.colors || [];
  const uniqueColors = [...new Set(colors)];
  const sortedColors = uniqueColors
    .filter(c => c !== "multicolore")
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .concat(uniqueColors.filter(c => c === "multicolore"));
  
  // Trier les types alphabétiquement
  const types: string[] = settingsData.types || [];
  const uniqueTypes = [...new Set(types)];
  const sortedTypes = uniqueTypes.sort((a, b) => a.localeCompare(b, 'fr'));
  
  return {
    title: settingsData.title || "",
    subtitle: settingsData.subtitle || "",
    colors: sortedColors,
    types: sortedTypes,
  };
}

export const revalidate = 300; // Revalider toutes les 5 minutes (300 secondes)

export default async function HomePage() {
  const [creations, settings] = await Promise.all([
    getCreations(),
    getSettings(),
  ]);

  return (
    <main className="min-h-screen">
      <Header
        title={settings?.title}
        subtitle={settings?.subtitle}
      />
      <h1 className="sr-only">
        {settings?.title || "MailleMum - Créations tricotées à la main"}
      </h1>
      <HomeClient 
        initialCreations={creations}
        availableColors={settings?.colors || []}
        availableTypes={settings?.types || []}
      />
    </main>
  );
}
