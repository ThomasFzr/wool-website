import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";
import { checkAdminAuth } from "@/lib/auth";

const DEFAULT_SYSTEM_PROMPT = `Tu es un expert en copywriting pour "MailleMum", une boutique de créations artisanales tricotées main.
Rédige une description produit optimisée SEO (environ 150 mots).
Ton : Chaleureux, artisanal, authentique, mettant en avant le fait-main français.
Formatage : Utilise du HTML simple (<p>, <strong>) pour aérer le texte.

RÈGLES STRICTES : 
- Si la matière fournie contient "acrylique", "synthétique" ou "polyester", il est INTERDIT d'utiliser le mot "laine". Utilise à la place : "maille", "fil doux", "tricot", "fibre".
- Si la matière est "laine", "alpaga" ou "mérinos", tu peux utiliser le mot "laine".
- INTERDICTION ABSOLUE : Ne mentionne JAMAIS la marque de laine ou de fil utilisée dans la description. Parle uniquement de la qualité du fil, de sa douceur, de sa texture, mais jamais de sa marque commerciale.`;

const DEFAULT_SETTINGS = {
  title: "Les créations en laine de maman",
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
      return NextResponse.json({ _id: "main", ...DEFAULT_SETTINGS });
    }

    return NextResponse.json({
      _id: "main",
      title: doc.title ?? DEFAULT_SETTINGS.title,
      subtitle: doc.subtitle ?? DEFAULT_SETTINGS.subtitle,
      colors: doc.colors ?? DEFAULT_SETTINGS.colors,
      types: doc.types ?? DEFAULT_SETTINGS.types,
      shippingCost: doc.shippingCost ?? DEFAULT_SETTINGS.shippingCost,
      pickupConditions: doc.pickupConditions ?? DEFAULT_SETTINGS.pickupConditions,
      systemPrompt: doc.systemPrompt ?? DEFAULT_SETTINGS.systemPrompt,
    });
  } catch (err) {
    console.error(err);
    // en cas d’erreur, on renvoie les valeurs par défaut
    return NextResponse.json({ _id: "main", ...DEFAULT_SETTINGS });
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

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}