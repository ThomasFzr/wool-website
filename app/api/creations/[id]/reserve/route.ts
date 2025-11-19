import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Creation from "@/models/Creation";
import Reservation from "@/models/Reservation";

export async function POST(req: Request, { params }: any) {
  try {
    await connectToDatabase();

    const { name, contact, message } = await req.json();
    if (!name || !contact) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const creation = await Creation.findById(params.id);
    if (!creation) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (creation.reserved) {
      return NextResponse.json({ error: "Already reserved" }, { status: 409 });
    }

    // 1️⃣ Créer une réservation
    const reservation = await Reservation.create({
      creationId: creation._id,
      name,
      contact,
      message,
      status: "pending",
    });

    // 2️⃣ Marquer l’article réservé
    creation.reserved = true;
    await creation.save();

    return NextResponse.json({ success: true, reservation }, { status: 200 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}