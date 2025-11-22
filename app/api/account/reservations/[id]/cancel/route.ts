import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

type RouteParams = { params: { id: string } };

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    await connectToDatabase();

    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { reason } = await req.json();

    const reservation = await Reservation.findById(params.id);

    if (!reservation) {
      return new NextResponse("Reservation not found", { status: 404 });
    }

    // ✅ sécurité : la réservation doit appartenir à l’utilisateur
    if (reservation.userEmail !== session.user.email) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // Si déjà validée, on refuse l’annulation
    if (reservation.status === "validated") {
      return new NextResponse(
        "Cette réservation est déjà validée et ne peut plus être annulée.",
        { status: 400 }
      );
    }

    // ✅ on passe en "cancelled" et on stocke la raison
    reservation.status = "cancelled";
    reservation.cancelReason = reason || "";
    await reservation.save();

    // ✅ on libère l’article pour qu’il puisse être réservé à nouveau
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

    return NextResponse.json(reservation);
  } catch (err) {
    console.error(err);
    return new NextResponse("Server error", { status: 500 });
  }
}