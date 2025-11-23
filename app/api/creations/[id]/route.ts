import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import { checkAdminAuth } from "@/lib/auth";

async function checkAuth(req: NextRequest) {
  const session = await checkAdminAuth();
  return session !== null;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ok = await checkAuth(req);
    if (!ok) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    await connectToDatabase();
    const body = await req.json();

    const update: any = {};
    if (body.title !== undefined) update.title = body.title;
    if (body.description !== undefined) update.description = body.description;
    if (body.imageUrl !== undefined) update.imageUrl = body.imageUrl;
    if (body.images !== undefined) update.images = body.images;
    if (body.price !== undefined) update.price = body.price;
    if (body.color !== undefined) update.color = body.color;
    
    if (body.reserved !== undefined) update.reserved = body.reserved;
    if (body.reservedName !== undefined) update.reservedName = body.reservedName;
    if (body.reservedContact !== undefined) update.reservedContact = body.reservedContact;
    if (body.reservedMessage !== undefined) update.reservedMessage = body.reservedMessage;
    if (body.reservedAt !== undefined) update.reservedAt = body.reservedAt;

    const creation = await Creation.findByIdAndUpdate(id, update, {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ok = await checkAuth(req);
    if (!ok) return new NextResponse("Unauthorized", { status: 401 });

    const { id } = await params;
    await connectToDatabase();

    const deleted = await Creation.findByIdAndDelete(id);

    if (!deleted) {
      return new NextResponse("Not found", { status: 404 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}