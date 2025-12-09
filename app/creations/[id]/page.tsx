import { Metadata } from "next";
import { notFound } from "next/navigation";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";
import { Header } from "@/components/Header";
import { CreationDetail } from "./CreationDetail";

type Props = {
  params: Promise<{ id: string }>;
};

async function getCreation(id: string) {
  await connectToDatabase();
  const creation = await CreationModel.findById(id).lean();
  
  if (!creation) return null;
  
  const creationData: any = creation;
  
  return {
    _id: creationData._id.toString(),
    title: creationData.title,
    description: creationData.description,
    imageUrl: creationData.imageUrl,
    images: creationData.images,
    price: creationData.price,
    color: creationData.color,
    type: creationData.type,
    reserved: creationData.reserved,
    sold: creationData.sold,
    showAsNew: creationData.showAsNew,
    createdAt: creationData.createdAt ? creationData.createdAt.toString() : undefined,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const creation = await getCreation(id);
  
  if (!creation) {
    return {
      title: "Article non trouvé - MailleMum",
    };
  }

  const images = creation.images && creation.images.length > 0 
    ? creation.images 
    : creation.imageUrl 
      ? [creation.imageUrl] 
      : [];

  const imageUrl = images[0] || '/images/og-image.jpg';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://maille-mum.fr';

  return {
    title: `${creation.title} - MailleMum`,
    description: creation.description || `${creation.title} - Création artisanale en laine fait main`,
    keywords: [
      "laine",
      "artisanat",
      "fait main",
      creation.type || "",
      creation.color || "",
      "tricot",
      "crochet",
    ].filter(Boolean),
    openGraph: {
      title: `${creation.title} - MailleMum`,
      description: creation.description || `${creation.title} - Création artisanale en laine fait main`,
      type: "website",
      locale: "fr_FR",
      url: `${baseUrl}/creations/${id}`,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: creation.title,
        },
      ],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function CreationPage({ params }: Props) {
  const { id } = await params;
  const creation = await getCreation(id);
  
  if (!creation) {
    notFound();
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-linear-to-br from-slate-50 via-pink-50/30 to-slate-50">
        <CreationDetail creation={creation} />
      </main>
    </>
  );
}
