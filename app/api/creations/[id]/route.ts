import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";

async function checkAuth(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const headerPassword = req.headers.get("x-admin-password");

  if (!adminPassword || headerPassword !== adminPassword) {
    return false;
  }
  return true;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ok = await checkAuth(req);
    if (!ok) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDatabase();
    const body = await req.json();

    const update: any = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl;
    if (body.price !== undefined) update.price = body.price;

    const creation = await Creation.findByIdAndUpdate(params.id, update, {
      new: true,
    });

    if (!creation) {
      return new NextResponse("Not found", { status: 404 });
    }

    return NextResponse.json(creation);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ok = await checkAuth(req);
    if (!ok) return new NextResponse("Unauthorized", { status: 401 });

    await connectToDatabase();
    const deleted = await Creation.findByIdAndDelete(params.id);

    if (!deleted) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}