import { Header } from "@/components/Header";
import { Creation as CreationType } from "@/components/CreationCard";
import { HomeClient } from "./HomeClient";
import { connectToDatabase } from "@/lib/db";
import CreationModel from "@/models/Creation";
import Settings from "@/models/Settings";
import { getServerSession } from "next-auth";
import { authOptions } from "./api/auth/[...nextauth]/authOptions";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "MailleMum - Créations artisanales en laine",
  description: "Découvrez nos créations artisanales uniques en laine : peluches, décorations et accessoires faits main avec passion.",
  keywords: ["laine", "artisanat", "créations", "fait main", "peluches", "tricot", "crochet"],
  openGraph: {
    title: "MailleMum - Créations artisanales en laine",
    description: "Découvrez nos créations artisanales uniques en laine",
    type: "website",
    locale: "fr_FR",
  },
  robots: {
    index: true,
    follow: true,
  },
};

type SettingsType = {
  title: string;
  subtitle: string;
};

async function getCreations(): Promise<CreationType[]> {
  await connectToDatabase();
  const creations = await CreationModel.find()
    .sort({ displayOrder: -1, createdAt: -1 })
    .lean();
  
  return creations.map((c: any) => ({
    _id: c._id.toString(),
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl,
    images: c.images,
    price: c.price,
    color: c.color,
    reserved: c.reserved,
    sold: c.sold,
  }));
}

async function getSettings(): Promise<SettingsType | null> {
  await connectToDatabase();
  const settings = await Settings.findOne().lean();
  if (!settings) return null;
  
  const settingsData = settings as any;
  if (!settingsData?.title && !settingsData?.subtitle) return null;
  
  return {
    title: settingsData.title || "",
    subtitle: settingsData.subtitle || "",
  };
}

async function getAdminNotifications(role?: string) {
  if (role !== "admin") return { pendingReservations: 0, newMessages: 0 };

  try {
    await connectToDatabase();
    const Reservation = (await import("@/models/Reservation")).default;
    const Contact = (await import("@/models/Contact")).default;

    const [pendingReservations, newMessages] = await Promise.all([
      Reservation.countDocuments({ status: "pending" }),
      Contact.countDocuments({ status: "new" }),
    ]);

    return { pendingReservations, newMessages };
  } catch (err) {
    console.error(err);
    return { pendingReservations: 0, newMessages: 0 };
  }
}

export const revalidate = 300; // Revalider toutes les 5 minutes (300 secondes)

export default async function HomePage() {
  const [creations, settings, session] = await Promise.all([
    getCreations(),
    getSettings(),
    getServerSession(authOptions),
  ]);

  const { pendingReservations, newMessages } = await getAdminNotifications(
    session?.user?.role
  );

  return (
    <main className="min-h-screen">
      <Header
        title={settings?.title}
        subtitle={settings?.subtitle}
        pendingReservations={pendingReservations}
        newMessages={newMessages}
      />
      <HomeClient initialCreations={creations} />
    </main>
  );
}
