import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Contact from "@/models/Contact";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

// GET : Récupérer tous les messages
export async function GET(req: NextRequest) {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const query = status && status !== "all" ? { status } : {};

    const contacts = await Contact.find(query)
      .populate("creationId", "title imageUrl images")
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(contacts);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}
