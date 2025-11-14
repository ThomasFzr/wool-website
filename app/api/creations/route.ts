import { NextResponse, NextRequest } from "next/server";
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

    const body = await req.json();
    await connectToDatabase();

    const creation = await Creation.create({
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl,
      price: Number(body.price),
    });

    return NextResponse.json(creation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}