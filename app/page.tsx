import { Header } from "@/components/Header";
import { Creation as CreationType } from "@/components/CreationCard";
import { HomeClient } from "./HomeClient";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";
import Settings from "@/models/Settings";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "MailleMum - Créations artisanales en laine",
  description: "Découvrez nos créations artisanales en laine : tours de cou, bandeaux et bonnets faits main avec passion.",
  keywords: ["laine", "artisanat", "créations", "fait main", "tour de cou", "bandeau", "bonnet", "tricot", "crochet"],
  openGraph: {
    title: "MailleMum - Créations artisanales en laine",
    description: "Découvrez nos créations artisanales en laine : tours de cou, bandeaux et bonnets faits main avec passion.",
    type: "website",
    locale: "fr_FR",
    images: [
      {
        url: '/images/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'MailleMum - Créations artisanales en laine',
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
  await connectToDatabase();
  const creations = await CreationModel.find()
    .sort({ displayOrder: -1, createdAt: -1 })
    .lean();
  
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
    reserved: c.reserved,
    sold: c.sold,
    showAsNew: c.showAsNew,
    createdAt: c.createdAt?.toISOString(),
  }));
}

async function getSettings(): Promise<SettingsType | null> {
  await connectToDatabase();
  const settings = await Settings.findOne().lean();
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
      <HomeClient 
        initialCreations={creations}
        availableColors={settings?.colors || []}
        availableTypes={settings?.types || []}
      />
    </main>
  );
}
