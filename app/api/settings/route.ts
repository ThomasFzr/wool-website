import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Settings from "@/models/Settings";
import { checkAdminAuth } from "@/lib/auth";

const DEFAULT_SETTINGS = {
  title: "Les créations en laine de maman 🧶",
  subtitle: "Clique sur une création pour voir toutes les photos.",
};

export async function GET() {
  try {
    await connectToDatabase();
    const doc = (await Settings.findById("main").lean()) as
      | { title?: string; subtitle?: string }
      | null;

    if (!doc) {
      return NextResponse.json({ _id: "main", ...DEFAULT_SETTINGS });
    }

    return NextResponse.json({
      _id: "main",
      title: doc.title ?? DEFAULT_SETTINGS.title,
      subtitle: doc.subtitle ?? DEFAULT_SETTINGS.subtitle,
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

    const updated = await Settings.findByIdAndUpdate(
      "main",
      {
        title: body.title,
        subtitle: body.subtitle,
      },
      { new: true, upsert: true }
    );

    return NextResponse.json(updated);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}