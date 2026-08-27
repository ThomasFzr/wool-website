import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";
import { generateUniqueSlug } from "@/lib/slug";

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
      const slug = await generateUniqueSlug(creation.title, creation._id.toString());
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
