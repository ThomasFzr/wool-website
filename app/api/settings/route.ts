import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";
import { checkAdminAuth } from "@/lib/auth";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/prompts";

const DEFAULT_SETTINGS = {
  title: "Les créations de maman",
  subtitle: "Clique sur une création pour voir toutes les photos.",
  colors: [
    "Blanc",
    "Noir",
    "Gris",
    "Beige",
    "Marron",
    "Rouge",
    "Rose",
    "Rose poudré",
    "Orange",
    "Jaune",
    "Vert",
    "Bleu",
    "Bleu marine",
    "Violet",
    "Multicolore",
  ],
  types: ["bonnet", "tour de cou", "bandeau"],
  shippingCost: 5,
  pickupConditions: {
    enabled: false,
    minimumAmount: 0,
    allowedPostalCodes: [],
    message: "",
  },
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

export async function GET() {
  try {
    await connectToDatabase();

    // Le prompt système IA est une configuration interne : réservé aux admins
    const isAdmin = (await checkAdminAuth()) !== null;

    const doc = (await Settings.findById("main").lean()) as
      | { 
          title?: string; 
          subtitle?: string; 
          colors?: string[]; 
          types?: string[]; 
          shippingCost?: number;
          pickupConditions?: {
            enabled?: boolean;
            minimumAmount?: number;
            allowedPostalCodes?: string[];
            message?: string;
          };
          systemPrompt?: string;
        }
      | null;

    if (!doc) {
      const { systemPrompt: _prompt, ...publicDefaults } = DEFAULT_SETTINGS;
      return NextResponse.json({
        _id: "main",
        ...publicDefaults,
        ...(isAdmin ? { systemPrompt: DEFAULT_SETTINGS.systemPrompt } : {}),
      });
    }

    return NextResponse.json({
      _id: "main",
      title: doc.title ?? DEFAULT_SETTINGS.title,
      subtitle: doc.subtitle ?? DEFAULT_SETTINGS.subtitle,
      colors: doc.colors ?? DEFAULT_SETTINGS.colors,
      types: doc.types ?? DEFAULT_SETTINGS.types,
      shippingCost: doc.shippingCost ?? DEFAULT_SETTINGS.shippingCost,
      pickupConditions: doc.pickupConditions ?? DEFAULT_SETTINGS.pickupConditions,
      ...(isAdmin ? { systemPrompt: doc.systemPrompt ?? DEFAULT_SETTINGS.systemPrompt } : {}),
    });
  } catch (err) {
    console.error(err);
    // en cas d’erreur, on renvoie les valeurs par défaut (sans le prompt interne)
    const { systemPrompt: _prompt, ...publicDefaults } = DEFAULT_SETTINGS;
    return NextResponse.json({ _id: "main", ...publicDefaults });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();
    const body = await req.json();

    // Préparer les données de mise à jour
    const updateData: any = {
      title: body.title,
      subtitle: body.subtitle,
      colors: body.colors,
      types: body.types,
      shippingCost: body.shippingCost,
      systemPrompt: body.systemPrompt,
    };

    // Gérer pickupConditions séparément pour s'assurer que tous les champs sont bien sauvegardés
    if (body.pickupConditions) {
      updateData.pickupConditions = {
        enabled: body.pickupConditions.enabled ?? false,
        minimumAmount: body.pickupConditions.minimumAmount ?? 0,
        allowedPostalCodes: body.pickupConditions.allowedPostalCodes ?? [],
        message: body.pickupConditions.message ?? "",
      };
    } else {
      updateData.pickupConditions = DEFAULT_SETTINGS.pickupConditions;
    }

    const updated = await Settings.findByIdAndUpdate(
      "main",
      { $set: updateData },
      { new: true, upsert: true }
    );

    // La home (ISR) affiche titre/sous-titre/couleurs : invalider son cache
    revalidatePath("/");

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}