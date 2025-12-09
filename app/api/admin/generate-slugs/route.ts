import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

/**
 * Génère un slug à partir d'un titre
 */
function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    const creations = await Creation.find({ slug: { $exists: false } });
    const results = [];

    for (const creation of creations) {
      let baseSlug = generateSlug(creation.title);
      let slug = baseSlug;
      let counter = 1;

      while (await Creation.findOne({ slug, _id: { $ne: creation._id } })) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      creation.slug = slug;
      await creation.save();
      results.push({ title: creation.title, slug });
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      slugs: results,
    });
  } catch (error: any) {
    console.error("Error generating slugs:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
