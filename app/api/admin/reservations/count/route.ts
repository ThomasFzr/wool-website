import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import Reservation from "@/models/Reservation";
import { checkAdminAuth } from "@/lib/auth";

export async function GET() {
  try {
    const session = await checkAdminAuth();
    if (!session) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    await connectToDatabase();

    // Compter les sessions Stripe uniques (commandes) plutôt que les réservations
    // individuelles — distinct côté Mongo, en parallèle, sans charger les documents
    const [newSessions, pendingSessions] = await Promise.all([
      Reservation.distinct("stripeCheckoutSessionId", {
        paymentStatus: "paid",
        seenByAdmin: { $ne: true },
      }),
      Reservation.distinct("stripeCheckoutSessionId", {
        paymentStatus: "paid",
        status: { $in: ["pending", "preparing"] },
      }),
    ]);

    return NextResponse.json({
      pending: pendingSessions.filter((id) => id != null).length,
      new: newSessions.filter((id) => id != null).length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}