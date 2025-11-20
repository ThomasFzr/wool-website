import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";

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

    // ✅ Si on passe en "validated", on marque l'article comme vendu
    if (body.status === "validated" && reservation.creationId) {
      await Creation.findByIdAndUpdate(reservation.creationId, {
        $set: {
          sold: true,
          reserved: false, // il n'est plus juste réservé, il est vendu
        },
      });
    }

    return NextResponse.json(reservation);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: any
) {
  try {
    await connectToDatabase();

    const reservation = await Reservation.findById(params.id);

    if (!reservation) {
      return new NextResponse("Reservation not found", { status: 404 });
    }

    // Si la réservation concernait un article, on libère l'article
    if (reservation.creationId) {
      // Cas le plus logique : on supprime surtout des réservations "pending"
      await Creation.findByIdAndUpdate(reservation.creationId, {
        $set: {
          reserved: false,
        },
        $unset: {
          reservedName: "",
          reservedContact: "",
          reservedMessage: "",
          reservedAt: "",
        },
      });
      // on NE touche PAS à `sold` ici → si un jour tu supprimes une résa "validated",
      // l'article reste vendu. À toi de voir comment tu l'utilises.
    }

    await Reservation.findByIdAndDelete(params.id);

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}