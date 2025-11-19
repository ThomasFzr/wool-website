import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";

type RouteParams = {
  params: { id: string };
};

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();
    const { name, contact, message } = await req.json();

    if (!name || !contact) {
      return new NextResponse("Nom et contact obligatoires", { status: 400 });
    }

    const creation = await Creation.findById(params.id);
    if (!creation) {
      return new NextResponse("Création introuvable", { status: 404 });
    }

    if (creation.reserved) {
      return new NextResponse("Article déjà réservé", { status: 409 });
    }

    creation.reserved = true;
    creation.reservedName = name;
    creation.reservedContact = contact;
    creation.reservedMessage = message;
    creation.reservedAt = new Date();

    await creation.save();

    return NextResponse.json(
      {
        _id: creation._id,
        reserved: creation.reserved,
        reservedAt: creation.reservedAt,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error(err);
    return new NextResponse("DB error", { status: 500 });
  }
}