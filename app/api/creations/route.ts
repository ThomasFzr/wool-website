import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

export async function GET() {
  try {
    await connectToDatabase();
    const creations = await Creation.find().sort({ displayOrder: -1, createdAt: -1 }).lean();
    return NextResponse.json(creations);
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
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

    const images: string[] =
      Array.isArray(body.images) && body.images.length
        ? body.images
        : body.imageUrl
        ? [body.imageUrl]
        : [];

    const imagePublicIds: string[] =
      Array.isArray(body.imagePublicIds) && body.imagePublicIds.length
        ? body.imagePublicIds
        : [];

    const creation = await Creation.create({
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl ?? images[0] ?? undefined,
      images,
      imagePublicIds,
      price: body.price,
      color: body.color,
    });

    return NextResponse.json(creation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}