import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";

export async function GET() {
  try {
    await connectToDatabase();
    const creations = await Creation.find().sort({ createdAt: -1 }).lean();
    return NextResponse.json(creations);
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminPassword = process.env.ADMIN_PASSWORD;
    const headerPassword = req.headers.get("x-admin-password");

    if (!adminPassword || headerPassword !== adminPassword) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();
    const body = await req.json();

    // Sécurise le tableau d'images
    const images: string[] =
      Array.isArray(body.images) && body.images.length
        ? body.images
        : body.imageUrl
          ? [body.imageUrl]
          : [];

    const creation = await Creation.create({
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl ?? images[0] ?? undefined,
      images,
      price: body.price,
      color: body.color,

    });

    return NextResponse.json(creation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}