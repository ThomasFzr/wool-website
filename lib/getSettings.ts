import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";

export type SiteSettings = {
  title?: string;
  subtitle?: string;
  colors?: string[];
  types?: string[];
  shippingCost?: number;
  pickupConditions?: {
    enabled: boolean;
    minimumAmount: number;
    allowedPostalCodes: string[];
    message: string;
  };
  systemPrompt?: string;
};

/**
 * Récupère les settings côté serveur (objet JSON plain, sans document Mongoose).
 * Retourne null si aucun settings n'existe ou en cas d'erreur.
 */
export async function getSettings(): Promise<SiteSettings | null> {
  try {
    await connectToDatabase();
    const settings = await Settings.findOne().lean();
    if (!settings) return null;

    const data = settings as any;
    return {
      title: data.title,
      subtitle: data.subtitle,
      colors: data.colors,
      types: data.types,
      shippingCost: data.shippingCost,
      pickupConditions: data.pickupConditions
        ? {
            enabled: data.pickupConditions.enabled ?? false,
            minimumAmount: data.pickupConditions.minimumAmount ?? 0,
            allowedPostalCodes: data.pickupConditions.allowedPostalCodes ?? [],
            message: data.pickupConditions.message ?? "",
          }
        : undefined,
      systemPrompt: data.systemPrompt,
    };
  } catch (error) {
    console.error("Erreur lors du chargement des settings:", error);
    return null;
  }
}
