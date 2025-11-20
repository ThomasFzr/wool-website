import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";

type RouteParams = { params: { id: string } };

export async function PATCH(req: Request, { params }: any) {
  try {
    await connectToDatabase();
    const body = await req.json();

    const reservation = await Reservation.findByIdAndUpdate(
      params.id,
      body,
      { new: true }
    );

    if (!reservation)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json(reservation);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteParams
) {
  try {
    await connectToDatabase();

    // 1) Récupérer la réservation
    const reservation = await Reservation.findById(params.id);

    if (!reservation) {
      return new NextResponse("Reservation not found", { status: 404 });
    }

    // 2) Si elle avait une création liée, la libérer
    if (reservation.creationId) {
      await Creation.findByIdAndUpdate(reservation.creationId, {
        $set: { reserved: false },
        $unset: {
          reservedName: "",
          reservedContact: "",
          reservedMessage: "",
          reservedAt: "",
        },
      });
    }

    // 3) Supprimer la réservation
    await Reservation.findByIdAndDelete(params.id);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}