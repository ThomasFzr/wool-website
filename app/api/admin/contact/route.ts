import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import "@/models/Creation"; // Import pour enregistrer le schéma
import { checkAdminAuth } from "@/lib/auth";
import { z } from "zod";
import { parseQuery } from "@/lib/validation";
import { CONTACT_STATUSES } from "@/models/Contact";

const querySchema = z.object({
  status: z.enum([...CONTACT_STATUSES, "all"], "Statut invalide.").optional(),
});

// GET : Récupérer tous les messages
export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const parsed = parseQuery(new URL(req.url).searchParams, querySchema);
    if (!parsed.ok) return parsed.response;
    const { status } = parsed.data;

    const query = status && status !== "all" ? { status } : {};

    const contacts = await Contact.find(query)
      .populate("creationId", "title imageUrl images description price color type reserved sold slug createdAt showAsNew")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(contacts);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}
