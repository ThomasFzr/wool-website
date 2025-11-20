import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";


export async function POST(req: NextRequest, { params }: any) {
  try {
    await connectToDatabase();

    const creationId = params.id;            // ← ID de l'article
    const { name, contact, message } = await req.json();

    const creation = await Creation.findById(creationId);
    if (!creation) {
      return new NextResponse("Création introuvable", { status: 404 });
    }

    if (creation.reserved) {
      return new NextResponse("Déjà réservé", { status: 409 });
    }

    // ✅ on enregistre creationId dans la réservation
    const reservation = await Reservation.create({
      creationId,
      name,
      contact,
      message,
      status: "pending",
    });

    // mise à jour de la création
    creation.reserved = true;
    creation.reservedName = name;
    creation.reservedContact = contact;
    creation.reservedMessage = message;
    creation.reservedAt = new Date();
    await creation.save();

    return NextResponse.json(reservation, { status: 201 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}