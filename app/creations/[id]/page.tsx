import { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";
import { Header } from "@/components/Header";
import { CreationDetail } from "./CreationDetail";

type Props = {
  params: Promise<{ id: string }>;
};

/**
 * Nettoie et tronque une description pour la meta description SEO
 * - Enlève les balises HTML
 * - Tronque à 160 caractères maximum
 * - Ajoute "..." si le texte est tronqué
 */
function cleanDescriptionForSEO(text: string | undefined | null): string {
  if (!text) return "";
  
  // Enlever les balises HTML
  let cleaned = text.replace(/<[^>]*>/g, "");
  
  // Remplacer les entités HTML courantes
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  // Nettoyer les espaces multiples
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  
  // Tronquer à 160 caractères
  if (cleaned.length > 160) {
    // Tronquer à 157 caractères pour laisser la place aux "..."
    cleaned = cleaned.substring(0, 157).trim() + "...";
  }
  
  return cleaned;
}

// cache() évite le double appel DB (generateMetadata + page) pour une même requête
const getCreation = cache(async (slug: string) => {
  await connectToDatabase();
  // Essayer d'abord par slug, sinon par ID (rétrocompatibilité)
  // Exclure les créations cachées pour les utilisateurs publics
  let creation = await CreationModel.findOne({ slug, hidden: { $ne: true } })
    .populate('relatedCreations', 'title imageUrl images price color type slug sold hidden')
    .lean();
  if (!creation && mongoose.Types.ObjectId.isValid(slug)) {
    creation = await CreationModel.findOne({ _id: slug, hidden: { $ne: true } })
      .populate('relatedCreations', 'title imageUrl images price color type slug sold hidden')
      .lean();
  }
  
  if (!creation) return null;
  
  const creationData: any = creation;
  const creationId = creationData._id.toString();
  
  // Formater les articles liés (exclure les créations cachées et vendues)
  let relatedCreations = Array.isArray(creationData.relatedCreations)
    ? creationData.relatedCreations
        .filter((item: any) => item && !item.sold && !item.hidden && item._id.toString() !== creationId)
        .map((item: any) => ({
          _id: item._id.toString(),
          title: item.title,
          imageUrl: item.imageUrl,
          images: item.images,
          price: item.price,
          color: item.color,
          type: item.type,
          slug: item.slug,
        }))
    : [];
  
  // Si pas d'articles liés, récupérer d'autres créations avec la même couleur uniquement
  if (relatedCreations.length === 0) {
    const targetLimit = 5;
    const currentId = creationData._id;
    
    // Proposer uniquement les articles avec la même couleur
    if (creationData.color) {
      const byColor = await CreationModel.find({
        _id: { $ne: currentId },
        sold: { $ne: true },
        hidden: { $ne: true },
        color: creationData.color,
      })
        .select('title imageUrl images price color type slug sold hidden yarnBrand')
        .sort({ displayOrder: -1, createdAt: -1 })
        .limit(targetLimit)
        .lean();
      
      if (byColor.length > 0) {
        relatedCreations = byColor.map((item: any) => ({
          _id: item._id.toString(),
          title: item.title,
          imageUrl: item.imageUrl,
          images: item.images,
          price: item.price,
          color: item.color,
          type: item.type,
          slug: item.slug,
        }));
      }
    }
  }
  
  return {
    _id: creationId,
    slug: creationData.slug,
    title: creationData.title,
    description: creationData.description,
    seoDescription: creationData.seoDescription,
    imageUrl: creationData.imageUrl,
    images: creationData.images,
    price: creationData.price,
    color: creationData.color,
    type: creationData.type,
    sold: creationData.sold,
    showAsNew: creationData.showAsNew,
    createdAt: creationData.createdAt ? creationData.createdAt.toString() : undefined,
    visibleAt: creationData.visibleAt ? creationData.visibleAt.toString() : undefined,
    relatedCreations,
  };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const creation = await getCreation(id);
  
  if (!creation) {
    return {
      title: "Article non trouvé - MailleMum",
    };
  }

  // Récupérer les images : priorité à seoDescription puis description
  const images = creation.images && creation.images.length > 0 
    ? creation.images 
    : creation.imageUrl 
      ? [creation.imageUrl] 
      : [];

  const imageUrl = images[0] || '/images/og-image.jpg';
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://maillemum.fr';

  // Utiliser seoDescription si disponible, sinon description, sinon description par défaut
  const rawDescription = creation.seoDescription || creation.description;
  const metaDescription = rawDescription
    ? cleanDescriptionForSEO(rawDescription)
    : `${creation.title} - Création artisanale fait main`;

  // Format du titre : juste le nom du produit (Next.js ajoute " | MailleMum" via le template du layout)
  const pageTitle = creation.title;

  return {
    title: pageTitle,
    description: metaDescription,
    keywords: [
      "artisanat",
      "fait main",
      creation.type || "",
      creation.color || "",
      "tricot",
      "crochet",
    ].filter(Boolean),
    openGraph: {
      title: pageTitle,
      description: metaDescription,
      type: "website",
      locale: "fr_FR",
      url: `${baseUrl}/creations/${creation.slug || id}`,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: creation.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description: metaDescription,
      images: [imageUrl],
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
