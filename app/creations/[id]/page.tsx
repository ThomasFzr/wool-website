import { Metadata } from "next";
import { notFound } from "next/navigation";
import mongoose from "mongoose";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";
import { Header } from "@/components/Header";
import { CreationDetail } from "./CreationDetail";

type Props = {
  params: Promise<{ id: string }>;
};

async function getCreation(slug: string) {
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
  
  // Si pas d'articles liés, récupérer d'autres créations similaires (même type ou couleur, non vendues)
  if (relatedCreations.length === 0) {
    const targetLimit = 5;
    const currentId = creationData._id;
    const excludeIds: mongoose.Types.ObjectId[] = [];
    
    // Essayer d'abord par type si disponible
    if (creationData.type) {
      const byType = await CreationModel.find({
        _id: { $ne: currentId },
        sold: { $ne: true },
        hidden: { $ne: true },
        type: creationData.type,
      })
        .select('title imageUrl images price color type slug sold hidden')
        .sort({ displayOrder: -1, createdAt: -1 })
        .limit(targetLimit)
        .lean();
      
      if (byType.length > 0) {
        relatedCreations = byType.map((item: any) => ({
          _id: item._id.toString(),
          title: item.title,
          imageUrl: item.imageUrl,
          images: item.images,
          price: item.price,
          color: item.color,
          type: item.type,
          slug: item.slug,
        }));
        excludeIds.push(...byType.map((item: any) => item._id));
      }
    }
    
    // Si pas assez de résultats, compléter par couleur
    if (relatedCreations.length < targetLimit && creationData.color) {
      const query: any = {
        sold: { $ne: true },
        hidden: { $ne: true },
        color: creationData.color,
      };
      
      if (excludeIds.length > 0) {
        query._id = { $ne: currentId, $nin: excludeIds };
      } else {
        query._id = { $ne: currentId };
      }
      
      const byColor = await CreationModel.find(query)
        .select('title imageUrl images price color type slug sold hidden')
        .sort({ displayOrder: -1, createdAt: -1 })
        .limit(targetLimit - relatedCreations.length)
        .lean();
      
      if (byColor.length > 0) {
        relatedCreations = [
          ...relatedCreations,
          ...byColor.map((item: any) => ({
            _id: item._id.toString(),
            title: item.title,
            imageUrl: item.imageUrl,
            images: item.images,
            price: item.price,
            color: item.color,
            type: item.type,
            slug: item.slug,
          }))
        ];
        excludeIds.push(...byColor.map((item: any) => item._id));
      }
    }
    
    // Si toujours pas assez (ou si ni type ni couleur ne sont définis), prendre n'importe quelles autres créations non vendues
    if (relatedCreations.length < targetLimit) {
      const query: any = {
        sold: { $ne: true },
        hidden: { $ne: true },
      };
      
      if (excludeIds.length > 0) {
        query._id = { $ne: currentId, $nin: excludeIds };
      } else {
        query._id = { $ne: currentId };
      }
      
      const others = await CreationModel.find(query)
        .select('title imageUrl images price color type slug sold hidden')
        .sort({ displayOrder: -1, createdAt: -1 })
        .limit(targetLimit - relatedCreations.length)
        .lean();
      
      if (others.length > 0) {
        relatedCreations = [
          ...relatedCreations,
          ...others.map((item: any) => ({
            _id: item._id.toString(),
            title: item.title,
            imageUrl: item.imageUrl,
            images: item.images,
            price: item.price,
            color: item.color,
            type: item.type,
            slug: item.slug,
          }))
        ];
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
    relatedCreations,
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

  // Utiliser seoDescription si disponible, sinon description, sinon description par défaut
  const metaDescription = creation.seoDescription 
    ? creation.seoDescription.replace(/<[^>]*>/g, '').substring(0, 160) // Retirer le HTML et limiter à 160 caractères
    : creation.description || `${creation.title} - Création artisanale en laine fait main`;

  return {
    title: `${creation.title} - MailleMum`,
    description: metaDescription,
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
      description: metaDescription,
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
