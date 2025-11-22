import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import Creation from "@/models/Creation";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    // 👇 Nouveauté Next 15 : params est async
    const { id } = await context.params;

    // 🔐 Vérifier la session
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectToDatabase();

    const { reason } = await req.json();

    // On récupère la réservation de l'utilisateur courant
    const reservation = await Reservation.findOne({
      _id: id,
      userId: (session.user as any).id, // tu as déjà stocké userId dans la réservation
    }).populate("creationId");

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    // Si déjà validée côté admin → on ne laisse plus annuler
    if (reservation.status === "validated") {
      return NextResponse.json(
        { error: "Cette commande est déjà validée, impossible de l'annuler." },
        { status: 400 }
      );
    }

    // 📝 On marque la réservation comme annulée + raison
    reservation.status = "cancelled";
    (reservation as any).cancelReason = reason ?? "";
    await reservation.save();

    // 🔓 Si la création n'est pas vendue, on la libère pour quelqu'un d'autre
    const creation: any = reservation.creationId;
    if (creation && !creation.sold) {
      await Creation.findByIdAndUpdate(creation._id, {
        $set: { reserved: false },
        $unset: {
          reservedName: "",
          reservedContact: "",
          reservedMessage: "",
          reservedAt: "",
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}